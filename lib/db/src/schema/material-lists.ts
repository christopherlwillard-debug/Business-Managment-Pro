import { pgTable, serial, text, timestamp, integer, numeric, boolean } from "drizzle-orm/pg-core";
import { jobsTable } from "./jobs";
import { materialsTable } from "./materials";
import { expensesTable } from "./expenses";

export const materialListsTable = pgTable("material_lists", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  userId: text("user_id"),
  jobId: integer("job_id").references(() => jobsTable.id, { onDelete: "set null" }),
  markup: numeric("markup", { precision: 5, scale: 2 }).notNull().default("40"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const materialListItemsTable = pgTable("material_list_items", {
  id: serial("id").primaryKey(),
  listId: integer("list_id")
    .notNull()
    .references(() => materialListsTable.id, { onDelete: "cascade" }),
  materialId: integer("material_id").references(() => materialsTable.id, { onDelete: "set null" }),
  nameSnapshot: text("name_snapshot").notNull(),
  unitSnapshot: text("unit_snapshot").notNull().default("ea"),
  unitCostSnapshot: numeric("unit_cost_snapshot", { precision: 12, scale: 2 }).notNull().default("0"),
  qty: numeric("qty", { precision: 10, scale: 2 }).notNull().default("1"),
  // When true, a linked Job Expense (source_type="Material List") is auto-created and kept in sync.
  addToJobExpenses: boolean("add_to_job_expenses").notNull().default(false),
  // FK to the auto-created expense row; cleared (set null) automatically if the expense is deleted.
  expenseId: integer("expense_id").references(() => expensesTable.id, { onDelete: "set null" }),
});

export type MaterialList = typeof materialListsTable.$inferSelect;
export type MaterialListItem = typeof materialListItemsTable.$inferSelect;
