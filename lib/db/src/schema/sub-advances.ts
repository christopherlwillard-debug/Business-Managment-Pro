import { pgTable, serial, text, timestamp, integer, numeric, date } from "drizzle-orm/pg-core";
import { jobsTable } from "./jobs";
import { subcontractorsTable } from "./subcontractors";

export const subAdvancesTable = pgTable("sub_advances", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").references(() => jobsTable.id).notNull(),
  subcontractorId: integer("subcontractor_id").references(() => subcontractorsTable.id).notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  description: text("description").notNull(),
  advanceDate: date("advance_date").notNull(),
  appliedPaymentId: integer("applied_payment_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type SubAdvance = typeof subAdvancesTable.$inferSelect;
