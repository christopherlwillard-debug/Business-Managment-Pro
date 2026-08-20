import { pgTable, serial, text, timestamp, integer, date, boolean, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clientsTable = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  notes: text("notes"),
  nextServiceDate: date("next_service_date"),
  serviceIntervalMonths: integer("service_interval_months"),
  businessLine: text("business_line"),
  squareCustomerId: text("square_customer_id"),
  reminderOptOut: boolean("reminder_opt_out").default(false).notNull(),
  mileageSurchargeEnabled: boolean("mileage_surcharge_enabled").default(false).notNull(),
  mileageSurchargeTriggerMiles: numeric("mileage_surcharge_trigger_miles", { precision: 8, scale: 2 }),
  mileageSurchargeDailyRate: numeric("mileage_surcharge_daily_rate", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertClientSchema = createInsertSchema(clientsTable).omit({ id: true, createdAt: true });
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clientsTable.$inferSelect;
