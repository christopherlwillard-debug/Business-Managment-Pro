import { pgTable, serial, text, timestamp, integer, smallint, boolean, jsonb, date, numeric, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";
import { subcontractorsTable } from "./subcontractors";
import { businessesTable } from "./businesses";

export const phaseItemSchema = z.object({
  name: z.string(),
  completed: z.boolean(),
});
export type PhaseItem = z.infer<typeof phaseItemSchema>;

export const permitChecklistItemSchema = z.object({
  label: z.string(),
  checked: z.boolean(),
});
export type PermitChecklistItem = z.infer<typeof permitChecklistItemSchema>;

export const serviceBillingPartSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  unitCost: z.number(),
  reimbursable: z.boolean(),
});
export type ServiceBillingPart = z.infer<typeof serviceBillingPartSchema>;

export const serviceBillingSchema = z.object({
  profileId: z.number().nullable().optional(),
  profileName: z.string().nullable().optional(),
  techCount: z.number(),
  repairHours: z.number(),
  driveHours: z.number(),
  mileage: z.number(),
  parts: z.array(serviceBillingPartSchema),
  rateSnapshot: z.object({
    repairRate1Tech: z.number().nullable().optional(),
    repairRate2Tech: z.number().nullable().optional(),
    driveRate1Tech: z.number().nullable().optional(),
    driveRate2Tech: z.number().nullable().optional(),
    mileageRate: z.number().nullable().optional(),
  }).nullable().optional(),
  internalLaborRate: z.number().nullable().optional(),
  fuelEstimate: z.number().nullable().optional(),
  workType: z.enum(["service", "contracted"]).default("service").optional(),
});
export type ServiceBilling = z.infer<typeof serviceBillingSchema>;

export const jobsTable = pgTable(
  "jobs",
  {
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
    locationName: text("location_name"),
    notes: text("notes"),
    businessLine: text("business_line"),
    businessId: integer("business_id").references(() => businessesTable.id, { onDelete: "set null" }),
    planningState: text("planning_state").notNull().default("ready"),
    priority: text("priority").notNull().default("normal"),
    resourceDemand: text("resource_demand").notNull().default("standard"),
    queuePosition: integer("queue_position"),
    subPaid: boolean("sub_paid").notNull().default(false),
    sqFt: integer("sq_ft"),
    coats: smallint("coats").default(1),
    phases: jsonb("phases").$type<PhaseItem[]>(),
    permitChecklist: jsonb("permit_checklist").$type<PermitChecklistItem[]>(),
    homeModel: text("home_model"),
    mfhManufacturerId: integer("mfh_manufacturer_id"),
    mfhModelId: integer("mfh_model_id"),
    mfhModelYear: integer("mfh_model_year"),
    mfhDealerPrice: numeric("mfh_dealer_price", { precision: 12, scale: 2 }),
    mfhQuotedPrice: numeric("mfh_quoted_price", { precision: 12, scale: 2 }),
    mfhGuideName: text("mfh_guide_name"),
    mfhSelectedAddons: jsonb("mfh_selected_addons").$type<string[]>(),
    mfhTravelDays: integer("mfh_travel_days"),
    closedAt: date("closed_at"),
    jobNumber: integer("job_number"),
    ownerPayIncluded: boolean("owner_pay_included").notNull().default(true),
    includeMileageInJobCosts: boolean("include_mileage_in_job_costs").notNull().default(true),
    workflow: text("workflow"),
    serviceBilling: jsonb("service_billing").$type<ServiceBilling>(),
    mfhConstructionType: text("mfh_construction_type"),
    mhProductionServices: jsonb("mh_production_services").$type<number[]>(),
    manHours: numeric("man_hours", { precision: 8, scale: 2 }),
    daysOnJob: integer("days_on_job"),
    daysOnJobExplicit: boolean("days_on_job_explicit").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    check("jobs_planning_state_check", sql`${table.planningState} IN ('ready', 'scheduled', 'waiting', 'queue')`),
    check("jobs_priority_check", sql`${table.priority} IN ('urgent', 'high', 'normal', 'low')`),
    check("jobs_resource_demand_check", sql`${table.resourceDemand} IN ('standard', 'large_crew', 'all_hands')`),
  ],
);

export const insertJobSchema = createInsertSchema(jobsTable).omit({ id: true, createdAt: true });
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobsTable.$inferSelect;
