import { pgTable, serial, text, timestamp, numeric, boolean, integer } from "drizzle-orm/pg-core";

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
