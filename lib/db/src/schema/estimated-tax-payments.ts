import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { businessesTable } from "./businesses";

export const estimatedTaxPaymentsTable = pgTable("estimated_tax_payments", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").references(() => businessesTable.id, { onDelete: "set null" }),
  year: integer("year").notNull(),
  quarter: integer("quarter").notNull(),
  level: text("level").notNull().default("federal"),
  amountDue: numeric("amount_due", { precision: 12, scale: 2 }),
  amountPaid: numeric("amount_paid", { precision: 12, scale: 2 }),
  paidDate: text("paid_date"),
  paymentMethod: text("payment_method"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type EstimatedTaxPayment = typeof estimatedTaxPaymentsTable.$inferSelect;
