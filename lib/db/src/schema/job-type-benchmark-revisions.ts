import { pgTable, serial, integer, text, numeric, timestamp, check, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { jobTypeBenchmarksTable } from "./job-type-benchmarks";
import { mfhModelsTable } from "./mfh";

export const jobTypeBenchmarkRevisionsTable = pgTable(
  "job_type_benchmark_revisions",
  {
    id: serial("id").primaryKey(),
    benchmarkId: integer("benchmark_id").notNull().references(() => jobTypeBenchmarksTable.id, { onDelete: "cascade" }),
    mfhModelId: integer("mfh_model_id").notNull().references(() => mfhModelsTable.id, { onDelete: "cascade" }),
    priorBenchmarkHours: numeric("prior_benchmark_hours", { precision: 8, scale: 2 }),
    proposedBenchmarkHours: numeric("proposed_benchmark_hours", { precision: 8, scale: 2 }).notNull(),
    observedProductionDaysMedian: numeric("observed_production_days_median", { precision: 8, scale: 2 }).notNull(),
    observedProductionDaysMin: numeric("observed_production_days_min", { precision: 8, scale: 2 }).notNull(),
    observedProductionDaysMax: numeric("observed_production_days_max", { precision: 8, scale: 2 }).notNull(),
    sampleSize: integer("sample_size").notNull(),
    sourceJobIds: integer("source_job_ids").array().notNull(),
    status: text("status").notNull().default("pending"),
    reviewerNote: text("reviewer_note"),
    createdByUserId: text("created_by_user_id"),
    createdByName: text("created_by_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedByUserId: text("reviewed_by_user_id"),
    reviewedByName: text("reviewed_by_name"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (table) => [
    check("job_type_benchmark_revisions_status_check", sql`${table.status} IN ('pending', 'approved', 'rejected')`),
    check("job_type_benchmark_revisions_sample_size_check", sql`${table.sampleSize} >= 3`),
    uniqueIndex("job_type_benchmark_revisions_pending_idx")
      .on(table.mfhModelId, table.benchmarkId)
      .where(sql`${table.status} = 'pending'`),
  ],
);

export const insertJobTypeBenchmarkRevisionSchema = createInsertSchema(jobTypeBenchmarkRevisionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertJobTypeBenchmarkRevision = z.infer<typeof insertJobTypeBenchmarkRevisionSchema>;
export type JobTypeBenchmarkRevision = typeof jobTypeBenchmarkRevisionsTable.$inferSelect;