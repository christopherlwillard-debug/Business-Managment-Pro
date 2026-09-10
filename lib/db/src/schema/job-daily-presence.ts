import { pgTable, serial, integer, text, timestamp, date, check, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { jobsTable } from "./jobs";

export const jobDailyPresenceTable = pgTable(
  "job_daily_presence",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id").notNull().references(() => jobsTable.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    state: text("state").notNull().default("unrecorded"),
    notHereReason: text("not_here_reason"),
    notes: text("notes"),
    source: text("source").notNull().default("manual_presence"),
    provenance: text("provenance").notNull().default("confirmed"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdByUserId: text("created_by_user_id"),
    createdByName: text("created_by_name"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedByUserId: text("updated_by_user_id"),
    updatedByName: text("updated_by_name"),
  },
  (table) => [
    uniqueIndex("job_daily_presence_job_date_idx").on(table.jobId, table.date),
    check(
      "job_daily_presence_state_check",
      sql`${table.state} IN ('unrecorded', 'here', 'not_here')`,
    ),
    check(
      "job_daily_presence_reason_check",
      sql`${table.notHereReason} IS NULL OR ${table.notHereReason} IN ('pulled_off', 'customer_delay', 'material_delay', 'weather', 'waiting_on_other_trade', 'other')`,
    ),
    check(
      "job_daily_presence_reason_state_check",
      sql`${table.notHereReason} IS NULL OR ${table.state} = 'not_here'`,
    ),
    check(
      "job_daily_presence_source_check",
      sql`${table.source} IN ('manual_presence', 'job_schedule', 'job_sub_hours', 'daily_log', 'checklist_status', 'job_knowledge_record', 'production_plan_snapshot')`,
    ),
    check(
      "job_daily_presence_provenance_check",
      sql`${table.provenance} IN ('confirmed', 'inferred', 'derived', 'snapshot')`,
    ),
  ],
);

export const insertJobDailyPresenceSchema = createInsertSchema(jobDailyPresenceTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertJobDailyPresence = z.infer<typeof insertJobDailyPresenceSchema>;
export type JobDailyPresence = typeof jobDailyPresenceTable.$inferSelect;