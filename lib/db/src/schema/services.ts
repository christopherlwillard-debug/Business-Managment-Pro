import { pgTable, serial, text, timestamp, boolean, integer, numeric, jsonb } from "drizzle-orm/pg-core";

export const servicesTable = pgTable("services", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  category: text("category"),
  icon: text("icon"),
  pricingType: text("pricing_type"),
  basePrice: numeric("base_price", { precision: 10, scale: 2 }),
  priceMin: numeric("price_min", { precision: 10, scale: 2 }),
  priceMax: numeric("price_max", { precision: 10, scale: 2 }),
  unit: text("unit"),
  priceDisplay: text("price_display"),
  priceNote: text("price_note"),
  whatsIncluded: jsonb("whats_included").$type<string[]>(),
  addOns: jsonb("add_ons").$type<{ name: string; price: number }[]>(),
  notes: text("notes"),
  sortOrder: integer("sort_order").default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Service = typeof servicesTable.$inferSelect;
export type InsertService = typeof servicesTable.$inferInsert;
