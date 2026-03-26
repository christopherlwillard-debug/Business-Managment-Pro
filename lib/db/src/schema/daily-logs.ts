import { pgTable, serial, text, timestamp, integer, numeric, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { jobsTable } from "./jobs";
import { materialListsTable } from "./material-lists";

export const dailyLogsTable = pgTable("daily_logs", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").references(() => jobsTable.id),
  date: text("date").notNull(),
  weather: text("weather"),
  crewCount: integer("crew_count"),
  workCompleted: text("work_completed"),
  issues: text("issues"),
  materialsUsed: text("materials_used"),
  hoursWorked: numeric("hours_worked", { precision: 5, scale: 2 }),
  notes: text("notes"),
  photoUrls: jsonb("photo_urls").default("[]"),
  materialListId: integer("material_list_id").references(() => materialListsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDailyLogSchema = createInsertSchema(dailyLogsTable).omit({ id: true, createdAt: true });
export type InsertDailyLog = z.infer<typeof insertDailyLogSchema>;
export type DailyLog = typeof dailyLogsTable.$inferSelect;
