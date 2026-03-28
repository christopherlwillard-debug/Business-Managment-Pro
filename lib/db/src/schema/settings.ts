import { pgTable, serial, text, timestamp, integer, numeric, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  companyName: text("company_name"),
  companyAddress: text("company_address"),
  companyCity: text("company_city"),
  companyState: text("company_state"),
  companyZip: text("company_zip"),
  companyPhone: text("company_phone"),
  companyEmail: text("company_email"),
  logoUrl: text("logo_url"),
  defaultTaxRate: numeric("default_tax_rate", { precision: 5, scale: 2 }),
  defaultPaymentTerms: text("default_payment_terms"),
  lateFeePercent: numeric("late_fee_percent", { precision: 5, scale: 2 }),
  invoicePrefix: text("invoice_prefix"),
  invoiceNextNumber: integer("invoice_next_number").default(1001),
  mileageRate: numeric("mileage_rate", { precision: 5, scale: 3 }).default("0.725"),
  currency: text("currency").default("USD"),
  enabledFeatures: jsonb("enabled_features").default('["invoices","expenses","mileage","estimates","subcontractors","daily_logs","compliance","clients"]'),
  thresholdAmount1099: numeric("threshold_amount_1099", { precision: 10, scale: 2 }).default("600"),
  entityType: text("entity_type"),
  ein: text("ein"),
  invoiceLogoPosition: text("invoice_logo_position").default("top-left"),
  invoiceLogoSize: text("invoice_logo_size").default("medium"),
  // Email / SMTP settings
  smtpHost: text("smtp_host"),
  smtpPort: text("smtp_port").default("587"),
  smtpUser: text("smtp_user"),
  smtpPass: text("smtp_pass"),
  smtpSecure: integer("smtp_secure").default(0),
  // Mileage tracking settings
  mileageDefaultClassification: text("mileage_default_classification").default("business"),
  mileageUnits: text("mileage_units").default("miles"),
  mileageReminderFrequency: text("mileage_reminder_frequency").default("daily"),
  // Team access
  ownerUserId: text("owner_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
