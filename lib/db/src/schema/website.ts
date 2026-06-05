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

export const websiteFormSubmissionsTable = pgTable("website_form_submissions", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  siteSlug: varchar("site_slug", { length: 100 }).notNull(),
  fields: jsonb("fields").notNull().default({}),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
});

export type WebsiteFormSubmission = typeof websiteFormSubmissionsTable.$inferSelect;
export type InsertWebsiteFormSubmission = typeof websiteFormSubmissionsTable.$inferInsert;

export const websiteMediaTable = pgTable("website_media", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  filename: varchar("filename", { length: 255 }).notNull(),
  objectPath: varchar("object_path", { length: 512 }).notNull(),
  url: varchar("url", { length: 512 }).notNull(),
  size: integer("size").notNull().default(0),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export type WebsiteMedia = typeof websiteMediaTable.$inferSelect;
export type InsertWebsiteMedia = typeof websiteMediaTable.$inferInsert;
