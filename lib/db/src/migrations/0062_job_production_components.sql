-- Phase 4: immutable job-specific production context with independently tracked status.
CREATE TABLE IF NOT EXISTS job_production_components (
  id serial PRIMARY KEY,
  job_id integer NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  business_id integer REFERENCES businesses(id) ON DELETE SET NULL,
  component_key text NOT NULL,
  component_instance_key text NOT NULL,
  component_label text NOT NULL,
  variant text,
  source_service_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_services jsonb NOT NULL DEFAULT '[]'::jsonb,
  snapshot_version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'planned',
  expected_labor_hours numeric(8, 2),
  expected_duration_days integer,
  expected_crew_size integer,
  checklist_context jsonb,
  material_context jsonb,
  pricing_context jsonb,
  knowledge_context jsonb,
  captured_at timestamp NOT NULL DEFAULT now(),
  superseded_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT job_production_components_key_check
    CHECK (component_key IN ('interior_finish', 'siding', 'plumbing', 'skirting', 'custom')),
  CONSTRAINT job_production_components_variant_check
    CHECK (variant IS NULL OR variant IN ('vog', 'hybrid', 'drywall')),
  CONSTRAINT job_production_components_status_check
    CHECK (status IN ('planned', 'in_progress', 'paused', 'completed', 'not_applicable')),
  CONSTRAINT job_production_components_version_unique
    UNIQUE (job_id, component_instance_key, snapshot_version)
);

CREATE INDEX IF NOT EXISTS job_production_components_job_current_idx
  ON job_production_components (job_id, superseded_at);