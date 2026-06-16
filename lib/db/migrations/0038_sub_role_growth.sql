ALTER TABLE subcontractors
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'hourly',
  ADD COLUMN IF NOT EXISTS growth_pct numeric(5,4) NOT NULL DEFAULT 0;
