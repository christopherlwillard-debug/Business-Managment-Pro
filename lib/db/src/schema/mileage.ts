import { pgTable, serial, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { jobsTable } from "./jobs";
import { expensesTable } from "./expenses";
import { businessesTable } from "./businesses";

export const mileageImportsTable = pgTable("mileage_imports", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").references(() => businessesTable.id, { onDelete: "cascade" }),
  userId: text("user_id"),
  source: text("source").notNull().default("mileiq"),
  filename: text("filename").notNull(),
  fileHash: text("file_hash"),
  status: text("status").notNull().default("completed"),
  tripsFound: integer("trips_found").notNull().default(0),
  tripsImported: integer("trips_imported").notNull().default(0),
  duplicatesSkipped: integer("duplicates_skipped").notNull().default(0),
  totalMiles: numeric("total_miles", { precision: 10, scale: 2 }),
  estimatedDeduction: numeric("estimated_deduction", { precision: 10, scale: 2 }),
  errorSummary: text("error_summary"),
  rolledBackAt: timestamp("rolled_back_at"),
  importedAt: timestamp("imported_at").defaultNow().notNull(),
});

export const mileageLogsTable = pgTable("mileage_logs", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  startLocation: text("start_location"),
  endLocation: text("end_location"),
  miles: numeric("miles", { precision: 8, scale: 2 }).notNull(),
  purpose: text("purpose"),
  jobId: integer("job_id").references(() => jobsTable.id),
  subcontractorId: integer("subcontractor_id"),
  businessId: integer("business_id").references(() => businessesTable.id, { onDelete: "set null" }),
  classification: text("classification").notNull().default("business"),
  ratePerMile: numeric("rate_per_mile", { precision: 5, scale: 3 }).notNull().default("0.725"),
  deductionAmount: numeric("deduction_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  source: text("source").notNull().default("gps"),
  expenseId: integer("expense_id").references(() => expensesTable.id, { onDelete: "set null" }),
  importId: integer("import_id").references(() => mileageImportsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  voidedAt: timestamp("voided_at"),
  voidReason: text("void_reason"),
});

export const insertMileageLogSchema = createInsertSchema(mileageLogsTable).omit({ id: true, createdAt: true });
export type InsertMileageLog = z.infer<typeof insertMileageLogSchema>;
export type MileageLog = typeof mileageLogsTable.$inferSelect;
export type MileageImport = typeof mileageImportsTable.$inferSelect;
