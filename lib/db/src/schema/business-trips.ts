import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { jobsTable } from "./jobs";

export const businessTripsTable = pgTable("business_trips", {
  id: serial("id").primaryKey(),
  destination: text("destination").notNull(),
  businessPurpose: text("business_purpose"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  jobId: integer("job_id").references(() => jobsTable.id, { onDelete: "set null" }),
  status: text("status").default("open").notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closedBy: text("closed_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type BusinessTrip = typeof businessTripsTable.$inferSelect;
export type InsertBusinessTrip = typeof businessTripsTable.$inferInsert;
