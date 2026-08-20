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
  dbaLogoUrl: text("dba_logo_url"),
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
  // Bottom navigation customization (JSON array of hrefs)
  bottomNavItems: text("bottom_nav_items"),
  // Compliance notification preferences
  complianceNotificationEmail: text("compliance_notification_email"),
  complianceEmailEnabled: integer("compliance_email_enabled").default(1),
  // Invoice payment reminder automation
  invoiceReminderEnabled: integer("invoice_reminder_enabled").default(1),
  invoiceReminderDay1: integer("invoice_reminder_day1").default(7),
  invoiceReminderDay2: integer("invoice_reminder_day2").default(14),
  // Tax filing preference
  taxFilingFrequency: text("tax_filing_frequency").default("quarterly"),
  // Calculator defaults (plumbing, flooring, trim, siding, drywall, punch list)
  calculatorDefaults: jsonb("calculator_defaults"),
  // Effective-dated tax assumptions and business overrides. Tax transactions
  // remain in their source ledgers; this is configuration only.
  taxAssumptions: jsonb("tax_assumptions"),
  // Contractor portal quick links (label, url, optional username/password)
  quickLinks: jsonb("quick_links"),
  // Company signature image — stored as object storage path; embedded in exported PDFs
  signatureImage: text("signature_image"),
  // P&L layout: owner split %, tax reserve %, growth reserve %, and step order
  ownerSplitPct: numeric("owner_split_pct", { precision: 5, scale: 2 }),
  taxReservePct: numeric("tax_reserve_pct", { precision: 5, scale: 2 }),
  growthReservePct: numeric("growth_reserve_pct", { precision: 5, scale: 2 }),
  plStepOrder: text("pl_step_order"),
  // Tax Profile: legal entity structure + IRS federal tax election + election effective date
  federalTaxElection: text("federal_tax_election").default("sole_prop"),
  taxElectionEffectiveDate: text("tax_election_effective_date"),
  // Business Reserve Dashboard: operating reserve setting and growth fund toggle
  operatingReserveMode: text("operating_reserve_mode").default("0"),
  operatingReserveCustom: numeric("operating_reserve_custom", { precision: 10, scale: 2 }),
  includeGrowthFundInReserve: integer("include_growth_fund_in_reserve").default(0),
  // Home office deduction settings — JSON object keyed by year string, e.g. {"2026": {...}}
  homeOfficeSettings: jsonb("home_office_settings"),
  // Vehicle & fuel cost estimation (informational only — not used for accounting or taxes)
  vehicleMpg: integer("vehicle_mpg").default(17),
  fuelPricePerGallon: numeric("fuel_price_per_gallon", { precision: 6, scale: 3 }),
  fuelPriceUpdatedAt: timestamp("fuel_price_updated_at"),
  // Team access
  ownerUserId: text("owner_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
