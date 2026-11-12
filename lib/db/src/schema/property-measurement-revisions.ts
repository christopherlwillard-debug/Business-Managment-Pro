import { createInsertSchema } from "drizzle-zod";
import { check, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { propertiesTable } from "./properties";

export const propertyMeasurementRevisionsTable = pgTable("property_measurement_revisions", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id").notNull().references(() => propertiesTable.id, { onDelete: "restrict" }),
  revision: integer("revision").notNull(),
  source: text("source").notNull(),
  entries: jsonb("entries").notNull(),
  notes: text("notes"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("property_measurement_revisions_revision_positive", sql`${table.revision} > 0`),
  check("property_measurement_revisions_source_check", sql`${table.source} IN ('manual', 'on_site')`),
  uniqueIndex("property_measurement_revisions_property_revision_unique").on(table.propertyId, table.revision),
  index("property_measurement_revisions_property_created_idx").on(table.propertyId, table.createdAt),
]);

export const insertPropertyMeasurementRevisionSchema = createInsertSchema(propertyMeasurementRevisionsTable)
  .omit({ id: true, createdAt: true });
export type InsertPropertyMeasurementRevision = z.infer<typeof insertPropertyMeasurementRevisionSchema>;
export type PropertyMeasurementRevision = typeof propertyMeasurementRevisionsTable.$inferSelect;

