import { boolean, integer, jsonb, pgTable, serial, timestamp, unique, varchar } from "drizzle-orm/pg-core";
import { businessesTable } from "./businesses";

export const websitePageViewsTable = pgTable("website_page_views", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  viewedAt: timestamp("viewed_at").defaultNow().notNull(),
  deviceType: varchar("device_type", { length: 10 }).notNull().default("desktop"),
});

export type WebsitePageView = typeof websitePageViewsTable.$inferSelect;
export type InsertWebsitePageView = typeof websitePageViewsTable.$inferInsert;

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
