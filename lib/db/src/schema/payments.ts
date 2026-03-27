import { pgTable, serial, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { subcontractorsTable } from "./subcontractors";

export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  subcontractorId: integer("subcontractor_id").references(() => subcontractorsTable.id),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  paymentDate: text("payment_date").notNull(), // YYYY-MM-DD
  year: integer("year").notNull(), // Tax year
  description: text("description"),
  invoiceNumber: text("invoice_number"),
  notes: text("notes"),
  paymentMethod: text("payment_method"), // cash | check | ach | credit_card | third_party_app
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({ id: true, createdAt: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof paymentsTable.$inferSelect;
