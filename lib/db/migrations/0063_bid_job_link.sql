ALTER TABLE bid_opportunities
  ADD COLUMN IF NOT EXISTS job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bid_opportunities_job_id_idx
  ON bid_opportunities(job_id);