import { boolean, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { businessesTable } from "./businesses";

// ── Global source catalog ─────────────────────────────────────────────────────
// Every known bid/auction source lives here, seeded at server startup.
// Users cannot edit this table; it is the authoritative registry of what
// integration capability each source has.
export const bidSourceCatalogTable = pgTable("bid_source_catalog", {
  slug:              text("slug").primaryKey(),
  name:              text("name").notNull(),
  // Category grouping for the source
  category:          text("category").notNull(), // jobs_contracts | auctions_surplus | hauling_material | both
  // How the source is (or could be) connected:
  //   api             — official REST/SOAP API with documented endpoints
  //   public_feed     — public data feed, CSV export, or public search endpoint
  //   public_scrape   — public web pages with no API (scraping public data)
  //   account_oauth   — requires OAuth authorization of a user account
  //   email_feed      — opportunity notifications arrive by email / digest
  //   portal_link_only — no automated path; user must visit the site manually
  connectionMethod:  text("connection_method").notNull(),
  automatedDiscovery: boolean("automated_discovery").notNull().default(false),
  notes:             text("notes"),                    // rationale, API doc link, etc.
  isGloballyActive:  boolean("is_globally_active").notNull().default(true),
  createdAt:         timestamp("created_at").defaultNow().notNull(),
  updatedAt:         timestamp("updated_at").defaultNow().notNull(),
});

export type BidSourceCatalog       = typeof bidSourceCatalogTable.$inferSelect;
export type InsertBidSourceCatalog = typeof bidSourceCatalogTable.$inferInsert;

// ── Per-business source connections ───────────────────────────────────────────
// One row per (business, catalog slug).  Tracks whether the business has this
// source enabled, the health of the last sync run, and portal-link metadata
// for portal_link_only sources.  Rows are created on first enable or on first
// sync attempt; absence of a row means "not yet configured" (defaults to disabled).
export const bidSourceConnectionsTable = pgTable("bid_source_connections", {
  id:           serial("id").primaryKey(),
  businessId:   integer("business_id")
    .notNull()
    .references(() => businessesTable.id, { onDelete: "cascade" }),
  catalogSlug:  text("catalog_slug")
    .notNull()
    .references(() => bidSourceCatalogTable.slug, { onDelete: "cascade" }),

  enabled:          boolean("enabled").notNull().default(false),
  // Derived status written by the sync engine:
  //   active        — last sync succeeded
  //   error         — last sync failed (see lastSyncError)
  //   not_configured — no sync has run yet / API key not set
  //   portal_only   — source is portal_link_only; manual visit required
  connectionStatus: text("connection_status").notNull().default("not_configured"),

  // Sync health (written by bidSync after each source attempt)
  lastSyncAt:        timestamp("last_sync_at"),
  lastSyncSuccessAt: timestamp("last_sync_success_at"),
  lastSyncError:     text("last_sync_error"),
  recordsImported:   integer("records_imported"),

  // Portal-link metadata (only meaningful when connectionMethod = portal_link_only)
  portalUrl:   text("portal_url"),
  portalLabel: text("portal_label"),

  // Per-site health detail (JSON string) — used by multi-site scrapers like
  // ky_in_local to report which individual sites succeeded / failed within a
  // single sync run without changing the top-level connectionStatus.
  // Shape: Array<{ slug, site, success, count, error? }>
  siteHealthJson: text("site_health_json"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  bizSourceUniq: uniqueIndex("bid_source_connections_business_slug_unique").on(t.businessId, t.catalogSlug),
}));

export type BidSourceConnection       = typeof bidSourceConnectionsTable.$inferSelect;
export type InsertBidSourceConnection = typeof bidSourceConnectionsTable.$inferInsert;
