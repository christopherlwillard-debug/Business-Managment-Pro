-- Phase 7A: business-scoped, manually reviewed component production-day baselines.
-- This is review history, not a derived aggregate cache or operational ledger.
CREATE TABLE IF NOT EXISTS mfh_component_baseline_revisions (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  mfh_model_id INTEGER NOT NULL REFERENCES mfh_models(id),
  learning_key TEXT NOT NULL,
  component_key TEXT NOT NULL,
  component_label TEXT NOT NULL,
  variant TEXT,
  custom_profile JSONB,
  prior_approved_revision_id INTEGER,
  prior_approved_production_days NUMERIC(8,2),
  proposed_production_days NUMERIC(8,2) NOT NULL,
  observed_actual_production_days_median NUMERIC(8,2) NOT NULL,
  observed_actual_production_days_min NUMERIC(8,2) NOT NULL,
  observed_actual_production_days_max NUMERIC(8,2) NOT NULL,
  observed_expected_production_days_median NUMERIC(8,2) NOT NULL,
  observed_expected_production_days_min NUMERIC(8,2) NOT NULL,
  observed_expected_production_days_max NUMERIC(8,2) NOT NULL,
  sample_size INTEGER NOT NULL,
  source_job_ids INTEGER[] NOT NULL,
  source_evidence JSONB NOT NULL,
  source_evidence_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewer_note TEXT,
  created_by_user_id TEXT,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by_user_id TEXT,
  reviewed_by_name TEXT,
  reviewed_at TIMESTAMPTZ,
  superseded_by_user_id TEXT,
  superseded_by_name TEXT,
  superseded_at TIMESTAMPTZ,
  CONSTRAINT mfh_component_baseline_revisions_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'superseded')),
  CONSTRAINT mfh_component_baseline_revisions_sample_size_check
    CHECK (sample_size >= 5),
  CONSTRAINT mfh_component_baseline_revisions_proposed_days_check
    CHECK (proposed_production_days > 0)
);

CREATE INDEX IF NOT EXISTS mfh_component_baseline_revisions_scope_idx
  ON mfh_component_baseline_revisions (business_id, mfh_model_id, learning_key, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS mfh_component_baseline_revisions_pending_idx
  ON mfh_component_baseline_revisions (business_id, mfh_model_id, learning_key)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS mfh_component_baseline_revisions_approved_idx
  ON mfh_component_baseline_revisions (business_id, mfh_model_id, learning_key)
  WHERE status = 'approved';