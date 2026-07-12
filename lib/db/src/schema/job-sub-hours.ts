import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { jobsTable } from "./jobs";
import { subcontractorsTable } from "./subcontractors";

export const jobSubHoursTable = pgTable("job_sub_hours", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").references(() => jobsTable.id, { onDelete: "cascade" }).notNull(),
  subcontractorId: integer("subcontractor_id").references(() => subcontractorsTable.id, { onDelete: "cascade" }).notNull(),
  date: text("date").notNull(),
  hours: numeric("hours", { precision: 6, scale: 2 }).notNull(),
  hourType: text("hour_type"),
  description: text("description"),
  rateSnapshot: numeric("rate_snapshot", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertJobSubHoursSchema = createInsertSchema(jobSubHoursTable).omit({ id: true, createdAt: true });
export type InsertJobSubHours = z.infer<typeof insertJobSubHoursSchema>;
export type JobSubHours = typeof jobSubHoursTable.$inferSelect;
