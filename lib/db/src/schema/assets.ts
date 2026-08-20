import { pgTable, serial, text, timestamp, numeric, boolean, integer, unique } from "drizzle-orm/pg-core";
import { businessesTable } from "./businesses";

export const assetsTable = pgTable("assets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  assetType: text("asset_type").notNull().default("Other"),
  purchaseDate: text("purchase_date").notNull(),
  purchasePrice: numeric("purchase_price", { precision: 12, scale: 2 }).notNull(),
  vendor: text("vendor"),
  serialNumber: text("serial_number"),
  notes: text("notes"),
  receiptUrl: text("receipt_url"),
  section179Eligible: boolean("section_179_eligible").default(false).notNull(),
  status: text("status").notNull().default("active"),
  businessId: integer("business_id").references(() => businessesTable.id, { onDelete: "set null" }),
  saleDate: text("sale_date"),
  salePrice: numeric("sale_price", { precision: 12, scale: 2 }),
  usefulLifeYears: integer("useful_life_years"),
  salvageValue: numeric("salvage_value", { precision: 12, scale: 2 }).default("0"),
  depreciationMethod: text("depreciation_method").default("straight-line"),
  bonusDepreciationPct: integer("bonus_depreciation_pct").default(60),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Asset = typeof assetsTable.$inferSelect;
export type InsertAsset = typeof assetsTable.$inferInsert;

export const assetBusinessUseTable = pgTable("asset_business_use", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull().references(() => assetsTable.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  businessUsePct: integer("business_use_pct").notNull().default(100),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, t => [unique("asset_business_use_asset_year_unique").on(t.assetId, t.year)]);

export type AssetBusinessUse = typeof assetBusinessUseTable.$inferSelect;
export type InsertAssetBusinessUse = typeof assetBusinessUseTable.$inferInsert;
