-- Migration 0059: crew/personnel system + bid contract-type metadata

-- ── Crew members ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crew_members (
  id           SERIAL PRIMARY KEY,
  business_id  INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'crew',   -- owner | crew | subcontractor
  title        TEXT,
  email        TEXT,
  phone        TEXT,
  notes        TEXT,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crew_members_business_id_idx ON crew_members(business_id);

-- ── Crew certifications ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crew_certifications (
  id                  SERIAL PRIMARY KEY,
  crew_member_id      INTEGER NOT NULL REFERENCES crew_members(id) ON DELETE CASCADE,
  certification_name  TEXT NOT NULL,
  issuing_body        TEXT,
  cert_number         TEXT,
  issued_date         DATE,
  expires_at          DATE,
  -- active | expiring_soon (≤90 days) | expired | unknown
  status              TEXT NOT NULL DEFAULT 'unknown',
  notes               TEXT,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crew_certifications_crew_member_id_idx ON crew_certifications(crew_member_id);
CREATE INDEX IF NOT EXISTS crew_certifications_expires_at_idx     ON crew_certifications(expires_at);

-- ── New columns on bid_opportunities ──────────────────────────────────────────
ALTER TABLE bid_opportunities
  ADD COLUMN IF NOT EXISTS contract_type     TEXT,
  ADD COLUMN IF NOT EXISTS scope_size        TEXT,
  ADD COLUMN IF NOT EXISTS license_flags     JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS out_of_scope_flags JSONB NOT NULL DEFAULT '[]'::JSONB;
