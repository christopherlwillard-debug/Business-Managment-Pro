import {
  pgTable,
  serial,
  integer,
  text,
  numeric,
  timestamp,
  jsonb,
  check,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { businessesTable } from "./businesses";
import { mfhModelsTable } from "./mfh";

export const mfhComponentBaselineReviewStatuses = [
  "pending",
  "approved",
  "rejected",
  "superseded",
] as const;

export type MfhComponentBaselineReviewStatus =
  typeof mfhComponentBaselineReviewStatuses[number];

export type MfhComponentBaselinePresenceEvidence = {
  id?: number;
  date: string;
  state: "unrecorded" | "here" | "not_here";
  provenance: string;
  notHereReason: string | null;
  notes: string | null;
  updatedAt?: string | null;
};

export type MfhComponentBaselineSourceEvidenceJob = {
  jobId: number;
  title: string;
  expectedProductionDays: number | null;
  actualWorkDays: number | null;
  expectedVsActualDays: number | null;
  workDates: string[];
  conflictDates: string[];
  explicitPauseDays: number;
  unrecordedDays: number;
  presence: MfhComponentBaselinePresenceEvidence[];
  snapshotEvidence: Array<{
    snapshotId: number;
    snapshotVersion: number;
    expectedProductionDays: number | null;
    sessionIds: number[];
  }>;
};

export type MfhComponentBaselineSourceEvidence = {
  schemaVersion: 1;
  businessId: number;
  modelId: number;
  learningKey: string;
  componentKey: string;
  componentLabel: string;
  variant: string | null;
  customProfile: { id: number; key: string; name: string } | null;
  observationMinimumJobs: number;
  observationEligibleJobCount: number;
  jobs: MfhComponentBaselineSourceEvidenceJob[];
};

export const mfhComponentBaselineRevisionsTable = pgTable(
  "mfh_component_baseline_revisions",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id")
      .notNull()
      .references(() => businessesTable.id),
    mfhModelId: integer("mfh_model_id")
      .notNull()
      .references(() => mfhModelsTable.id),
    learningKey: text("learning_key").notNull(),
    componentKey: text("component_key").notNull(),
    componentLabel: text("component_label").notNull(),
    variant: text("variant"),
    customProfile: jsonb("custom_profile").$type<{
      id: number;
      key: string;
      name: string;
    } | null>(),
    priorApprovedRevisionId: integer("prior_approved_revision_id"),
    priorApprovedProductionDays: numeric("prior_approved_production_days", {
      precision: 8,
      scale: 2,
    }),
    proposedProductionDays: numeric("proposed_production_days", {
      precision: 8,
      scale: 2,
    }).notNull(),
    observedActualProductionDaysMedian: numeric("observed_actual_production_days_median", {
      precision: 8,
      scale: 2,
    }).notNull(),
    observedActualProductionDaysMin: numeric("observed_actual_production_days_min", {
      precision: 8,
      scale: 2,
    }).notNull(),
    observedActualProductionDaysMax: numeric("observed_actual_production_days_max", {
      precision: 8,
      scale: 2,
    }).notNull(),
    observedExpectedProductionDaysMedian: numeric("observed_expected_production_days_median", {
      precision: 8,
      scale: 2,
    }).notNull(),
    observedExpectedProductionDaysMin: numeric("observed_expected_production_days_min", {
      precision: 8,
      scale: 2,
    }).notNull(),
    observedExpectedProductionDaysMax: numeric("observed_expected_production_days_max", {
      precision: 8,
      scale: 2,
    }).notNull(),
    sampleSize: integer("sample_size").notNull(),
    sourceJobIds: integer("source_job_ids").array().notNull(),
    sourceEvidence: jsonb("source_evidence")
      .$type<MfhComponentBaselineSourceEvidence>()
      .notNull(),
    sourceEvidenceHash: text("source_evidence_hash").notNull(),
    status: text("status").notNull().default("pending"),
    reviewerNote: text("reviewer_note"),
    createdByUserId: text("created_by_user_id"),
    createdByName: text("created_by_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedByUserId: text("reviewed_by_user_id"),
    reviewedByName: text("reviewed_by_name"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    supersededByUserId: text("superseded_by_user_id"),
    supersededByName: text("superseded_by_name"),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "mfh_component_baseline_revisions_status_check",
      sql`${table.status} IN ('pending', 'approved', 'rejected', 'superseded')`,
    ),
    check(
      "mfh_component_baseline_revisions_sample_size_check",
      sql`${table.sampleSize} >= 5`,
    ),
    check(
      "mfh_component_baseline_revisions_proposed_days_check",
      sql`${table.proposedProductionDays} > 0`,
    ),
    index("mfh_component_baseline_revisions_scope_idx").on(
      table.businessId,
      table.mfhModelId,
      table.learningKey,
      table.createdAt,
    ),
    uniqueIndex("mfh_component_baseline_revisions_pending_idx")
      .on(table.businessId, table.mfhModelId, table.learningKey)
      .where(sql`${table.status} = 'pending'`),
    uniqueIndex("mfh_component_baseline_revisions_approved_idx")
      .on(table.businessId, table.mfhModelId, table.learningKey)
      .where(sql`${table.status} = 'approved'`),
  ],
);

export const insertMfhComponentBaselineRevisionSchema = createInsertSchema(
  mfhComponentBaselineRevisionsTable,
).omit({
  id: true,
  createdAt: true,
});

export type InsertMfhComponentBaselineRevision = z.infer<
  typeof insertMfhComponentBaselineRevisionSchema
>;
export type MfhComponentBaselineRevision =
  typeof mfhComponentBaselineRevisionsTable.$inferSelect;