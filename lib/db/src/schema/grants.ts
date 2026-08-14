import { boolean, integer, pgTable, serial, text, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { businessesTable } from "./businesses";

// ── Grant source catalog ──────────────────────────────────────────────────────
// Every known grant source lives here, seeded at server startup.
// automatedDiscovery=true only when a working integration exists in this codebase.
export const grantSourceCatalogTable = pgTable("grant_source_catalog", {
  slug:               text("slug").primaryKey(),
  name:               text("name").notNull(),
  // Grant focus area for grouping in the UI
  category:           text("category").notNull(), // general | small_business | veteran | state_local | workforce | rural | technology | economic_dev
  // How the source is (or could be) connected
  connectionMethod:   text("connection_method").notNull(), // api | website | manual
  automatedDiscovery: boolean("automated_discovery").notNull().default(false),
  notes:              text("notes"),
  // Static website URL for manual/portal sources (shown as a direct link in the UI)
  websiteUrl:         text("website_url"),
  isGloballyActive:   boolean("is_globally_active").notNull().default(true),
  createdAt:          timestamp("created_at").defaultNow().notNull(),
  updatedAt:          timestamp("updated_at").defaultNow().notNull(),
});

export type GrantSourceCatalog       = typeof grantSourceCatalogTable.$inferSelect;
export type InsertGrantSourceCatalog = typeof grantSourceCatalogTable.$inferInsert;

// ── Per-business grant source connections ─────────────────────────────────────
// One row per (business, catalog slug).  Tracks enabled state and sync health.
export const grantSourceConnectionsTable = pgTable("grant_source_connections", {
  id:                serial("id").primaryKey(),
  businessId:        integer("business_id")
    .notNull()
    .references(() => businessesTable.id, { onDelete: "cascade" }),
  catalogSlug:       text("catalog_slug")
    .notNull()
    .references(() => grantSourceCatalogTable.slug, { onDelete: "cascade" }),

  enabled:           boolean("enabled").notNull().default(false),
  // active | error | not_configured | manual_only
  connectionStatus:  text("connection_status").notNull().default("not_configured"),

  lastSyncAt:        timestamp("last_sync_at"),
  lastSyncSuccessAt: timestamp("last_sync_success_at"),
  lastSyncError:     text("last_sync_error"),
  recordsImported:   integer("records_imported"),

  createdAt:         timestamp("created_at").defaultNow().notNull(),
  updatedAt:         timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  bizGrantSourceUniq: uniqueIndex("grant_source_connections_business_slug_unique").on(t.businessId, t.catalogSlug),
}));

export type GrantSourceConnection       = typeof grantSourceConnectionsTable.$inferSelect;
export type InsertGrantSourceConnection = typeof grantSourceConnectionsTable.$inferInsert;

// ── Grant opportunities ───────────────────────────────────────────────────────
// One row per (externalId, business) — same pattern as bid_opportunities.
// Non-grant types (loans, tax credits) are stored but tagged so the UI can filter
// them out by default. User-set stages are never overwritten by resync.
export const grantOpportunitiesTable = pgTable("grant_opportunities", {
  id:               serial("id").primaryKey(),
  businessId:       integer("business_id").references(() => businessesTable.id, { onDelete: "set null" }),
  externalId:       text("external_id").notNull(),          // Grants.gov opportunityId or similar
  title:            text("title").notNull(),
  agency:           text("agency"),
  description:      text("description"),
  postedDate:       text("posted_date"),
  deadline:         text("deadline"),                        // ISO date string

  // Financial details
  fundingMin:       integer("funding_min"),                  // dollars
  fundingMax:       integer("funding_max"),                  // dollars

  // Classification
  opportunityType:  text("opportunity_type").notNull().default("grant"), // grant | loan | tax_credit | cooperative_agreement | other
  grantCategories:  jsonb("grant_categories").default([]),  // string[] e.g. ['small_business', 'veteran', 'rural']

  // Program details
  useOfFunds:       text("use_of_funds"),
  keyRequirements:  jsonb("key_requirements").default([]),  // string[]
  applicationUrl:   text("application_url"),

  // Source tracking
  source:           text("source").notNull(),               // catalog slug e.g. 'grants_gov'

  // User workflow
  stage:            text("stage").notNull().default("new"),  // new | saved | applied | no_interest

  // Business matching / scoring
  fitScore:         integer("fit_score"),                    // 0–100
  eligibilityLabel: text("eligibility_label"),               // likely | maybe | unlikely
  matchReasons:     jsonb("match_reasons").default([]),      // string[]

  notes:            text("notes"),
  createdAt:        timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  grantExternalBusinessUniq: uniqueIndex("grant_opportunities_external_id_business_id_unique").on(table.externalId, table.businessId),
}));

export type GrantOpportunity       = typeof grantOpportunitiesTable.$inferSelect;
export type InsertGrantOpportunity = typeof grantOpportunitiesTable.$inferInsert;
