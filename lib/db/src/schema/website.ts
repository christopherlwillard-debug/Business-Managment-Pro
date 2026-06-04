import { boolean, integer, jsonb, pgTable, serial, timestamp } from "drizzle-orm/pg-core";

export const websiteConfigsTable = pgTable("website_configs", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  sections: jsonb("sections").notNull().default([]),
  settings: jsonb("settings").notNull().default({}),
  published: boolean("published").notNull().default(false),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type WebsiteConfig = typeof websiteConfigsTable.$inferSelect;
export type InsertWebsiteConfig = typeof websiteConfigsTable.$inferInsert;
