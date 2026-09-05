ALTER TABLE mileage_logs
  ADD COLUMN IF NOT EXISTS source_trip_key text;

CREATE UNIQUE INDEX IF NOT EXISTS mileage_logs_active_import_source_trip_unique
  ON mileage_logs (business_id, source, source_trip_key)
  WHERE import_id IS NOT NULL
    AND source_trip_key IS NOT NULL
    AND voided_at IS NULL;