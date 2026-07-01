-- Migration: MH Production Billing Engine (Task #1062)
-- Apply to dev:        psql "$DATABASE_URL" -f artifacts/api-server/src/migrations/0002-mh-production-billing.sql
-- Apply to production: applied automatically via Publish (schema push). Do NOT add a
--   migration endpoint for prod DDL — fix "column does not exist" by re-publishing.
--
-- Adds the master Production Billing Catalog columns and the per-client Production
-- pricing profile (production_price_overrides). Seed data is applied idempotently at
-- runtime (alias-aware, by item_key / client name) — this file is DDL only.

-- 1. Master catalog columns on production_service_types
ALTER TABLE production_service_types ADD COLUMN IF NOT EXISTS item_key            text;
ALTER TABLE production_service_types ADD COLUMN IF NOT EXISTS invoice_description text;
ALTER TABLE production_service_types ADD COLUMN IF NOT EXISTS billing_type        text NOT NULL DEFAULT 'Fixed';
ALTER TABLE production_service_types ADD COLUMN IF NOT EXISTS taxable             boolean NOT NULL DEFAULT false;
ALTER TABLE production_service_types ADD COLUMN IF NOT EXISTS category            text;
ALTER TABLE production_service_types ADD COLUMN IF NOT EXISTS price               numeric(12,2);
ALTER TABLE production_service_types ADD COLUMN IF NOT EXISTS price_vog           numeric(12,2);
ALTER TABLE production_service_types ADD COLUMN IF NOT EXISTS price_hybrid        numeric(12,2);
ALTER TABLE production_service_types ADD COLUMN IF NOT EXISTS price_drywall       numeric(12,2);

-- 2. Per-client Production pricing profile (stores only prices that differ from master)
CREATE TABLE IF NOT EXISTS production_price_overrides (
  id              serial PRIMARY KEY,
  client_id       integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  service_type_id integer NOT NULL REFERENCES production_service_types(id) ON DELETE CASCADE,
  profile_kind    text NOT NULL DEFAULT 'production',
  price           numeric(12,2),
  price_vog       numeric(12,2),
  price_hybrid    numeric(12,2),
  price_drywall   numeric(12,2),
  created_at      timestamp DEFAULT now() NOT NULL,
  updated_at      timestamp DEFAULT now() NOT NULL,
  CONSTRAINT production_price_overrides_client_profile_service_unique
    UNIQUE (client_id, profile_kind, service_type_id)
);
