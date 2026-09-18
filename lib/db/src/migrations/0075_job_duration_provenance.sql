-- Separate explicit job-duration overrides from the legacy one-day default.
-- Component duration values are retained, but their provenance is initially
-- unknown until a user confirms or edits the component plan.
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS days_on_job_explicit BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE job_production_components
  ADD COLUMN IF NOT EXISTS expected_duration_days_explicit BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE jobs
SET days_on_job_explicit = CASE
  WHEN days_on_job IS NULL THEN FALSE
  WHEN days_on_job = 1 THEN FALSE
  ELSE TRUE
END
WHERE days_on_job_explicit = FALSE;

ALTER TABLE jobs
  ALTER COLUMN days_on_job DROP DEFAULT;

-- Keep the existing daily-work source accepted by the release schema even
-- when an older production constraint predates the workday-action feature.
ALTER TABLE job_daily_presence
  DROP CONSTRAINT IF EXISTS job_daily_presence_source_check;

ALTER TABLE job_daily_presence
  ADD CONSTRAINT job_daily_presence_source_check
  CHECK (source IN (
    'manual_presence',
    'workday_action',
    'job_schedule',
    'job_sub_hours',
    'daily_log',
    'checklist_status',
    'job_knowledge_record',
    'production_plan_snapshot'
  ));