ALTER TABLE jobs ADD COLUMN IF NOT EXISTS planning_state text NOT NULL DEFAULT 'ready';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS resource_demand text NOT NULL DEFAULT 'standard';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS queue_position integer;

ALTER TABLE jobs ADD CONSTRAINT jobs_planning_state_check
  CHECK (planning_state IN ('ready', 'scheduled', 'waiting', 'queue'));
ALTER TABLE jobs ADD CONSTRAINT jobs_priority_check
  CHECK (priority IN ('urgent', 'high', 'normal', 'low'));
ALTER TABLE jobs ADD CONSTRAINT jobs_resource_demand_check
  CHECK (resource_demand IN ('standard', 'large_crew', 'all_hands'));

CREATE TABLE IF NOT EXISTS job_readiness_conditions (
  id serial PRIMARY KEY,
  job_id integer NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (reason IN ('electricity', 'water', 'materials', 'inspection', 'crew', 'access', 'other')),
  detail text,
  expected_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id text,
  created_by_name text,
  cleared_at timestamptz,
  cleared_by_user_id text,
  cleared_by_name text
);
CREATE INDEX IF NOT EXISTS job_readiness_conditions_active_job_idx
  ON job_readiness_conditions (job_id, created_at DESC) WHERE cleared_at IS NULL;