import { pgTable, serial, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const jobTypeBenchmarksTable = pgTable("job_type_benchmarks", {
  id: serial("id").primaryKey(),
  jobType: text("job_type").notNull().unique(),
  estimatedHours: numeric("estimated_hours", { precision: 8, scale: 2 }),
  estimatedLaborCost: numeric("estimated_labor_cost", { precision: 12, scale: 2 }),
  estimatedMaterialCost: numeric("estimated_material_cost", { precision: 12, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertJobTypeBenchmarkSchema = createInsertSchema(jobTypeBenchmarksTable).omit({ id: true, createdAt: true });
export type InsertJobTypeBenchmark = z.infer<typeof insertJobTypeBenchmarkSchema>;
export type JobTypeBenchmark = typeof jobTypeBenchmarksTable.$inferSelect;
