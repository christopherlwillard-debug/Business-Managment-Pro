-- Equipment foundation: inventory + source catalog + opportunities
-- Three tables for the Procurement "buying side"

-- What the user already owns
CREATE TABLE IF NOT EXISTS equipment_inventory (
  id              SERIAL PRIMARY KEY,
  business_id     INTEGER REFERENCES businesses(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'other',
  subcategory     TEXT,
  year            INTEGER,
  make            TEXT,
  model           TEXT,
  serial_number   TEXT,
  condition       TEXT NOT NULL DEFAULT 'good',
  status          TEXT NOT NULL DEFAULT 'in_service',
  estimated_value NUMERIC(12,2),
  purchase_price  NUMERIC(12,2),
  purchase_date   DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Where equipment opportunities come from (global catalog, seeded at startup)
CREATE TABLE IF NOT EXISTS equipment_sources (
  slug                TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  category            TEXT NOT NULL DEFAULT 'government_surplus',
  connection_method   TEXT NOT NULL DEFAULT 'portal_link_only',
  automated_discovery BOOLEAN NOT NULL DEFAULT false,
  base_url            TEXT,
  notes               TEXT,
  globally_active     BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Individual listings from equipment sources
CREATE TABLE IF NOT EXISTS equipment_opportunities (
  id                        SERIAL PRIMARY KEY,
  source_slug               TEXT NOT NULL REFERENCES equipment_sources(slug) ON DELETE CASCADE,
  external_id               TEXT NOT NULL,
  title                     TEXT NOT NULL,
  description               TEXT,
  category                  TEXT,
  location_text             TEXT,
  location_state            TEXT,
  listing_type              TEXT NOT NULL DEFAULT 'auction',
  start_price               NUMERIC(12,2),
  current_price             NUMERIC(12,2),
  buy_now_price             NUMERIC(12,2),
  auction_end_at            TIMESTAMPTZ,
  listing_url               TEXT NOT NULL,
  image_url                 TEXT,
  is_government_surplus     BOOLEAN NOT NULL DEFAULT false,
  condition_notes           TEXT,
  -- User decision tracking
  user_decision             TEXT,
  user_decision_at          TIMESTAMPTZ,
  user_decision_business_id INTEGER REFERENCES businesses(id) ON DELETE SET NULL,
  user_notes                TEXT,
  -- Relevance scoring (computed at sync time)
  relevance_score           INTEGER NOT NULL DEFAULT 0,
  matched_categories        TEXT[],
  -- Audit
  first_seen_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source_slug, external_id)
);
