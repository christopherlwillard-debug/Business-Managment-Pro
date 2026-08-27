ALTER TABLE "job_checklist_items"
  ADD COLUMN IF NOT EXISTS "scheduled_date" text;

ALTER TABLE "job_checklist_items"
  ADD COLUMN IF NOT EXISTS "assigned_subcontractor_id" integer
  REFERENCES "subcontractors"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "job_checklist_items_scheduled_date_idx"
  ON "job_checklist_items" ("scheduled_date");