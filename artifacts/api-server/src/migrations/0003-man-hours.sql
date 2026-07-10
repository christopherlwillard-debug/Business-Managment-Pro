-- Migration: Man-hours tracking on jobs
-- Apply to dev:        psql "$DATABASE_URL" -f artifacts/api-server/src/migrations/0003-man-hours.sql
-- Apply to production: psql "$PROD_DATABASE_URL" -f artifacts/api-server/src/migrations/0003-man-hours.sql
--   (or POST to /api/admin/migrations with x-migration-key header)

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS man_hours NUMERIC(8,2);
