CREATE TABLE IF NOT EXISTS job_expense_allocations (
  id SERIAL PRIMARY KEY,
  expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  business_id INTEGER NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT job_expense_allocations_expense_job_unique UNIQUE (expense_id, job_id)
);