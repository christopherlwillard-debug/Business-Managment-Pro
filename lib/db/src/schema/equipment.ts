import {
  pgTable, serial, integer, text, boolean, numeric, date,
  timestamp, uniqueIndex,
} from "drizzle-orm/pg-core";

// Forward-reference businesses without a circular import: use integer FK only.
// If you need a relation, add it via drizzle relations() in a separate relations file.

export const equipmentInventoryTable = pgTable("equipment_inventory", {
  id:             serial("id").primaryKey(),
  businessId:     integer("business_id"),          // nullable FK → businesses
  name:           text("name").notNull(),
  category:       text("category").notNull().default("other"),
  subcategory:    text("subcategory"),
  year:           integer("year"),
  make:           text("make"),
  model:          text("model"),
  serialNumber:   text("serial_number"),
  condition:      text("condition").notNull().default("good"),
  status:         text("status").notNull().default("in_service"),
  estimatedValue: numeric("estimated_value",  { precision: 12, scale: 2 }),
  purchasePrice:  numeric("purchase_price",   { precision: 12, scale: 2 }),
  purchaseDate:   date("purchase_date"),
  notes:          text("notes"),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const equipmentSourcesTable = pgTable("equipment_sources", {
  slug:                text("slug").primaryKey(),
  name:                text("name").notNull(),
  category:            text("category").notNull().default("government_surplus"),
  connectionMethod:    text("connection_method").notNull().default("portal_link_only"),
  automatedDiscovery:  boolean("automated_discovery").notNull().default(false),
  baseUrl:             text("base_url"),
  notes:               text("notes"),
  globallyActive:      boolean("globally_active").notNull().default(true),
  createdAt:           timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const equipmentOpportunitiesTable = pgTable("equipment_opportunities", {
  id:                     serial("id").primaryKey(),
  sourceSlug:             text("source_slug").notNull(),
  externalId:             text("external_id").notNull(),
  title:                  text("title").notNull(),
  description:            text("description"),
  category:               text("category"),
  locationText:           text("location_text"),
  locationState:          text("location_state"),
  listingType:            text("listing_type").notNull().default("auction"),
  startPrice:             numeric("start_price",    { precision: 12, scale: 2 }),
  currentPrice:           numeric("current_price",  { precision: 12, scale: 2 }),
  buyNowPrice:            numeric("buy_now_price",  { precision: 12, scale: 2 }),
  auctionEndAt:           timestamp("auction_end_at", { withTimezone: true }),
  listingUrl:             text("listing_url").notNull(),
  imageUrl:               text("image_url"),
  isGovernmentSurplus:    boolean("is_government_surplus").notNull().default(false),
  conditionNotes:         text("condition_notes"),
  userDecision:           text("user_decision"),
  userDecisionAt:         timestamp("user_decision_at", { withTimezone: true }),
  userDecisionBusinessId: integer("user_decision_business_id"),
  userNotes:              text("user_notes"),
  relevanceScore:         integer("relevance_score").notNull().default(0),
  matchedCategories:      text("matched_categories").array(),
  firstSeenAt:            timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSyncedAt:           timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  sourceExternalUniq: uniqueIndex("equip_opp_source_external_uniq").on(t.sourceSlug, t.externalId),
}));

// ── Types ──────────────────────────────────────────────────────────────────────
export type EquipmentInventoryItem = typeof equipmentInventoryTable.$inferSelect;
export type InsertEquipmentInventoryItem = typeof equipmentInventoryTable.$inferInsert;
export type EquipmentSource = typeof equipmentSourcesTable.$inferSelect;
export type InsertEquipmentSource = typeof equipmentSourcesTable.$inferInsert;
export type EquipmentOpportunity = typeof equipmentOpportunitiesTable.$inferSelect;
export type InsertEquipmentOpportunity = typeof equipmentOpportunitiesTable.$inferInsert;

// ── Domain constants ───────────────────────────────────────────────────────────
export const EQUIPMENT_CATEGORIES = [
  "earthmoving",
  "asphalt_sealing",
  "hauling",
  "trailers",
  "compaction",
  "attachments",
  "tools",
  "other",
] as const;
export type EquipmentCategory = typeof EQUIPMENT_CATEGORIES[number];

export const EQUIPMENT_CONDITIONS = ["excellent", "good", "fair", "poor", "for_parts"] as const;
export type EquipmentCondition = typeof EQUIPMENT_CONDITIONS[number];

export const EQUIPMENT_STATUSES = ["in_service", "stored", "for_sale", "retired"] as const;
export type EquipmentStatus = typeof EQUIPMENT_STATUSES[number];

export const EQUIPMENT_DECISIONS = ["buy", "bid_now", "watch", "pass"] as const;
export type EquipmentDecision = typeof EQUIPMENT_DECISIONS[number];
