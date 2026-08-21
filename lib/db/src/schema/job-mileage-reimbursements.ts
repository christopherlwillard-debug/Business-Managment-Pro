import { integer, numeric, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { jobsTable } from "./jobs";
import { subcontractorsTable } from "./subcontractors";

/**
 * Job-card-only reimbursement for the route-based fuel estimate.
 * This is intentionally not an expense, mileage deduction, or owner-pay ledger row.
 */
export const jobMileageReimbursementsTable = pgTable(
  "job_mileage_reimbursements",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobsTable.id, { onDelete: "cascade" }),
    businessId: integer("business_id").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
    estimatedAmount: numeric("estimated_amount", { precision: 12, scale: 2 }),
    recipientType: text("recipient_type").notNull().default("owner"),
    recipientName: text("recipient_name").notNull().default("Business owner"),
    recipientSubcontractorId: integer("recipient_subcontractor_id").references(() => subcontractorsTable.id, { onDelete: "set null" }),
    status: text("status").notNull().default("owed"),
    paidAt: timestamp("paid_at"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("job_mileage_reimbursements_job_unique").on(table.jobId),
  ],
);

export type JobMileageReimbursement = typeof jobMileageReimbursementsTable.$inferSelect;