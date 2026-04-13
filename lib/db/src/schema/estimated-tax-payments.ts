import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";

export const estimatedTaxPaymentsTable = pgTable("estimated_tax_payments", {
  id: serial("id").primaryKey(),
  year: integer("year").notNull(),
  quarter: integer("quarter").notNull(),
  level: text("level").notNull().default("federal"),
  amountPaid: numeric("amount_paid", { precision: 12, scale: 2 }),
  paidDate: text("paid_date"),
  paymentMethod: text("payment_method"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type EstimatedTaxPayment = typeof estimatedTaxPaymentsTable.$inferSelect;
