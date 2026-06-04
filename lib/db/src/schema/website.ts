import { boolean, integer, jsonb, pgTable, serial, timestamp, unique } from "drizzle-orm/pg-core";
import { businessesTable } from "./businesses";

export const websiteConfigsTable = pgTable("website_configs", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  sections: jsonb("sections").notNull().default([]),
  settings: jsonb("settings").notNull().default({}),
  published: boolean("published").notNull().default(false),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("website_configs_business_id_unique").on(table.businessId),
]);

export type WebsiteConfig = typeof websiteConfigsTable.$inferSelect;
export type InsertWebsiteConfig = typeof websiteConfigsTable.$inferInsert;
