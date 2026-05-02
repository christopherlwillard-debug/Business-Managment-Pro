import { pgTable, serial, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { jobsTable } from "./jobs";
import { expensesTable } from "./expenses";

export const mileageLogsTable = pgTable("mileage_logs", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  startLocation: text("start_location"),
  endLocation: text("end_location"),
  miles: numeric("miles", { precision: 8, scale: 2 }).notNull(),
  purpose: text("purpose"),
  jobId: integer("job_id").references(() => jobsTable.id),
  subcontractorId: integer("subcontractor_id"),
  classification: text("classification").notNull().default("business"),
  ratePerMile: numeric("rate_per_mile", { precision: 5, scale: 3 }).notNull().default("0.725"),
  deductionAmount: numeric("deduction_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  source: text("source").notNull().default("gps"),
  expenseId: integer("expense_id").references(() => expensesTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMileageLogSchema = createInsertSchema(mileageLogsTable).omit({ id: true, createdAt: true });
export type InsertMileageLog = z.infer<typeof insertMileageLogSchema>;
export type MileageLog = typeof mileageLogsTable.$inferSelect;
