-- Global registry of all known bid/auction sources.
-- Seeded at server startup; users cannot edit this table.
CREATE TABLE IF NOT EXISTS bid_source_catalog (
  slug               text PRIMARY KEY,
  name               text NOT NULL,
  category           text NOT NULL,         -- jobs_contracts | auctions_surplus | hauling_material | both
  connection_method  text NOT NULL,         -- api | public_feed | public_scrape | account_oauth | email_feed | portal_link_only
  automated_discovery boolean NOT NULL DEFAULT false,
  notes              text,
  is_globally_active boolean NOT NULL DEFAULT true,
  created_at         timestamp NOT NULL DEFAULT NOW(),
  updated_at         timestamp NOT NULL DEFAULT NOW()
);

-- Per-business source configuration and health tracking.
-- One row per (business_id, catalog_slug).
CREATE TABLE IF NOT EXISTS bid_source_connections (
  id                serial PRIMARY KEY,
  business_id       integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  catalog_slug      text NOT NULL REFERENCES bid_source_catalog(slug) ON DELETE CASCADE,
  enabled           boolean NOT NULL DEFAULT false,
  connection_status text NOT NULL DEFAULT 'not_configured',
  last_sync_at      timestamp,
  last_sync_success_at timestamp,
  last_sync_error   text,
  records_imported  integer,
  portal_url        text,
  portal_label      text,
  created_at        timestamp NOT NULL DEFAULT NOW(),
  updated_at        timestamp NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, catalog_slug)
);
