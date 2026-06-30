-- Task 1045: Service Billing Worksheet & Client Billing Profiles

-- Per-client billing profiles (1-tech / 2-tech rates + mileage, parts rule, default tech count)
CREATE TABLE IF NOT EXISTS client_billing_profiles (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  name TEXT NOT NULL,
  repair_rate_1tech NUMERIC(10,2),
  repair_rate_2tech NUMERIC(10,2),
  drive_rate_1tech NUMERIC(10,2),
  drive_rate_2tech NUMERIC(10,2),
  mileage_rate NUMERIC(10,2),
  parts_reimbursable BOOLEAN NOT NULL DEFAULT true,
  default_tech_count SMALLINT NOT NULL DEFAULT 2,
  billing_notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS client_billing_profiles_client_id_idx
  ON client_billing_profiles (client_id);

-- Service Billing Worksheet state persisted on the job
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS service_billing JSONB;
