import { pgTable, serial, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { jobsTable } from "./jobs";

// Owner distributions: tracks profit withdrawals from a job.
// Named "owner_distributions" (not "owner_withdrawals") to stay entity-agnostic:
//   Sole Prop / LLC      → Owner Draw
//   Partnership          → Partner Distribution
//   S-Corp               → Shareholder Distribution
// These are NEVER business expenses — they are equity withdrawals recorded
// below the "Recommended Take Home" line in the Pay Breakdown tab.
export const ownerDistributionsTable = pgTable("owner_distributions", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").references(() => jobsTable.id).notNull(),
  businessId: integer("business_id"),               // FK to businesses table (nullable for legacy)
  ownerId: integer("owner_id"),                     // nullable — reserved for multi-owner future
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  date: text("date").notNull(),                     // YYYY-MM-DD
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type OwnerDistribution = typeof ownerDistributionsTable.$inferSelect;
export type InsertOwnerDistribution = typeof ownerDistributionsTable.$inferInsert;
