-- Add pay_rate and pay_type to subcontractors
ALTER TABLE subcontractors
  ADD COLUMN IF NOT EXISTS pay_rate NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS pay_type TEXT DEFAULT 'hourly';

-- Add payment tracking columns to job_subcontractors
ALTER TABLE job_subcontractors
  ADD COLUMN IF NOT EXISTS amount_owed NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS paid_date TEXT,
  ADD COLUMN IF NOT EXISTS paid_notes TEXT;

-- Create job_sub_hours table
CREATE TABLE IF NOT EXISTS job_sub_hours (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  subcontractor_id INTEGER NOT NULL REFERENCES subcontractors(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  hours NUMERIC(6, 2) NOT NULL,
  description TEXT,
  rate_snapshot NUMERIC(10, 2),
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Create job_type_benchmarks table
CREATE TABLE IF NOT EXISTS job_type_benchmarks (
  id SERIAL PRIMARY KEY,
  job_type TEXT NOT NULL UNIQUE,
  estimated_hours NUMERIC(8, 2),
  estimated_labor_cost NUMERIC(12, 2),
  estimated_material_cost NUMERIC(12, 2),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);
