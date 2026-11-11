import { integer, jsonb, pgTable, serial, text, timestamp, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const businessesTable = pgTable("businesses", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  type: text("type").notNull().default("other"),
  logoUrl: text("logo_url"),
  invoiceLogoLayout: jsonb("invoice_logo_layout"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  defaultQuoteTerms: text("default_quote_terms"),
  defaultQuoteValidityDays: integer("default_quote_validity_days").notNull().default(30),
  licenseNumber: text("license_number"),
  taxId: text("tax_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  enabledFeatures: jsonb("enabled_features"),
  parentBusinessId: integer("parent_business_id"),
  legalBusinessId: integer("legal_business_id").references(
    (): AnyPgColumn => businessesTable.id,
    { onDelete: "restrict" },
  ),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBusinessSchema = createInsertSchema(businessesTable).omit({ id: true, createdAt: true });
export type InsertBusiness = z.infer<typeof insertBusinessSchema>;
export type Business = typeof businessesTable.$inferSelect;
