import { createInsertSchema } from "drizzle-zod";
import { index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { businessesTable } from "./businesses";

export const servicePricingProfileVersionsTable = pgTable("service_pricing_profile_versions", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "restrict" }),
  serviceKey: text("service_key").notNull(),
  version: integer("version").notNull(),
  displayName: text("display_name").notNull(),
  rules: jsonb("rules").notNull(),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("service_pricing_profile_versions_business_service_version_unique")
    .on(table.businessId, table.serviceKey, table.version),
  index("service_pricing_profile_versions_business_service_idx").on(table.businessId, table.serviceKey),
]);

export const insertServicePricingProfileVersionSchema = createInsertSchema(servicePricingProfileVersionsTable)
  .omit({ id: true, createdAt: true });
export type InsertServicePricingProfileVersion = z.infer<typeof insertServicePricingProfileVersionSchema>;
export type ServicePricingProfileVersion = typeof servicePricingProfileVersionsTable.$inferSelect;

