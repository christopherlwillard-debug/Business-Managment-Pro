import { pgTable, serial, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";

export const servicesTable = pgTable("services", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  icon: text("icon"),
  priceDisplay: text("price_display"),
  priceNote: text("price_note"),
  whatsIncluded: text("whats_included"),
  addOns: text("add_ons"),
  sortOrder: integer("sort_order").default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Service = typeof servicesTable.$inferSelect;
export type InsertService = typeof servicesTable.$inferInsert;
