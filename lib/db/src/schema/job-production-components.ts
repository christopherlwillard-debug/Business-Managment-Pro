import { pgTable, serial, text, timestamp, integer, numeric, jsonb, unique, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { jobsTable } from "./jobs";
import { businessesTable } from "./businesses";

export const productionComponentKeys = [
  "interior_finish",
  "siding",
  "plumbing",
  "skirting",
  "custom",
] as const;

export type ProductionComponentKey = typeof productionComponentKeys[number];

export const interiorFinishVariants = ["vog", "hybrid", "drywall"] as const;
export type InteriorFinishVariant = typeof interiorFinishVariants[number];

export const productionComponentStatuses = [
  "planned",
  "in_progress",
  "paused",
  "completed",
  "not_applicable",
] as const;
export type ProductionComponentStatus = typeof productionComponentStatuses[number];

export type ProductionComponentSourceService = {
  id: number;
  name: string;
  itemKey: string | null;
  category: string | null;
  appliesTo: string;
};

export type ProductionComponentContext = Record<string, unknown>;

export const jobProductionComponentsTable = pgTable("job_production_components", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => jobsTable.id, { onDelete: "cascade" }),
  businessId: integer("business_id").references(() => businessesTable.id, { onDelete: "set null" }),
  componentKey: text("component_key").notNull(),
  componentInstanceKey: text("component_instance_key").notNull(),
  componentLabel: text("component_label").notNull(),
  variant: text("variant"),
  sourceServiceIds: jsonb("source_service_ids").$type<number[]>().notNull().default([]),
  sourceServices: jsonb("source_services").$type<ProductionComponentSourceService[]>().notNull().default([]),
  snapshotVersion: integer("snapshot_version").notNull().default(1),
  status: text("status").notNull().default("planned"),
  expectedLaborHours: numeric("expected_labor_hours", { precision: 8, scale: 2 }),
  expectedDurationDays: integer("expected_duration_days"),
  expectedCrewSize: integer("expected_crew_size"),
  checklistContext: jsonb("checklist_context").$type<ProductionComponentContext>(),
  materialContext: jsonb("material_context").$type<ProductionComponentContext>(),
  pricingContext: jsonb("pricing_context").$type<ProductionComponentContext>(),
  knowledgeContext: jsonb("knowledge_context").$type<ProductionComponentContext>(),
  capturedAt: timestamp("captured_at").defaultNow().notNull(),
  supersededAt: timestamp("superseded_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("job_production_components_version_unique")
    .on(table.jobId, table.componentInstanceKey, table.snapshotVersion),
  index("job_production_components_job_current_idx")
    .on(table.jobId, table.supersededAt),
  check(
    "job_production_components_key_check",
    sql`${table.componentKey} IN ('interior_finish', 'siding', 'plumbing', 'skirting', 'custom')`,
  ),
  check(
    "job_production_components_variant_check",
    sql`${table.variant} IS NULL OR ${table.variant} IN ('vog', 'hybrid', 'drywall')`,
  ),
  check(
    "job_production_components_status_check",
    sql`${table.status} IN ('planned', 'in_progress', 'paused', 'completed', 'not_applicable')`,
  ),
]);

export type JobProductionComponent = typeof jobProductionComponentsTable.$inferSelect;
export type InsertJobProductionComponent = typeof jobProductionComponentsTable.$inferInsert;