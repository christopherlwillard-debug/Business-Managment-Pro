import { pgTable, serial, text, timestamp, integer, numeric, date } from "drizzle-orm/pg-core";
import { prospectsTable } from "./prospects";

export const prospectServiceVisitsTable = pgTable("prospect_service_visits", {
  id: serial("id").primaryKey(),
  prospectId: integer("prospect_id").notNull().references(() => prospectsTable.id, { onDelete: "cascade" }),
  servicedAt: date("serviced_at").notNull(),
  notes: text("notes"),
  price: numeric("price", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ProspectServiceVisit = typeof prospectServiceVisitsTable.$inferSelect;
export type InsertProspectServiceVisit = typeof prospectServiceVisitsTable.$inferInsert;
