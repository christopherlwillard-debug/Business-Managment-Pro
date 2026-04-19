import { pgTable, serial, text, timestamp, integer, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";
import { prospectsTable } from "./prospects";

export const routeStopsTable = pgTable("route_stops", {
  id: serial("id").primaryKey(),
  title: text("title"),
  address: text("address").notNull(),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  notes: text("notes"),
  scheduledDate: text("scheduled_date"),
  status: text("status").notNull().default("prospect"),
  estimatedDurationMinutes: integer("estimated_duration_minutes").default(60),
  sortOrder: integer("sort_order").default(0),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "set null" }),
  prospectId: integer("prospect_id").references(() => prospectsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertRouteStopSchema = createInsertSchema(routeStopsTable).omit({ id: true, createdAt: true });
export type InsertRouteStop = z.infer<typeof insertRouteStopSchema>;
export type RouteStop = typeof routeStopsTable.$inferSelect;
