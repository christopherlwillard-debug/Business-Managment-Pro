import { pgTable, serial, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const portfolioPhotosTable = pgTable("portfolio_photos", {
  id: serial("id").primaryKey(),
  url: text("url").notNull(),
  caption: text("caption"),
  category: text("category"),
  sortOrder: integer("sort_order").default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPortfolioPhotoSchema = createInsertSchema(portfolioPhotosTable).omit({ id: true, createdAt: true });
export type InsertPortfolioPhoto = z.infer<typeof insertPortfolioPhotoSchema>;
export type PortfolioPhoto = typeof portfolioPhotosTable.$inferSelect;
