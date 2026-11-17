ALTER TABLE job_checklists
  ADD COLUMN IF NOT EXISTS additional_work_occurred boolean NOT NULL DEFAULT false;
