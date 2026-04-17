import { pgTable, serial, text, timestamp, integer, numeric, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { estimatesTable } from "./estimates";

export const PROSPECT_PROPERTY_TYPES = ["Church", "Retail", "Apartment", "Industrial", "Other"] as const;
export type ProspectPropertyType = typeof PROSPECT_PROPERTY_TYPES[number];

export const PROSPECT_STATUSES = ["cold", "contacted", "quoted", "won", "lost"] as const;
export type ProspectStatus = typeof PROSPECT_STATUSES[number];

export const prospectsTable = pgTable(
  "prospects",
  {
    id: serial("id").primaryKey(),
    address: text("address").notNull(),
    propertyType: text("property_type").notNull().default("Other"),
    estimatedSqft: integer("estimated_sqft"),
    roughQuote: numeric("rough_quote", { precision: 12, scale: 2 }),
    contactName: text("contact_name"),
    contactPhone: text("contact_phone"),
    notes: text("notes"),
    status: text("status").notNull().default("cold"),
    linkedEstimateId: integer("linked_estimate_id").references(() => estimatesTable.id),
    stripePaymentLinkId: text("stripe_payment_link_id"),
    stripePaymentLinkUrl: text("stripe_payment_link_url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    check(
      "prospects_status_check",
      sql`${table.status} IN ('cold', 'contacted', 'quoted', 'won', 'lost')`,
    ),
    check(
      "prospects_property_type_check",
      sql`${table.propertyType} IN ('Church', 'Retail', 'Apartment', 'Industrial', 'Other')`,
    ),
  ],
);

export type Prospect = typeof prospectsTable.$inferSelect;
export type InsertProspect = typeof prospectsTable.$inferInsert;
