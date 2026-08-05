import { pgTable, serial, text, timestamp, integer, numeric, boolean } from "drizzle-orm/pg-core";

export const vehiclesTable = pgTable("vehicles", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id"), // nullable — global (not per-business)
  nickname: text("nickname").notNull().default("My Truck"),
  year: integer("year"),
  make: text("make"),
  model: text("model"),
  avgMpg: integer("avg_mpg").notNull().default(17),
  fuelPricePerGallon: numeric("fuel_price_per_gallon", { precision: 6, scale: 3 }),
  fuelPriceUpdatedAt: timestamp("fuel_price_updated_at"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Vehicle = typeof vehiclesTable.$inferSelect;
export type InsertVehicle = typeof vehiclesTable.$inferInsert;
