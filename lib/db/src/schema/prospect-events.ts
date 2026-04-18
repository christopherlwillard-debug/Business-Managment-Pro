import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { prospectsTable } from "./prospects";

export const prospectEventsTable = pgTable("prospect_events", {
  id: serial("id").primaryKey(),
  prospectId: integer("prospect_id").notNull().references(() => prospectsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("status_change"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ProspectEvent = typeof prospectEventsTable.$inferSelect;
export type InsertProspectEvent = typeof prospectEventsTable.$inferInsert;
