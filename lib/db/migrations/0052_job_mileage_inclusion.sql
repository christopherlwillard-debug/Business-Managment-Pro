-- Allow each job to opt out of route-based mileage/fuel estimates.
-- Existing and new jobs retain the current included behavior by default.
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS include_mileage_in_job_costs BOOLEAN NOT NULL DEFAULT TRUE;