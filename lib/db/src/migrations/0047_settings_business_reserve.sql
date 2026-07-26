-- Add Business Reserve Dashboard columns to settings table
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "operating_reserve_mode" text DEFAULT '0';
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "operating_reserve_custom" numeric(10, 2);
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "include_growth_fund_in_reserve" integer DEFAULT 0;
