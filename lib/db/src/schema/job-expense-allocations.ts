import { integer, numeric, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { expensesTable } from "./expenses";
import { jobsTable } from "./jobs";

/**
 * A job-only allocation is a distribution of an existing expense, not a
 * second accounting transaction. The source expense remains the ledger row.
 */
export const jobExpenseAllocationsTable = pgTable(
  "job_expense_allocations",
  {
    id: serial("id").primaryKey(),
    expenseId: integer("expense_id")
      .notNull()
      .references(() => expensesTable.id, { onDelete: "cascade" }),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobsTable.id, { onDelete: "cascade" }),
    businessId: integer("business_id").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("job_expense_allocations_expense_job_unique").on(table.expenseId, table.jobId),
  ],
);

export type JobExpenseAllocation = typeof jobExpenseAllocationsTable.$inferSelect;