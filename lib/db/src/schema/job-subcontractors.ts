import { pgTable, integer, primaryKey, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { jobsTable } from "./jobs";
import { subcontractorsTable } from "./subcontractors";

export const jobSubcontractorsTable = pgTable("job_subcontractors", {
  jobId: integer("job_id").references(() => jobsTable.id, { onDelete: "cascade" }).notNull(),
  subcontractorId: integer("subcontractor_id").references(() => subcontractorsTable.id, { onDelete: "cascade" }).notNull(),
  amountOwed: numeric("amount_owed", { precision: 12, scale: 2 }),
  amountPaid: numeric("amount_paid", { precision: 12, scale: 2 }),
  paidDate: text("paid_date"),
  paidNotes: text("paid_notes"),
  compensationType: text("compensation_type").notNull().default("hourly"),
  hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 }),
  travelRate: numeric("travel_rate", { precision: 10, scale: 2 }),
  fixedAmount: numeric("fixed_amount", { precision: 10, scale: 2 }),
  allocationPct: numeric("allocation_pct", { precision: 5, scale: 2 }),
  // paymentStatus: "unpaid" | "partial" | "paid"
  paymentStatus: text("payment_status").notNull().default("unpaid"),
  paidAt: timestamp("paid_at", { mode: "string" }),       // first payment date — never overwritten
  lastPaidAt: timestamp("last_paid_at", { mode: "string" }), // most recent payment date — updated every call
  // Draft payroll fields — saved without recording a payment (accrued but not yet paid)
  accruedBonus: numeric("accrued_bonus", { precision: 12, scale: 2 }),
  accruedBonusNote: text("accrued_bonus_note"),
  accruedAdvancement: numeric("accrued_advancement", { precision: 12, scale: 2 }),
  paymentMethodDraft: text("payment_method_draft"),
  paymentReferenceDraft: text("payment_reference_draft"),
}, (table) => [primaryKey({ columns: [table.jobId, table.subcontractorId] })]);
