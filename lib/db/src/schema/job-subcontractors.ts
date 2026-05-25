import { pgTable, integer, primaryKey, numeric, text } from "drizzle-orm/pg-core";
import { jobsTable } from "./jobs";
import { subcontractorsTable } from "./subcontractors";

export const jobSubcontractorsTable = pgTable("job_subcontractors", {
  jobId: integer("job_id").references(() => jobsTable.id, { onDelete: "cascade" }).notNull(),
  subcontractorId: integer("subcontractor_id").references(() => subcontractorsTable.id, { onDelete: "cascade" }).notNull(),
  amountOwed: numeric("amount_owed", { precision: 12, scale: 2 }),
  amountPaid: numeric("amount_paid", { precision: 12, scale: 2 }),
  paidDate: text("paid_date"),
  paidNotes: text("paid_notes"),
}, (table) => [primaryKey({ columns: [table.jobId, table.subcontractorId] })]);
