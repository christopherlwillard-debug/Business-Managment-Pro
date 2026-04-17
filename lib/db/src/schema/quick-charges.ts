import { pgTable, serial, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const quickChargesTable = pgTable("quick_charges", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  customerName: text("customer_name"),
  customerEmail: text("customer_email"),
  notes: text("notes"),
  stripePaymentLinkId: text("stripe_payment_link_id"),
  stripePaymentLinkUrl: text("stripe_payment_link_url"),
  stripePriceId: text("stripe_price_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeSessionId: text("stripe_session_id"),
  status: text("status").notNull().default("pending"),
  paidAt: timestamp("paid_at"),
  qrCodeDataUrl: text("qr_code_data_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertQuickChargeSchema = createInsertSchema(quickChargesTable).omit({ id: true, createdAt: true });
export type InsertQuickCharge = z.infer<typeof insertQuickChargeSchema>;
export type QuickCharge = typeof quickChargesTable.$inferSelect;
