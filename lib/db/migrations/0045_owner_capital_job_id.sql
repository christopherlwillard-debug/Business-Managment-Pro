-- Migration 0045: extend owner_capital_entries with nullable job_id
-- and drop the owner_distributions table (created in 0044) which was
-- a duplicate of the existing Owner Pay ledger.
-- ADR-001: owner_capital_entries is the sole source of truth for owner pay.

ALTER TABLE owner_capital_entries
  ADD COLUMN IF NOT EXISTS job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS owner_capital_entries_job_id_idx
  ON owner_capital_entries (job_id)
  WHERE job_id IS NOT NULL;

-- Backfill: copy any owner_distributions rows into owner_capital_entries
-- so no historical data is lost before the table is dropped.
-- Columns: job_id, amount, date, notes → description (defaulting to 'Owner Pay' if null)
INSERT INTO owner_capital_entries (job_id, amount, date, description, created_at)
SELECT
  job_id,
  amount,
  date,
  COALESCE(NULLIF(TRIM(notes), ''), 'Owner Pay') AS description,
  created_at
FROM owner_distributions
ON CONFLICT DO NOTHING;

DROP TABLE IF EXISTS owner_distributions;
