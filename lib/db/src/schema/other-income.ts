import { pgTable, serial, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const otherIncomeTable = pgTable("other_income", {
  id: serial("id").primaryKey(),
  businessId: text("business_id"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  date: text("date").notNull(),
  description: text("description").notNull(),
  source: text("source"),
  paymentMethod: text("payment_method").notNull().default("other"),
  city: text("city"),
  state: text("state"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertOtherIncomeSchema = createInsertSchema(otherIncomeTable).omit({ id: true, createdAt: true });
export type InsertOtherIncome = z.infer<typeof insertOtherIncomeSchema>;
export type OtherIncome = typeof otherIncomeTable.$inferSelect;
