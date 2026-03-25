import { pgTable, integer, primaryKey } from "drizzle-orm/pg-core";
import { jobsTable } from "./jobs";
import { subcontractorsTable } from "./subcontractors";

export const jobSubcontractorsTable = pgTable("job_subcontractors", {
  jobId: integer("job_id").references(() => jobsTable.id, { onDelete: "cascade" }).notNull(),
  subcontractorId: integer("subcontractor_id").references(() => subcontractorsTable.id, { onDelete: "cascade" }).notNull(),
}, (table) => [primaryKey({ columns: [table.jobId, table.subcontractorId] })]);
