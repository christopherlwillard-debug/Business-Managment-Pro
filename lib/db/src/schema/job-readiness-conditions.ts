import { pgTable, serial, text, timestamp, integer, date, check, index } from "drizzle-orm/pg-core";
import { desc, sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { jobsTable } from "./jobs";
import { businessesTable } from "./businesses";

/** Internal scheduling blockers. These are deliberately separate from customer-facing checklist delay logs. */
export const jobReadinessConditionsTable = pgTable(
  "job_readiness_conditions",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id").notNull().references(() => jobsTable.id, { onDelete: "cascade" }),
    businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    detail: text("detail"),
    expectedDate: date("expected_date", { mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdByUserId: text("created_by_user_id"),
    createdByName: text("created_by_name"),
    clearedAt: timestamp("cleared_at", { withTimezone: true }),
    clearedByUserId: text("cleared_by_user_id"),
    clearedByName: text("cleared_by_name"),
  },
  (table) => [
    check(
      "job_readiness_conditions_reason_check",
      sql`${table.reason} IN ('electricity', 'water', 'materials', 'inspection', 'crew', 'access', 'other')`,
    ),
    index("job_readiness_conditions_active_job_idx")
      .on(table.jobId, desc(table.createdAt))
      .where(sql`${table.clearedAt} IS NULL`),
  ],
);

export const insertJobReadinessConditionSchema = createInsertSchema(jobReadinessConditionsTable)
  .omit({ id: true, createdAt: true, clearedAt: true, clearedByUserId: true, clearedByName: true });
export type InsertJobReadinessCondition = z.infer<typeof insertJobReadinessConditionSchema>;
export type JobReadinessCondition = typeof jobReadinessConditionsTable.$inferSelect;