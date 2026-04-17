ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "deposit_paid_at" timestamp;
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "deposit_paid_amount" numeric(12, 2);
