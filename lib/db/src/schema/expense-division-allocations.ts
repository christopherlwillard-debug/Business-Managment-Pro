import { index, integer, numeric, pgTable, serial, timestamp, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { expensesTable } from "./expenses";
import { businessesTable } from "./businesses";

/**
 * Management-only attribution of an existing shared expense to a division.
 * This table never creates a second accounting transaction.
 */
export const expenseDivisionAllocationsTable = pgTable(
  "expense_division_allocations",
  {
    id: serial("id").primaryKey(),
    expenseId: integer("expense_id")
      .notNull()
      .references(() => expensesTable.id, { onDelete: "cascade" }),
    businessId: integer("business_id")
      .notNull()
      .references(() => businessesTable.id, { onDelete: "restrict" }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("expense_division_allocations_expense_business_unique")
      .on(table.expenseId, table.businessId),
    index("expense_division_allocations_business_idx").on(table.businessId),
    check("expense_division_allocations_amount_check", sql`${table.amount} > 0`),
  ],
);

export type ExpenseDivisionAllocation = typeof expenseDivisionAllocationsTable.$inferSelect;
