import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const featuredClientsTable = pgTable("featured_clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  websiteUrl: text("website_url"),
  sortOrder: integer("sort_order").default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type FeaturedClient = typeof featuredClientsTable.$inferSelect;
export type InsertFeaturedClient = typeof featuredClientsTable.$inferInsert;
