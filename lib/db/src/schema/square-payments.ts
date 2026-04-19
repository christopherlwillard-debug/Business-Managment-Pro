import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { invoicesTable } from "./invoices";

export const squarePaymentsTable = pgTable("square_payments", {
  id: serial("id").primaryKey(),
  squarePaymentId: text("square_payment_id").notNull().unique(),
  amountCents: integer("amount_cents").notNull(),
  description: text("description"),
  invoiceId: integer("invoice_id").references(() => invoicesTable.id),
  invoiceNumber: text("invoice_number"),
  clientName: text("client_name"),
  paidAt: timestamp("paid_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSquarePaymentSchema = createInsertSchema(squarePaymentsTable).omit({ id: true, createdAt: true });
export type InsertSquarePayment = z.infer<typeof insertSquarePaymentSchema>;
export type SquarePayment = typeof squarePaymentsTable.$inferSelect;
