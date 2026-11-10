import assert from "node:assert/strict";
import test from "node:test";
import {
  PAY_WORKER_REQUIRED_COLUMNS,
  MATERIAL_LIST_REQUIRED_COLUMNS,
  REQUIRED_OWNERSHIP_COLUMNS,
  REQUIRED_SCHEMA_COLUMNS,
  REQUIRED_SCHEMA_TABLES,
  validateMetadata,
} from "./schema-contract-live-check.mjs";

function validMetadata() {
  const ownershipNames = new Set(
    REQUIRED_OWNERSHIP_COLUMNS.map(({ qualifiedName }) => qualifiedName),
  );
  const tableNames = [...new Set([
    ...REQUIRED_SCHEMA_COLUMNS.map(({ tableName }) => tableName),
    ...REQUIRED_SCHEMA_TABLES.map(({ tableName }) => tableName),
  ])];
  return {
    tables: tableNames.map((table_name) => ({ table_name })),
    columns: REQUIRED_SCHEMA_COLUMNS.map(({ tableName, columnName, qualifiedName }) => ({
      table_name: tableName,
      column_name: columnName,
      data_type: ownershipNames.has(qualifiedName) ? "integer" : "text",
      udt_name: ownershipNames.has(qualifiedName) ? "int4" : "text",
      is_nullable: "YES",
    })),
    foreignKeys: REQUIRED_OWNERSHIP_COLUMNS.map(({ tableName, columnName }) => ({
      table_name: tableName,
      column_name: columnName,
      referenced_table: "businesses",
      referenced_column: "id",
      delete_action: "SET NULL",
    })),
  };
}

test("accepts a target schema with all required columns and tables", () => {
  assert.equal(PAY_WORKER_REQUIRED_COLUMNS.length, 23);
  assert.deepEqual(
    MATERIAL_LIST_REQUIRED_COLUMNS.map(({ qualifiedName }) => qualifiedName),
    ["material_lists.invoice_id", "material_lists.invoice_assignment_initialized"],
  );
  assert.deepEqual(validateMetadata(validMetadata()), []);
});

test("names a missing material-list invoice column and its migration", () => {
  const metadata = validMetadata();
  metadata.columns = metadata.columns.filter(
    (column) => column.column_name !== "invoice_id" || column.table_name !== "material_lists",
  );

  assert.deepEqual(validateMetadata(metadata), [
    "material_lists.invoice_id: column is missing (required by material-list invoice assignment; apply lib/db/migrations/0075_material_list_invoice_assignment.sql)",
  ]);
});

test("names a missing material-list assignment flag and its migration", () => {
  const metadata = validMetadata();
  metadata.columns = metadata.columns.filter(
    (column) => column.column_name !== "invoice_assignment_initialized" || column.table_name !== "material_lists",
  );

  assert.deepEqual(validateMetadata(metadata), [
    "material_lists.invoice_assignment_initialized: column is missing (required by material-list invoice assignment; apply lib/db/migrations/0075_material_list_invoice_assignment.sql)",
  ]);
});

test("names a missing material-list table and its migration", () => {
  const metadata = validMetadata();
  metadata.tables = metadata.tables.filter(({ table_name }) => table_name !== "material_lists");

  assert.deepEqual(validateMetadata(metadata), [
    "material_lists.invoice_id: table is missing from schema public (required by material-list invoice assignment; apply lib/db/migrations/0075_material_list_invoice_assignment.sql)",
    "material_lists.invoice_assignment_initialized: table is missing from schema public (required by material-list invoice assignment; apply lib/db/migrations/0075_material_list_invoice_assignment.sql)",
  ]);
});

test("names the missing material-list invoice event table and its migration", () => {
  const metadata = validMetadata();
  metadata.tables = metadata.tables.filter(({ table_name }) => table_name !== "material_list_invoice_events");

  assert.deepEqual(validateMetadata(metadata), [
    "material_list_invoice_events: table is missing from schema public (required by material-list invoice assignment; apply lib/db/migrations/0075_material_list_invoice_assignment.sql)",
  ]);
});

test("names the pay-worker route and missing payroll column before release", () => {
  const metadata = validMetadata();
  metadata.columns = metadata.columns.filter(
    (column) => column.column_name !== "work_rate" || column.table_name !== "sub_payment_records",
  );

  assert.deepEqual(validateMetadata(metadata), [
    "sub_payment_records.work_rate: column is missing (required by POST /api/jobs/:id/pay-worker)",
  ]);
});

test("points a missing payroll business owner to migration 0069", () => {
  const metadata = validMetadata();
  metadata.columns = metadata.columns.filter(
    (column) => column.column_name !== "business_id" || column.table_name !== "sub_payment_records",
  );

  assert.deepEqual(validateMetadata(metadata), [
    "sub_payment_records.business_id: column is missing (required by business ownership contract and POST /api/jobs/:id/pay-worker; apply lib/db/migrations/0069_financial_business_ownership.sql)",
  ]);
});