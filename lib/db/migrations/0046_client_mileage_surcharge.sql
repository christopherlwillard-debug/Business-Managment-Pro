ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS mileage_surcharge_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS mileage_surcharge_trigger_miles numeric(8, 2);

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS mileage_surcharge_daily_rate numeric(12, 2);