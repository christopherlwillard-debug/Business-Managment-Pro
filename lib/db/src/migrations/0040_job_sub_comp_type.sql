-- Add compensation type and payment tracking columns to job_subcontractors
ALTER TABLE "job_subcontractors" ADD COLUMN IF NOT EXISTS "compensation_type" text NOT NULL DEFAULT 'hourly';
ALTER TABLE "job_subcontractors" ADD COLUMN IF NOT EXISTS "hourly_rate" numeric(12, 2);
ALTER TABLE "job_subcontractors" ADD COLUMN IF NOT EXISTS "fixed_amount" numeric(12, 2);
ALTER TABLE "job_subcontractors" ADD COLUMN IF NOT EXISTS "allocation_pct" numeric(6, 3) CHECK (allocation_pct >= 0 AND allocation_pct <= 100);
ALTER TABLE "job_subcontractors" ADD COLUMN IF NOT EXISTS "payment_status" text NOT NULL DEFAULT 'unpaid';
ALTER TABLE "job_subcontractors" ADD COLUMN IF NOT EXISTS "paid_at" text;
