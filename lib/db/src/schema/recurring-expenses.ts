import { pgTable, serial, text, timestamp, integer, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { jobsTable } from "./jobs";

export const RECURRING_FREQUENCIES = ["weekly", "biweekly", "monthly", "quarterly", "yearly"] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

export const recurringExpensesTable = pgTable("recurring_expenses", {
  id: serial("id").primaryKey(),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  category: text("category").notNull(),
  vendor: text("vendor"),
  jobId: integer("job_id").references(() => jobsTable.id),
  notes: text("notes"),
  frequency: text("frequency").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  nextDueDate: text("next_due_date").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertRecurringExpenseSchema = createInsertSchema(recurringExpensesTable).omit({ id: true, createdAt: true });
export type InsertRecurringExpense = z.infer<typeof insertRecurringExpenseSchema>;
export type RecurringExpense = typeof recurringExpensesTable.$inferSelect;
