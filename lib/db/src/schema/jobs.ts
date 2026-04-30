import { pgTable, serial, text, timestamp, integer, smallint, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";
import { subcontractorsTable } from "./subcontractors";

export const jobsTable = pgTable("jobs", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  clientId: integer("client_id").references(() => clientsTable.id),
  subcontractorId: integer("subcontractor_id").references(() => subcontractorsTable.id),
  status: text("status").notNull().default("scheduled"),
  jobType: text("job_type"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  estimatedAmount: numeric("estimated_amount", { precision: 12, scale: 2 }),
  actualAmount: numeric("actual_amount", { precision: 12, scale: 2 }),
  locationName: text("location_name"),
  notes: text("notes"),
  businessLine: text("business_line"),
  subPaid: boolean("sub_paid").notNull().default(false),
  sqFt: integer("sq_ft"),
  coats: smallint("coats").default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertJobSchema = createInsertSchema(jobsTable).omit({ id: true, createdAt: true });
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobsTable.$inferSelect;
