-- Migration: owner_distributions
-- Tracks equity withdrawals per job. These are NOT business expenses —
-- they record how much of the owner's calculated take-home has been
-- transferred to a personal account.
-- Named "owner_distributions" to stay entity-agnostic across entity types
-- (sole prop, partnership, S-corp).

CREATE TABLE IF NOT EXISTS owner_distributions (
  id          SERIAL PRIMARY KEY,
  job_id      INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  business_id INTEGER,
  owner_id    INTEGER,
  amount      NUMERIC(10, 2) NOT NULL,
  date        TEXT NOT NULL,   -- YYYY-MM-DD
  notes       TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS owner_distributions_job_id_idx
  ON owner_distributions (job_id);
