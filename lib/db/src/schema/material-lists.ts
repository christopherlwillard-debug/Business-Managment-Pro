import { pgTable, serial, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { jobsTable } from "./jobs";
import { materialsTable } from "./materials";

export const materialListsTable = pgTable("material_lists", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
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
});

export type MaterialList = typeof materialListsTable.$inferSelect;
export type MaterialListItem = typeof materialListItemsTable.$inferSelect;
