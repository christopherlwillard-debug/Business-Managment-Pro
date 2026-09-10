import { pool } from "@workspace/db";
import * as schema from "@workspace/db/schema";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";

type RequiredColumn = {
  table: string;
  column: string;
  migration?: string;
};

const migrationHints: Record<string, string> = {
  // 0047_business_ownership_backfill.sql
  "clients.business_id": "0047_business_ownership_backfill.sql",
  "jobs.business_id": "0047_business_ownership_backfill.sql",
  "invoices.business_id": "0047_business_ownership_backfill.sql",
  "estimates.business_id": "0047_business_ownership_backfill.sql",
  "prospects.business_id": "0047_business_ownership_backfill.sql",
  "assets.business_id": "0047_business_ownership_backfill.sql",
  // 0048_financial_correction_history.sql
  "expenses.voided_at": "0048_financial_correction_history.sql",
  "expenses.void_reason": "0048_financial_correction_history.sql",
  "other_income.voided_at": "0048_financial_correction_history.sql",
  "other_income.void_reason": "0048_financial_correction_history.sql",
  "owner_capital_entries.voided_at": "0048_financial_correction_history.sql",
  "owner_capital_entries.void_reason": "0048_financial_correction_history.sql",
  "mileage_logs.voided_at": "0048_financial_correction_history.sql",
  "mileage_logs.void_reason": "0048_financial_correction_history.sql",
  "sub_payment_records.reversal_reason": "0048_financial_correction_history.sql",
  "invoices.voided_at": "0048_financial_correction_history.sql",
  "invoices.void_reason": "0048_financial_correction_history.sql",
  // 0069_financial_business_ownership.sql
  "estimated_tax_payments.business_id": "0069_financial_business_ownership.sql",
  "sub_payment_records.business_id": "0069_financial_business_ownership.sql",
  "payments.business_id": "0069_financial_business_ownership.sql",
  "square_payments.business_id": "0069_financial_business_ownership.sql",
};

function getRequiredColumns(): RequiredColumn[] {
  return Object.values(schema)
    .filter((value): value is PgTable => is(value, PgTable))
    .flatMap((table) => {
      const config = getTableConfig(table);
      return config.columns.map(({ name: column }) => {
        const key = `${config.name}.${column}`;
        return {
          table: config.name,
          column,
          migration: migrationHints[key],
        };
      });
    });
}

async function checkDevelopmentSchema() {
  const requiredColumns = getRequiredColumns();
  const duplicateTokens = await pool.query<{
    pay_token: string;
    invoice_ids: number[];
    duplicate_count: string;
  }>(
    `
      SELECT pay_token, ARRAY_AGG(id ORDER BY id) AS invoice_ids, COUNT(*) AS duplicate_count
      FROM invoices
      WHERE pay_token IS NOT NULL
      GROUP BY pay_token
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC, pay_token
      LIMIT 20
    `,
  );

  if (duplicateTokens.rows.length > 0) {
    const details = duplicateTokens.rows
      .map(({ pay_token, invoice_ids, duplicate_count }) =>
        `  ${JSON.stringify(pay_token)} (${duplicate_count} invoices: ${invoice_ids.join(", ")})`,
      )
      .join("\n");

    throw new Error(
      [
        "Development database contains duplicate invoice payment tokens:",
        details,
        "",
        "Resolve the duplicate pay_token values before synchronizing the schema.",
        "No invoice rows were changed by this check, and schema synchronization was not attempted.",
      ].join("\n"),
    );
  }

  const result = await pool.query<{ table_name: string; column_name: string }>(
    `
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
    `,
  );

  const present = new Set(result.rows.map(({ table_name, column_name }) => `${table_name}.${column_name}`));
  const missing = requiredColumns.filter(({ table, column }) => !present.has(`${table}.${column}`));

  if (missing.length > 0) {
    const byMigration = new Map<string, string[]>();
    for (const { table, column, migration } of missing) {
      const columns = byMigration.get(migration) ?? [];
      columns.push(`${table}.${column}`);
      byMigration.set(migration, columns);
    }

    const details = [...byMigration.entries()]
      .map(([migration, columns]) => `  ${migration}: ${columns.join(", ")}`)
      .join("\n");

    throw new Error(
      [
        "Development database schema is missing columns required by the current Drizzle models:",
        details,
        "",
        "Apply the pending development migrations with `pnpm --filter @workspace/db run push`, then rerun the tests.",
        "This check is read-only and will not modify production data.",
      ].join("\n"),
    );
  }

  console.log(`[schema-check] Development schema is ready (${requiredColumns.length} required columns verified).`);
}

try {
  await checkDevelopmentSchema();
} catch (error) {
  console.error(`[schema-check] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}