-- Phase 5: raw operational work evidence by job and approved production component.
-- This table is intentionally separate from payroll, expenses, presence, and
-- Knowledge Center labor records.
CREATE TABLE IF NOT EXISTS job_component_work_sessions (
  id serial PRIMARY KEY,
  job_id integer NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  production_component_id integer NOT NULL REFERENCES job_production_components(id) ON DELETE RESTRICT,
  work_date date NOT NULL,
  linked_subcontractor_id integer REFERENCES subcontractors(id) ON DELETE SET NULL,
  worker_name text NOT NULL,
  actual_hours numeric(6, 2) NOT NULL,
  notes text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT job_component_work_sessions_hours_check
    CHECK (actual_hours > 0 AND actual_hours <= 24)
);

CREATE INDEX IF NOT EXISTS job_component_work_sessions_job_date_idx
  ON job_component_work_sessions (job_id, work_date);

CREATE INDEX IF NOT EXISTS job_component_work_sessions_component_idx
  ON job_component_work_sessions (production_component_id);