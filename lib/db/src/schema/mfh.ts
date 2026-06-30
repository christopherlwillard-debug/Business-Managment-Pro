import { pgTable, serial, text, timestamp, integer, boolean, numeric, jsonb } from "drizzle-orm/pg-core";
import { jobTypeBenchmarksTable } from "./job-type-benchmarks";
import { checklistTemplatesTable } from "./job-checklists";

export const mfhConstructionTypesTable = pgTable("mfh_construction_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Home Series = the priced, field-recognised designation (Southern, Giles,
// Appalachia, …). Carries the construction type, pricing, benchmark, checklist,
// default add-ons and notes. The dealer is captured by the job's Client field,
// so there is intentionally no manufacturer/dealer entity here.
export const mfhHomeSeriesTable = pgTable("mfh_home_series", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  constructionTypeId: integer("construction_type_id").notNull().references(() => mfhConstructionTypesTable.id),
  benchmarkId: integer("benchmark_id").references(() => jobTypeBenchmarksTable.id, { onDelete: "set null" }),
  checklistTemplateId: integer("checklist_template_id").references(() => checklistTemplatesTable.id, { onDelete: "set null" }),
  defaultAddonKeys: jsonb("default_addon_keys").$type<string[]>().default([]),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  introducedYear: integer("introduced_year"),
  discontinuedYear: integer("discontinued_year"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Model = the genuine model name (Farmhouse, Freedom, Heritage, …) sitting under
// a Home Series. Optional and descriptive; it inherits the series' construction
// type, pricing, benchmark, checklist and add-ons.
export const mfhModelsTable = pgTable("mfh_models", {
  id: serial("id").primaryKey(),
  homeSeriesId: integer("home_series_id").notNull().references(() => mfhHomeSeriesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  introducedYear: integer("introduced_year"),
  discontinuedYear: integer("discontinued_year"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Pricing guides are global (Dealer Guide / My Pricing). They are no longer
// scoped to a dealer/manufacturer.
export const mfhPricingGuidesTable = pgTable("mfh_pricing_guides", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  isDealerGuide: boolean("is_dealer_guide").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const mfhGuideItemsTable = pgTable("mfh_guide_items", {
  id: serial("id").primaryKey(),
  guideId: integer("guide_id").notNull().references(() => mfhPricingGuidesTable.id, { onDelete: "cascade" }),
  homeSeriesId: integer("home_series_id").notNull().references(() => mfhHomeSeriesTable.id, { onDelete: "cascade" }),
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

export type MfhConstructionType = typeof mfhConstructionTypesTable.$inferSelect;
export type MfhHomeSeries = typeof mfhHomeSeriesTable.$inferSelect;
export type MfhModel = typeof mfhModelsTable.$inferSelect;
export type MfhPricingGuide = typeof mfhPricingGuidesTable.$inferSelect;
export type MfhGuideItem = typeof mfhGuideItemsTable.$inferSelect;
export type MfhGuideAddon = typeof mfhGuideAddonsTable.$inferSelect;
