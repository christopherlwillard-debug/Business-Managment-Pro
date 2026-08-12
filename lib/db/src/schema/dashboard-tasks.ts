import { date, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { businessesTable } from "./businesses";

export const dashboardTasksTable = pgTable("dashboard_tasks", {
  id:          serial("id").primaryKey(),
  title:       text("title").notNull(),
  notes:       text("notes"),
  priority:    text("priority").notNull().default("medium"), // 'high' | 'medium' | 'low'
  dueDate:     date("due_date"),
  businessId:  integer("business_id").references(() => businessesTable.id, { onDelete: "set null" }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt:   timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type DashboardTask = typeof dashboardTasksTable.$inferSelect;
export type InsertDashboardTask = typeof dashboardTasksTable.$inferInsert;
