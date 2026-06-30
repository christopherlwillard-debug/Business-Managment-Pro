-- Migration: MH Production fields on jobs + production_service_types table
-- Run against dev and production DBs

-- 1. New columns on jobs
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS mfh_construction_type text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS mh_production_services jsonb;

-- 2. Production service types catalog (per-business or global when business_id IS NULL)
CREATE TABLE IF NOT EXISTS production_service_types (
  id          serial PRIMARY KEY,
  business_id integer,
  name        text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamp DEFAULT now() NOT NULL
);

-- 3. Add business_id if table already existed without it
ALTER TABLE production_service_types ADD COLUMN IF NOT EXISTS business_id integer;

-- 4. Seed default services (global / business_id = null)
INSERT INTO production_service_types (name, sort_order, business_id)
SELECT name, sort_order, NULL
FROM (VALUES
  ('Trim Out',           1),
  ('Plumbing Hookup',    2),
  ('Marriage Line',      3),
  ('Flooring',           4),
  ('Underpinning',       5),
  ('Complete Finish',    6)
) AS defaults(name, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM production_service_types LIMIT 1);
