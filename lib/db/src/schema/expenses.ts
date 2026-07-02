import { pgTable, serial, text, timestamp, integer, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { jobsTable } from "./jobs";
import { recurringExpensesTable } from "./recurring-expenses";

export const expensesTable = pgTable("expenses", {
  id: serial("id").primaryKey(),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  category: text("category").notNull(),
  date: text("date").notNull(),
  vendor: text("vendor"),
  jobId: integer("job_id").references(() => jobsTable.id),
  subcontractorId: integer("subcontractor_id"),
  receiptUrl: text("receipt_url"),
  notes: text("notes"),
  recurringExpenseId: integer("recurring_expense_id").references(() => recurringExpensesTable.id, { onDelete: "set null" }),
  excludeFromNetProfit: boolean("exclude_from_net_profit").default(false).notNull(),
  businessLine: text("business_line"),
  businessId: integer("business_id"),
  jobSubHoursId: integer("job_sub_hours_id"),
  mileageImportId: integer("mileage_import_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertExpenseSchema = createInsertSchema(expensesTable).omit({ id: true, createdAt: true });
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expensesTable.$inferSelect;
