import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { businessesTable } from "./businesses";
import { propertiesTable } from "./properties";

export const propertyBusinessAccessTable = pgTable("property_business_access", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id").notNull().references(() => propertiesTable.id, { onDelete: "restrict" }),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "restrict" }),
  permission: text("permission").notNull(),
  grantedBy: text("granted_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedBy: text("revoked_by"),
}, (table) => [
  check("property_business_access_permission_check", sql`${table.permission} IN ('view', 'measure', 'estimate', 'manage')`),
  uniqueIndex("property_business_access_active_unique").on(table.propertyId, table.businessId).where(sql`${table.revokedAt} IS NULL`),
  index("property_business_access_business_idx").on(table.businessId, table.revokedAt),
]);

export type PropertyBusinessAccess = typeof propertyBusinessAccessTable.$inferSelect;
