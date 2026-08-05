-- Add days_on_job to jobs for fuel cost estimation
-- Defaults to 1 (one workday). Owner can change it per job from the P&L tab.
-- Informational only — no effect on accounting, invoices, or mileage deductions.
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS days_on_job INTEGER DEFAULT 1;
