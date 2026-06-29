import { pgTable, serial, text, timestamp, integer, boolean, numeric, jsonb } from "drizzle-orm/pg-core";
import { jobTypeBenchmarksTable } from "./job-type-benchmarks";
import { checklistTemplatesTable } from "./job-checklists";

export const mfhConstructionTypesTable = pgTable("mfh_construction_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const mfhManufacturersTable = pgTable("mfh_manufacturers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
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

export type MfhConstructionType = typeof mfhConstructionTypesTable.$inferSelect;
export type MfhManufacturer = typeof mfhManufacturersTable.$inferSelect;
export type MfhModel = typeof mfhModelsTable.$inferSelect;
export type MfhPricingGuide = typeof mfhPricingGuidesTable.$inferSelect;
export type MfhGuideItem = typeof mfhGuideItemsTable.$inferSelect;
export type MfhGuideAddon = typeof mfhGuideAddonsTable.$inferSelect;
