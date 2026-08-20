import { pgTable, serial, text, timestamp, numeric, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";
import { jobsTable } from "./jobs";

export const otherIncomeTable = pgTable("other_income", {
  id: serial("id").primaryKey(),
  businessId: text("business_id"),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "set null" }),
  jobId: integer("job_id").references(() => jobsTable.id, { onDelete: "set null" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  date: text("date").notNull(),
  description: text("description").notNull(),
  source: text("source"),
  paymentMethod: text("payment_method").notNull().default("other"),
  city: text("city"),
  state: text("state"),
  notes: text("notes"),
  businessLine: text("business_line"),
  voidedAt: timestamp("voided_at"),
  voidReason: text("void_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertOtherIncomeSchema = createInsertSchema(otherIncomeTable).omit({ id: true, createdAt: true });
export type InsertOtherIncome = z.infer<typeof insertOtherIncomeSchema>;
export type OtherIncome = typeof otherIncomeTable.$inferSelect;
