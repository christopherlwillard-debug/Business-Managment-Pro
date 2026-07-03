import { pgTable, serial, text, timestamp, integer, boolean, numeric, jsonb, unique } from "drizzle-orm/pg-core";
import { jobTypeBenchmarksTable } from "./job-type-benchmarks";
import { checklistTemplatesTable } from "./job-checklists";
import { clientsTable } from "./clients";
import { jobsTable } from "./jobs";
import { subcontractorsTable } from "./subcontractors";

export const mfhConstructionTypesTable = pgTable("mfh_construction_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const mfhManufacturersTable = pgTable("mfh_manufacturers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const mfhModelsTable = pgTable("mfh_models", {
  id: serial("id").primaryKey(),
  manufacturerId: integer("manufacturer_id").notNull().references(() => mfhManufacturersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  constructionTypeId: integer("construction_type_id").notNull().references(() => mfhConstructionTypesTable.id),
  benchmarkId: integer("benchmark_id").references(() => jobTypeBenchmarksTable.id, { onDelete: "set null" }),
  checklistTemplateId: integer("checklist_template_id").references(() => checklistTemplatesTable.id, { onDelete: "set null" }),
  defaultAddonKeys: jsonb("default_addon_keys").$type<string[]>().default([]),
  basePrice: numeric("base_price", { precision: 12, scale: 2 }),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  introducedYear: integer("introduced_year"),
  discontinuedYear: integer("discontinued_year"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const mfhPricingGuidesTable = pgTable("mfh_pricing_guides", {
  id: serial("id").primaryKey(),
  manufacturerId: integer("manufacturer_id").notNull().references(() => mfhManufacturersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  isDealerGuide: boolean("is_dealer_guide").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const mfhGuideItemsTable = pgTable("mfh_guide_items", {
  id: serial("id").primaryKey(),
  guideId: integer("guide_id").notNull().references(() => mfhPricingGuidesTable.id, { onDelete: "cascade" }),
  modelId: integer("model_id").notNull().references(() => mfhModelsTable.id, { onDelete: "cascade" }),
  basePrice: numeric("base_price", { precision: 12, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const mfhGuideAddonsTable = pgTable("mfh_guide_addons", {
  id: serial("id").primaryKey(),
  guideId: integer("guide_id").notNull().references(() => mfhPricingGuidesTable.id, { onDelete: "cascade" }),
  addonKey: text("addon_key").notNull(),
  label: text("label").notNull(),
  price: numeric("price", { precision: 12, scale: 2 }).notNull().default("0"),
  isPerDay: boolean("is_per_day").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const mfhClientPricingTable = pgTable("mfh_client_pricing", {
  id: serial("id").primaryKey(),
  modelId: integer("model_id").notNull().references(() => mfhModelsTable.id, { onDelete: "cascade" }),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  price: numeric("price", { precision: 12, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const jobLaborEntriesTable = pgTable("job_labor_entries", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => jobsTable.id, { onDelete: "cascade" }),
  personName: text("person_name").notNull(),
  workerType: text("worker_type").notNull().default("sub"),
  linkedSubcontractorId: integer("linked_subcontractor_id").references(() => subcontractorsTable.id, { onDelete: "set null" }),
  productiveHours: numeric("productive_hours", { precision: 8, scale: 2 }).notNull().default("0"),
  travelHours: numeric("travel_hours", { precision: 8, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const jobKnowledgeRecordsTable = pgTable("job_knowledge_records", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().unique().references(() => jobsTable.id, { onDelete: "cascade" }),
  mfhModelId: integer("mfh_model_id").references(() => mfhModelsTable.id, { onDelete: "set null" }),
  builderId: integer("builder_id").references(() => mfhManufacturersTable.id, { onDelete: "set null" }),
  builderNameSnapshot: text("builder_name_snapshot"),
  modelNameSnapshot: text("model_name_snapshot"),
  status: text("status").notNull().default("draft"),
  taughtAt: timestamp("taught_at"),
  productiveHours: numeric("productive_hours", { precision: 8, scale: 2 }),
  travelHours: numeric("travel_hours", { precision: 8, scale: 2 }),
  crewSize: integer("crew_size"),
  daysOnSite: integer("days_on_site"),
  invoiceAmount: numeric("invoice_amount", { precision: 12, scale: 2 }),
  materialCost: numeric("material_cost", { precision: 12, scale: 2 }),
  consumablesCost: numeric("consumables_cost", { precision: 12, scale: 2 }),
  grossProfit: numeric("gross_profit", { precision: 12, scale: 2 }),
  netProfit: numeric("net_profit", { precision: 12, scale: 2 }),
  callbacks: integer("callbacks").notNull().default(0),
  warrantyVisit: boolean("warranty_visit").notNull().default(false),
  missingMaterialsNotes: text("missing_materials_notes"),
  factoryDefectNotes: text("factory_defect_notes"),
  originalProductiveHours: numeric("original_productive_hours", { precision: 8, scale: 2 }),
  originalValues: jsonb("original_values").$type<Record<string, unknown>>(),
  editReason: text("edit_reason"),
  editedAt: timestamp("edited_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const jobKnowledgeRecordVersionsTable = pgTable("job_knowledge_record_versions", {
  id: serial("id").primaryKey(),
  knowledgeRecordId: integer("knowledge_record_id").notNull().references(() => jobKnowledgeRecordsTable.id, { onDelete: "cascade" }),
  jobId: integer("job_id").notNull().references(() => jobsTable.id, { onDelete: "cascade" }),
  snapshotAt: timestamp("snapshot_at").defaultNow().notNull(),
  editReason: text("edit_reason"),
  beforeValues: jsonb("before_values").$type<Record<string, unknown>>().notNull(),
  afterValues: jsonb("after_values").$type<Record<string, unknown>>().notNull(),
});

// Master Production Billing Catalog. Each row is one Production Billing Item.
// itemKey is a stable identifier used for idempotent seeding/upserts (names are
// user-editable and rows are referenced by jobs.mhProductionServices IDs, so we
// never match on name for seeds). price* columns are the master prices:
//   price            = flat/all-home-types price
//   priceVog/Hybrid/Drywall = optional per-home-type variants (one row, three prices)
// billingType is an application-defined value (see BILLING_TYPES in api-server).
export const productionServiceTypesTable = pgTable("production_service_types", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id"),
  itemKey: text("item_key"),
  name: text("name").notNull(),
  invoiceDescription: text("invoice_description"),
  billingType: text("billing_type").notNull().default("Fixed"),
  taxable: boolean("taxable").notNull().default(false),
  category: text("category"),
  // Which job workflow this item belongs to: 'production' (MH Production jobs'
  // "Services Included" list) or 'service' (service/warranty work only).
  appliesTo: text("applies_to").notNull().default("production"),
  price: numeric("price", { precision: 12, scale: 2 }),
  priceVog: numeric("price_vog", { precision: 12, scale: 2 }),
  priceHybrid: numeric("price_hybrid", { precision: 12, scale: 2 }),
  priceDrywall: numeric("price_drywall", { precision: 12, scale: 2 }),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Per-client Production pricing profile: stores ONLY prices that differ from the
// master catalog. profileKind allows future Service/Contracting profiles on the
// same client without new client records or engine changes. A null price* column
// means "fall back to the master value" at resolution time.
export const productionPriceOverridesTable = pgTable("production_price_overrides", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  serviceTypeId: integer("service_type_id").notNull().references(() => productionServiceTypesTable.id, { onDelete: "cascade" }),
  profileKind: text("profile_kind").notNull().default("production"),
  price: numeric("price", { precision: 12, scale: 2 }),
  priceVog: numeric("price_vog", { precision: 12, scale: 2 }),
  priceHybrid: numeric("price_hybrid", { precision: 12, scale: 2 }),
  priceDrywall: numeric("price_drywall", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  uniqClientProfileService: unique().on(t.clientId, t.profileKind, t.serviceTypeId),
}));

export type MfhConstructionType = typeof mfhConstructionTypesTable.$inferSelect;
export type MfhManufacturer = typeof mfhManufacturersTable.$inferSelect;
export type MfhModel = typeof mfhModelsTable.$inferSelect;
export type MfhPricingGuide = typeof mfhPricingGuidesTable.$inferSelect;
export type MfhGuideItem = typeof mfhGuideItemsTable.$inferSelect;
export type MfhGuideAddon = typeof mfhGuideAddonsTable.$inferSelect;
export type MfhClientPricing = typeof mfhClientPricingTable.$inferSelect;
export type JobLaborEntry = typeof jobLaborEntriesTable.$inferSelect;
export type JobKnowledgeRecord = typeof jobKnowledgeRecordsTable.$inferSelect;
export type JobKnowledgeRecordVersion = typeof jobKnowledgeRecordVersionsTable.$inferSelect;
export type ProductionServiceType = typeof productionServiceTypesTable.$inferSelect;
export type ProductionPriceOverride = typeof productionPriceOverridesTable.$inferSelect;
