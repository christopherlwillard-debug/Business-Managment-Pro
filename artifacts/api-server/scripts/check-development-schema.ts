import { pool } from "@workspace/db";

type RequiredColumn = {
  table: string;
  column: string;
  migration: string;
};

const requiredColumns: RequiredColumn[] = [
  // 0047_business_ownership_backfill.sql
  ...["clients", "jobs", "invoices", "estimates", "prospects", "assets"].map((table) => ({
    table,
    column: "business_id",
    migration: "0047_business_ownership_backfill.sql",
  })),
  // 0048_financial_correction_history.sql
  ...[
    ["expenses", "voided_at"],
    ["expenses", "void_reason"],
    ["other_income", "voided_at"],
    ["other_income", "void_reason"],
    ["owner_capital_entries", "voided_at"],
    ["owner_capital_entries", "void_reason"],
    ["mileage_logs", "voided_at"],
    ["mileage_logs", "void_reason"],
    ["sub_payment_records", "reversal_reason"],
    ["invoices", "voided_at"],
    ["invoices", "void_reason"],
  ].map(([table, column]) => ({
    table,
    column,
    migration: "0048_financial_correction_history.sql",
  })),
];

async function checkDevelopmentSchema() {
  const result = await pool.query<{ table_name: string; column_name: string }>(
    `
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (table_name, column_name) IN (
          SELECT * FROM unnest($1::text[], $2::text[])
        )
    `,
    [
      requiredColumns.map(({ table }) => table),
      requiredColumns.map(({ column }) => column),
    ],
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