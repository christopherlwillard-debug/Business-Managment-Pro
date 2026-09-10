-- Phase 2: raw, business-neutral daily production presence facts.
-- Derived timing is calculated by the API; this table stores no hours or money.
CREATE TABLE IF NOT EXISTS job_daily_presence (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  state TEXT NOT NULL DEFAULT 'unrecorded',
  not_here_reason TEXT,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual_presence',
  provenance TEXT NOT NULL DEFAULT 'confirmed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id TEXT,
  created_by_name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id TEXT,
  updated_by_name TEXT,
  CONSTRAINT job_daily_presence_state_check
    CHECK (state IN ('unrecorded', 'here', 'not_here')),
  CONSTRAINT job_daily_presence_reason_check
    CHECK (not_here_reason IS NULL OR not_here_reason IN (
      'pulled_off',
      'customer_delay',
      'material_delay',
      'weather',
      'waiting_on_other_trade',
      'other'
    )),
  CONSTRAINT job_daily_presence_reason_state_check
    CHECK (not_here_reason IS NULL OR state = 'not_here'),
  CONSTRAINT job_daily_presence_source_check
    CHECK (source IN (
      'manual_presence',
      'job_schedule',
      'job_sub_hours',
      'daily_log',
      'checklist_status',
      'job_knowledge_record',
      'production_plan_snapshot'
    )),
  CONSTRAINT job_daily_presence_provenance_check
    CHECK (provenance IN ('confirmed', 'inferred', 'derived', 'snapshot'))
);

CREATE UNIQUE INDEX IF NOT EXISTS job_daily_presence_job_date_idx
  ON job_daily_presence (job_id, date);