-- Add optional job link to other_income
ALTER TABLE "other_income" ADD COLUMN IF NOT EXISTS "job_id" integer REFERENCES "jobs"("id") ON DELETE SET NULL;
