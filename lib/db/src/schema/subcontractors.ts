import { pgTable, serial, text, timestamp, numeric, boolean, jsonb } from "drizzle-orm/pg-core";
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
  // W-9 fields
  w9LegalName: text("w9_legal_name"),
  w9BusinessName: text("w9_business_name"),
  w9TaxClassification: text("w9_tax_classification"),
  w9LlcType: text("w9_llc_type"),
  w9Address: text("w9_address"),
  w9City: text("w9_city"),
  w9State: text("w9_state"),
  w9Zip: text("w9_zip"),
  w9TaxIdType: text("w9_tax_id_type"),
  w9TaxId: text("w9_tax_id"),
  w9Signature: text("w9_signature"),
  w9SignedAt: text("w9_signed_at"),
  // Portal feature flags chosen by the sub
  portalFeatures: jsonb("portal_features").default('["payments","jobs","expenses","mileage","w9"]'),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSubcontractorSchema = createInsertSchema(subcontractorsTable).omit({ id: true, createdAt: true });
export type InsertSubcontractor = z.infer<typeof insertSubcontractorSchema>;
export type Subcontractor = typeof subcontractorsTable.$inferSelect;
