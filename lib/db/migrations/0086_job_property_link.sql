ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS property_id integer REFERENCES properties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS jobs_property_id_idx ON jobs(property_id);
