import { pgTable, serial, text, timestamp, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const subcontractorsTable = pgTable("subcontractors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  trade: text("trade"),
  licenseNumber: text("license_number"),
  licenseExpiry: text("license_expiry"),
  insuranceExpiry: text("insurance_expiry"),
  w9OnFile: boolean("w9_on_file").notNull().default(false),
  ytdPayments: numeric("ytd_payments", { precision: 12, scale: 2 }).notNull().default("0"),
  address: text("address"),
  notes: text("notes"),
  portalToken: text("portal_token").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSubcontractorSchema = createInsertSchema(subcontractorsTable).omit({ id: true, createdAt: true });
export type InsertSubcontractor = z.infer<typeof insertSubcontractorSchema>;
export type Subcontractor = typeof subcontractorsTable.$inferSelect;
