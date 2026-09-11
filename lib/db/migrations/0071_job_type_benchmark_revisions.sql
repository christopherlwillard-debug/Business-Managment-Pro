-- Phase 3: append-only review history for explicitly approved production baselines.
-- The existing job_type_benchmarks row remains the active source of truth.
CREATE TABLE IF NOT EXISTS job_type_benchmark_revisions (
  id SERIAL PRIMARY KEY,
  benchmark_id INTEGER NOT NULL REFERENCES job_type_benchmarks(id) ON DELETE CASCADE,
  mfh_model_id INTEGER NOT NULL REFERENCES mfh_models(id) ON DELETE CASCADE,
  prior_benchmark_hours NUMERIC(8,2),
  proposed_benchmark_hours NUMERIC(8,2) NOT NULL,
  observed_production_days_median NUMERIC(8,2) NOT NULL,
  observed_production_days_min NUMERIC(8,2) NOT NULL,
  observed_production_days_max NUMERIC(8,2) NOT NULL,
  sample_size INTEGER NOT NULL,
  source_job_ids INTEGER[] NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewer_note TEXT,
  created_by_user_id TEXT,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by_user_id TEXT,
  reviewed_by_name TEXT,
  reviewed_at TIMESTAMPTZ,
  CONSTRAINT job_type_benchmark_revisions_status_check
    CHECK (status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT job_type_benchmark_revisions_sample_size_check
    CHECK (sample_size >= 3)
);

CREATE UNIQUE INDEX IF NOT EXISTS job_type_benchmark_revisions_pending_idx
  ON job_type_benchmark_revisions (mfh_model_id, benchmark_id)
  WHERE status = 'pending';