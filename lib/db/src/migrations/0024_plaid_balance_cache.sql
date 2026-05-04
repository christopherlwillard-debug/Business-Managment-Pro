ALTER TABLE "plaid_connections" ADD COLUMN IF NOT EXISTS "cached_balance_current" numeric;
ALTER TABLE "plaid_connections" ADD COLUMN IF NOT EXISTS "cached_balance_available" numeric;
ALTER TABLE "plaid_connections" ADD COLUMN IF NOT EXISTS "cached_balance_currency" text;
ALTER TABLE "plaid_connections" ADD COLUMN IF NOT EXISTS "balance_cached_at" timestamp;
