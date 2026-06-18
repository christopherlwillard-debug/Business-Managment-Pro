import { pgTable, serial, text, timestamp, integer, numeric, boolean } from "drizzle-orm/pg-core";
import { jobsTable } from "./jobs";
import { subcontractorsTable } from "./subcontractors";

export const subPaymentRecordsTable = pgTable("sub_payment_records", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").references(() => jobsTable.id).notNull(),
  subcontractorId: integer("subcontractor_id").references(() => subcontractorsTable.id).notNull(),
  businessLine: text("business_line"),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  paymentDate: text("payment_date").notNull(), // YYYY-MM-DD
  description: text("description"),
  notes: text("notes"),
  paymentMethod: text("payment_method"),
  referenceNumber: text("reference_number"),
  recordedBy: text("recorded_by"),
  createdFrom: text("created_from").default("pay-worker"),
  idempotencyKey: text("idempotency_key").unique(),
  agreedOwedSnapshot: numeric("agreed_owed_snapshot", { precision: 10, scale: 2 }),
  isReversal: boolean("is_reversal").default(false),
  reversesPaymentId: integer("reverses_payment_id"),
  bankTransactionId: integer("bank_transaction_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type SubPaymentRecord = typeof subPaymentRecordsTable.$inferSelect;
