CREATE TABLE IF NOT EXISTS job_mileage_reimbursements (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  business_id INTEGER NOT NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  estimated_amount NUMERIC(12, 2),
  recipient_type TEXT NOT NULL DEFAULT 'owner',
  recipient_name TEXT NOT NULL DEFAULT 'Business owner',
  recipient_subcontractor_id INTEGER REFERENCES subcontractors(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'owed',
  paid_at TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT job_mileage_reimbursements_job_unique UNIQUE (job_id)
);