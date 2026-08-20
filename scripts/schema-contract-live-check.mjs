#!/usr/bin/env node
/**
 * Read-only check of the development database against the canonical
 * business-ownership contract.
 *
 * This deliberately does not run migrations, DDL, backfills, or data queries.
 * It is a release prerequisite: source-code schema validation alone cannot
 * prove that the active database has the columns the application will query.
 */
import { createRequire } from "node:module";

const requireFromDb = createRequire(new URL("../lib/db/package.json", import.meta.url));
const { Pool } = requireFromDb("pg");
const REQUIRED_OWNERSHIP_COLUMNS = [
  "clients.business_id",
  "jobs.business_id",
  "invoices.business_id",
  "estimates.business_id",
  "prospects.business_id",
  "assets.business_id",
].map((qualifiedName) => {
  const [tableName, columnName] = qualifiedName.split(".");
  return { tableName, columnName, qualifiedName };
});

const DATABASE_SCHEMA = "public";

function formatForeignKey(row) {
  if (!row) return "missing foreign key";
  return `references ${row.referenced_table}.${row.referenced_column} with ON DELETE ${row.delete_action}`;
}

function validateMetadata({ tables, columns, foreignKeys }) {
  const tableNames = new Set(tables.map((row) => row.table_name));
  const columnByName = new Map(
    columns.map((row) => [`${row.table_name}.${row.column_name}`, row]),
  );
  const foreignKeysByColumn = new Map();
  for (const row of foreignKeys) {
    const key = `${row.table_name}.${row.column_name}`;
    const existing = foreignKeysByColumn.get(key) ?? [];
    existing.push(row);
    foreignKeysByColumn.set(key, existing);
  }

  const errors = [];
  for (const requirement of REQUIRED_OWNERSHIP_COLUMNS) {
    if (!tableNames.has(requirement.tableName)) {
      errors.push(
        `${requirement.qualifiedName}: table is missing from schema ${DATABASE_SCHEMA}`,
      );
      continue;
    }

    const column = columnByName.get(requirement.qualifiedName);
    if (!column) {
      errors.push(`${requirement.qualifiedName}: column is missing`);
      continue;
    }

    if (column.data_type !== "integer" || column.udt_name !== "int4") {
      errors.push(
        `${requirement.qualifiedName}: expected nullable INTEGER, found ${column.data_type} (${column.udt_name})`,
      );
    }
    if (column.is_nullable !== "YES") {
      errors.push(
        `${requirement.qualifiedName}: expected nullable column, found ${column.is_nullable}`,
      );
    }

    const matchingForeignKey = (foreignKeysByColumn.get(requirement.qualifiedName) ?? []).find(
      (foreignKey) =>
        foreignKey.referenced_table === "businesses" &&
        foreignKey.referenced_column === "id" &&
        foreignKey.delete_action === "SET NULL",
    );
    if (!matchingForeignKey) {
      const available = foreignKeysByColumn.get(requirement.qualifiedName) ?? [];
      errors.push(
        `${requirement.qualifiedName}: expected foreign key to businesses.id with ON DELETE SET NULL; ${available.length ? formatForeignKey(available[0]) : "foreign key is missing"}`,
      );
    }
  }

  return errors;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. The live development schema check cannot run; no schema changes were attempted.",
    );
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const tableNames = REQUIRED_OWNERSHIP_COLUMNS.map(({ tableName }) => tableName);
    const [{ rows: tables }, { rows: columns }, { rows: foreignKeys }] = await Promise.all([
      pool.query(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = $1
           AND table_name = ANY($2::text[])`,
        [DATABASE_SCHEMA, tableNames],
      ),
      pool.query(
        `SELECT table_name, column_name, data_type, udt_name, is_nullable
         FROM information_schema.columns
         WHERE table_schema = $1
           AND table_name = ANY($2::text[])`,
        [DATABASE_SCHEMA, tableNames],
      ),
      pool.query(
        `SELECT
           child.relname AS table_name,
           child_column.attname AS column_name,
           parent.relname AS referenced_table,
           parent_column.attname AS referenced_column,
           CASE constraint_record.confdeltype
             WHEN 'a' THEN 'NO ACTION'
             WHEN 'r' THEN 'RESTRICT'
             WHEN 'c' THEN 'CASCADE'
             WHEN 'n' THEN 'SET NULL'
             WHEN 'd' THEN 'SET DEFAULT'
             ELSE 'UNKNOWN'
           END AS delete_action
         FROM pg_constraint AS constraint_record
         JOIN pg_class AS child
           ON child.oid = constraint_record.conrelid
         JOIN pg_namespace AS child_schema
           ON child_schema.oid = child.relnamespace
         JOIN pg_class AS parent
           ON parent.oid = constraint_record.confrelid
         JOIN LATERAL unnest(constraint_record.conkey) WITH ORDINALITY AS child_key(attnum, position)
           ON TRUE
         JOIN LATERAL unnest(constraint_record.confkey) WITH ORDINALITY AS parent_key(attnum, position)
           ON parent_key.position = child_key.position
         JOIN pg_attribute AS child_column
           ON child_column.attrelid = child.oid
          AND child_column.attnum = child_key.attnum
         JOIN pg_attribute AS parent_column
           ON parent_column.attrelid = parent.oid
          AND parent_column.attnum = parent_key.attnum
         WHERE constraint_record.contype = 'f'
           AND child_schema.nspname = $1
           AND child.relname = ANY($2::text[])`,
        [DATABASE_SCHEMA, tableNames],
      ),
    ]);

    const errors = validateMetadata({ tables, columns, foreignKeys });
    if (errors.length) {
      console.error(
        [
          "Live development schema contract check failed.",
          "This is a read-only check; no schema or data changes were attempted.",
          ...errors.map((error) => `- ${error}`),
          "If post-merge reported a synchronization warning, this is the resulting database mismatch.",
          "Apply the reviewed development schema synchronization with `pnpm --filter @workspace/db run push-force`, then rerun this check before release.",
        ].join("\n"),
      );
      process.exitCode = 1;
      return;
    }

    console.log(
      `Live development schema contract check passed: ${REQUIRED_OWNERSHIP_COLUMNS.length} ownership columns verified as nullable INTEGER foreign keys to businesses.id with ON DELETE SET NULL.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(
    `Live development schema contract check could not complete: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});