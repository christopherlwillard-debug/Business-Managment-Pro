import { pgTable, serial, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const publicServicesTable = pgTable("public_services", {
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

export const insertPublicServiceSchema = createInsertSchema(publicServicesTable).omit({ id: true, createdAt: true });
export type InsertPublicService = z.infer<typeof insertPublicServiceSchema>;
export type PublicService = typeof publicServicesTable.$inferSelect;
