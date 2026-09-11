import { pgTable, serial, integer, date, text, numeric, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { jobsTable } from "./jobs";
import { jobProductionComponentsTable } from "./job-production-components";
import { subcontractorsTable } from "./subcontractors";

export const jobComponentWorkSessionsTable = pgTable("job_component_work_sessions", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => jobsTable.id, { onDelete: "cascade" }),
  productionComponentId: integer("production_component_id")
    .notNull()
    .references(() => jobProductionComponentsTable.id, { onDelete: "restrict" }),
  workDate: date("work_date").notNull(),
  linkedSubcontractorId: integer("linked_subcontractor_id")
    .references(() => subcontractorsTable.id, { onDelete: "set null" }),
  workerName: text("worker_name").notNull(),
  actualHours: numeric("actual_hours", { precision: 6, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  check(
    "job_component_work_sessions_hours_check",
    sql`${table.actualHours} > 0 AND ${table.actualHours} <= 24`,
  ),
  index("job_component_work_sessions_job_date_idx").on(table.jobId, table.workDate),
  index("job_component_work_sessions_component_idx").on(table.productionComponentId),
]);

export type JobComponentWorkSession = typeof jobComponentWorkSessionsTable.$inferSelect;
export type InsertJobComponentWorkSession = typeof jobComponentWorkSessionsTable.$inferInsert;