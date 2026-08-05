-- Vehicle profiles for fuel cost estimation
CREATE TABLE IF NOT EXISTS vehicles (
  id SERIAL PRIMARY KEY,
  business_id INTEGER,
  nickname TEXT NOT NULL DEFAULT 'My Truck',
  year INTEGER,
  make TEXT,
  model TEXT,
  avg_mpg INTEGER NOT NULL DEFAULT 17,
  fuel_price_per_gallon NUMERIC(6,3),
  fuel_price_updated_at TIMESTAMP,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Seed a default vehicle from existing settings so nothing breaks
INSERT INTO vehicles (nickname, avg_mpg, fuel_price_per_gallon, fuel_price_updated_at, is_default)
SELECT
  'My Truck',
  COALESCE(vehicle_mpg, 17),
  fuel_price_per_gallon,
  fuel_price_updated_at,
  true
FROM settings
LIMIT 1
ON CONFLICT DO NOTHING;
