import { pgTable, serial, text, timestamp, integer, numeric, jsonb, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";
import { businessesTable } from "./businesses";
import { jobsTable } from "./jobs";

export const estimatesTable = pgTable("estimates", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  clientId: integer("client_id").references(() => clientsTable.id),
  template: text("template"),
  status: text("status").notNull().default("draft"),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  markupPercent: numeric("markup_percent", { precision: 5, scale: 2 }),
  contingencyPercent: numeric("contingency_percent", { precision: 5, scale: 2 }),
  total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
  jobType: text("job_type"),
  notes: text("notes"),
  workAddress: text("work_address"),
  customerNotes: text("customer_notes"),
  quoteExpiresAt: date("quote_expires_at"),
  lineItems: jsonb("line_items").default("[]"),
  jobId: integer("job_id").references(() => jobsTable.id),
  businessLine: text("business_line"),
  businessId: integer("business_id").references(() => businessesTable.id, { onDelete: "set null" }),
  stripePaymentLinkId: text("stripe_payment_link_id"),
  stripePaymentLinkUrl: text("stripe_payment_link_url"),
  squarePaymentLinkId: text("square_payment_link_id"),
  squarePaymentLinkUrl: text("square_payment_link_url"),
  depositPaidAt: timestamp("deposit_paid_at"),
  depositPaidAmount: numeric("deposit_paid_amount", { precision: 12, scale: 2 }),
  mfhDealerPrice: numeric("mfh_dealer_price", { precision: 12, scale: 2 }),
  mfhQuotedPrice: numeric("mfh_quoted_price", { precision: 12, scale: 2 }),
  mfhGuideName: text("mfh_guide_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertEstimateSchema = createInsertSchema(estimatesTable).omit({ id: true, createdAt: true });
export type InsertEstimate = z.infer<typeof insertEstimateSchema>;
export type Estimate = typeof estimatesTable.$inferSelect;
