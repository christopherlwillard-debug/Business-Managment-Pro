-- Migration: Add balance_settled_at to subcontractors
-- Allows manually marking a sub's balance as settled when hours×rate calculation
-- doesn't match reality (e.g. flat payments + bonuses instead of tracked hours).
-- Apply to dev:        psql "$DATABASE_URL" -f artifacts/api-server/src/migrations/0004-sub-balance-settled.sql
-- Apply to production: psql "$PROD_DATABASE_URL" -f artifacts/api-server/src/migrations/0004-sub-balance-settled.sql
--   (or POST to /api/admin/migrations with x-migration-key header)

ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS balance_settled_at TIMESTAMP;
