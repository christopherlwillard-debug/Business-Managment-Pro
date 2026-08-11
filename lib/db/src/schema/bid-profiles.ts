import { boolean, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { businessesTable } from "./businesses";

// ── Capability profiles ───────────────────────────────────────────────────────
// Each row defines one search capability for a business (e.g. "Waste Hauling",
// "MH Finishing", "Asphalt Sealing").  The sync engine merges all active
// capability profiles for a business into a single deduplicated query set.
export const bidCapabilityProfilesTable = pgTable("bid_capability_profiles", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id")
    .notNull()
    .references(() => businessesTable.id, { onDelete: "cascade" }),
  capabilityKey: text("capability_key").notNull(),          // e.g. 'waste_hauling'
  name:          text("name").notNull(),                    // display label
  description:   text("description"),                       // AI context paragraph
  naicsCodes:    jsonb("naics_codes").notNull().default([]), // string[]
  keywords:      jsonb("keywords").notNull().default([]),   // positive SAM keywords
  negativeKeywords: jsonb("negative_keywords").notNull().default([]), // deprioritise
  equipment:     jsonb("equipment").notNull().default([]),  // equipment available
  localKeywords: jsonb("local_keywords").notNull().default([]), // KY/IN filter words
  active:        boolean("active").notNull().default(true),
  sortOrder:     integer("sort_order").notNull().default(0),
  createdAt:     timestamp("created_at").defaultNow().notNull(),
  updatedAt:     timestamp("updated_at").defaultNow().notNull(),
});

export type BidCapabilityProfile    = typeof bidCapabilityProfilesTable.$inferSelect;
export type InsertBidCapabilityProfile = typeof bidCapabilityProfilesTable.$inferInsert;

// ── Per-business bid settings + source health ─────────────────────────────────
// Stores home base, certifications, profile status (active / watch / off), and
// sync-health fields for each configured source.  One row per business.
export const bidBusinessSettingsTable = pgTable("bid_business_settings", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id")
    .notNull()
    .references(() => businessesTable.id, { onDelete: "cascade" }),

  // Geographic preference
  homeZip:              text("home_zip"),
  preferredRadiusMiles: integer("preferred_radius_miles").default(150),

  // Lifecycle status for this business's bid-search activity
  // 'active' = search + notify  |  'watch' = search silently  |  'off' = skip sync
  profileStatus: text("profile_status").notNull().default("active"),

  // Certifications — used for set-aside scoring; never assumed without being set
  isSdvosb:          boolean("is_sdvosb").notNull().default(false),
  isVosb:            boolean("is_vosb").notNull().default(false),
  isSmallBusiness:   boolean("is_small_business").notNull().default(true),
  isHubzone:         boolean("is_hubzone").notNull().default(false),
  is8a:              boolean("is_8a").notNull().default(false),

  // SAM.gov credential health (not secrets — just review-date metadata)
  samCredentialExpiresAt: timestamp("sam_credential_expires_at"),
  samCredentialNote:      text("sam_credential_note"),

  // Overall sync health
  lastSyncAt:        timestamp("last_sync_at"),
  lastSyncSuccessAt: timestamp("last_sync_success_at"),
  lastSyncError:     text("last_sync_error"),

  // Source-level health
  samLastSuccessAt:   timestamp("sam_last_success_at"),
  samLastError:       text("sam_last_error"),
  localLastSuccessAt: timestamp("local_last_success_at"),
  localLastError:     text("local_last_error"),
  awardsLastSuccessAt: timestamp("awards_last_success_at"),
  awardsLastError:     text("awards_last_error"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  businessUniq: uniqueIndex("bid_business_settings_business_id_unique").on(t.businessId),
}));

export type BidBusinessSettings       = typeof bidBusinessSettingsTable.$inferSelect;
export type InsertBidBusinessSettings = typeof bidBusinessSettingsTable.$inferInsert;
