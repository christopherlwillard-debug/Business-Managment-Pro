import { boolean, integer, jsonb, numeric, pgTable, serial, text, timestamp, unique, varchar } from "drizzle-orm/pg-core";
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

export const depositSubmissionsTable = pgTable("deposit_submissions", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  siteConfigId: integer("site_config_id").references(() => websiteConfigsTable.id, { onDelete: "set null" }),
  customerName: varchar("customer_name", { length: 255 }).notNull(),
  customerEmail: varchar("customer_email", { length: 255 }).notNull(),
  customerPhone: varchar("customer_phone", { length: 50 }),
  customerNotes: text("customer_notes"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  squareCheckoutId: varchar("square_checkout_id", { length: 255 }),
  squareCheckoutUrl: varchar("square_checkout_url", { length: 1024 }),
  paymentStatus: varchar("payment_status", { length: 50 }).notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type DepositSubmission = typeof depositSubmissionsTable.$inferSelect;
export type InsertDepositSubmission = typeof depositSubmissionsTable.$inferInsert;

export const websiteMediaFoldersTable = pgTable("website_media_folders", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type WebsiteMediaFolder = typeof websiteMediaFoldersTable.$inferSelect;
export type InsertWebsiteMediaFolder = typeof websiteMediaFoldersTable.$inferInsert;

export const websiteMediaTable = pgTable("website_media", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  filename: varchar("filename", { length: 255 }).notNull(),
  objectPath: varchar("object_path", { length: 512 }).notNull(),
  url: varchar("url", { length: 512 }).notNull(),
  size: integer("size").notNull().default(0),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  folderId: integer("folder_id").references(() => websiteMediaFoldersTable.id, { onDelete: "set null" }),
  displayName: varchar("display_name", { length: 255 }),
  /** WebP variant — same resolution, webp format (served to webp-capable browsers). */
  webpObjectPath: varchar("webp_object_path", { length: 512 }),
  /** 300×200 thumbnail WebP — used in media library grids. */
  thumbnailObjectPath: varchar("thumbnail_object_path", { length: 512 }),
  /** 1200px-wide display WebP — capped at display resolution. */
  displayObjectPath: varchar("display_object_path", { length: 512 }),
  /** True once background variant generation is complete. */
  optimized: boolean("optimized").notNull().default(false),
  /** Accessibility alt text for screen readers and SEO. Auto-filled by AI, editable by user. */
  alt: varchar("alt", { length: 255 }),
});

export type WebsiteMedia = typeof websiteMediaTable.$inferSelect;
export type InsertWebsiteMedia = typeof websiteMediaTable.$inferInsert;

/** Per-business library of user-saved reusable section snapshots. */
export const savedSectionsTable = pgTable("saved_sections", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  /** JSONB snapshot: { type: string, content: object, blockStyle?: object } */
  sectionJson: jsonb("section_json").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type SavedSectionRow = typeof savedSectionsTable.$inferSelect;
export type InsertSavedSectionRow = typeof savedSectionsTable.$inferInsert;

/** M16 – AI Marketing Assistant: history of generated marketing content. */
export const marketingContentTable = pgTable("marketing_content", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  /** Content type: facebook-post, google-post, blog-post, newsletter, flyer, door-hanger, business-card, estimate-followup, review-request */
  type: varchar("type", { length: 50 }).notNull(),
  /** Optional promo hint the user typed before generating */
  promoHint: text("promo_hint"),
  /** The full generated content string */
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type MarketingContent = typeof marketingContentTable.$inferSelect;
export type InsertMarketingContent = typeof marketingContentTable.$inferInsert;
