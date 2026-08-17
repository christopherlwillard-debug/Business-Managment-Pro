import { pgTable, serial, text, timestamp, integer, numeric, check, date } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { estimatesTable } from "./estimates";
import { clientsTable } from "./clients";

export const PROSPECT_PROPERTY_TYPES = ["Church", "Retail", "Apartment", "Industrial", "Other"] as const;
export type ProspectPropertyType = typeof PROSPECT_PROPERTY_TYPES[number];

export const PROSPECT_STATUSES = ["cold", "contacted", "quoted", "won", "serviced", "lost"] as const;
export type ProspectStatus = typeof PROSPECT_STATUSES[number];

export const prospectsTable = pgTable(
  "prospects",
  {
    id: serial("id").primaryKey(),
    address: text("address").notNull().default(""),
    companyName: text("company_name"),
    website: text("website"),
    companyAddress: text("company_address"),
    companyCity: text("company_city"),
    companyState: text("company_state"),
    companyZip: text("company_zip"),
    propertyType: text("property_type").notNull().default("Other"),
    estimatedSqft: integer("estimated_sqft"),
    measuredSqFt: integer("measured_sq_ft"),
    roughQuote: numeric("rough_quote", { precision: 12, scale: 2 }),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),
    contactName: text("contact_name"),
    contactPhone: text("contact_phone"),
    contactEmail: text("contact_email"),
    notes: text("notes"),
    status: text("status").notNull().default("cold"),
    linkedEstimateId: integer("linked_estimate_id").references(() => estimatesTable.id),
    linkedInvoiceId: integer("linked_invoice_id"),
    clientId: integer("client_id").references(() => clientsTable.id),
    stripePaymentLinkId: text("stripe_payment_link_id"),
    stripePaymentLinkUrl: text("stripe_payment_link_url"),
    squarePaymentLinkId: text("square_payment_link_id"),
    squarePaymentLinkUrl: text("square_payment_link_url"),
    depositPaidAt: timestamp("deposit_paid_at"),
    depositPaidAmount: numeric("deposit_paid_amount", { precision: 12, scale: 2 }),
    lastPaidAt: timestamp("last_paid_at"),
    servicedAt: date("serviced_at"),
    followUpDate: date("follow_up_date"),
    source: text("source").default("manual"),
    businessLine: text("business_line"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    check(
      "prospects_status_check",
      sql`${table.status} IN ('cold', 'contacted', 'quoted', 'won', 'serviced', 'lost')`,
    ),
    check(
      "prospects_property_type_check",
      sql`${table.propertyType} IN ('Church', 'Retail', 'Apartment', 'Industrial', 'Other')`,
    ),
  ],
);

export type Prospect = typeof prospectsTable.$inferSelect;
export type InsertProspect = typeof prospectsTable.$inferInsert;
