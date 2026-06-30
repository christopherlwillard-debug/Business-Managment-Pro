-- Migration: MH Production fields on jobs + production_service_types table
-- Apply to dev:        psql "$DATABASE_URL" -f artifacts/api-server/src/migrations/0001-mh-production.sql
-- Apply to production: psql "$PROD_DATABASE_URL" -f artifacts/api-server/src/migrations/0001-mh-production.sql
--   (or POST to /api/admin/migrations with x-migration-key header)

-- 1. New columns on jobs
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS mfh_construction_type text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS mh_production_services jsonb;

-- 2. Production service types catalog
--    business_id = NULL  → global default visible to all businesses
--    business_id = N     → business-specific override
CREATE TABLE IF NOT EXISTS production_service_types (
  id          serial PRIMARY KEY,
  business_id integer,
  name        text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamp DEFAULT now() NOT NULL
);

-- 3. Add business_id if table already existed without it (idempotent)
ALTER TABLE production_service_types ADD COLUMN IF NOT EXISTS business_id integer;

-- 4. Seed the 4 required MH Production default services (only if table is empty)
INSERT INTO production_service_types (name, sort_order, business_id)
SELECT name, sort_order, NULL
FROM (VALUES
  ('Interior Trim Out',        1),
  ('Exterior Trim Out',        2),
  ('Plumbing Hookup',          3),
  ('4×4 Deck / Step Platform', 4)
) AS defaults(name, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM production_service_types LIMIT 1);
