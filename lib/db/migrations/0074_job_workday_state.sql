-- Keep the daily-presence fact as the source of truth while distinguishing
-- "working today" from "done for today". These timestamps are operational
-- state only and never create hours, payroll, expenses, or profit.
ALTER TABLE job_daily_presence
  ADD COLUMN IF NOT EXISTS work_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS work_ended_at TIMESTAMPTZ;

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