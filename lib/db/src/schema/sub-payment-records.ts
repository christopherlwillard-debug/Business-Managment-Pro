import { pgTable, serial, text, timestamp, integer, numeric, boolean, date } from "drizzle-orm/pg-core";
import { jobsTable } from "./jobs";
import { subcontractorsTable } from "./subcontractors";

export const subPaymentRecordsTable = pgTable("sub_payment_records", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").references(() => jobsTable.id).notNull(),
  subcontractorId: integer("subcontractor_id").references(() => subcontractorsTable.id).notNull(),
  businessLine: text("business_line"),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  paymentDate: date("payment_date").notNull(), // YYYY-MM-DD returned as string
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
  reversalReason: text("reversal_reason"),
  bankTransactionId: integer("bank_transaction_id"),
  // Dual-rate pay breakdown (hourly subs)
  workHours: numeric("work_hours", { precision: 8, scale: 2 }),
  workRate: numeric("work_rate", { precision: 10, scale: 2 }),
  travelHours: numeric("travel_hours", { precision: 8, scale: 2 }),
  travelRate: numeric("travel_rate", { precision: 10, scale: 2 }),
  // Bonus
  bonusAmount: numeric("bonus_amount", { precision: 10, scale: 2 }),
  bonusNote: text("bonus_note"),
  // Advance against wages (deducted from net)
  advanceAmount: numeric("advance_amount", { precision: 10, scale: 2 }),
  advanceNote: text("advance_note"),
  // Computed net paid = workPay + travelPay + bonus - advance (stored for ledger display)
  netPaid: numeric("net_paid", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type SubPaymentRecord = typeof subPaymentRecordsTable.$inferSelect;
