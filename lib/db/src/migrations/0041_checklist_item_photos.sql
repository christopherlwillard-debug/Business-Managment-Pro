CREATE TABLE IF NOT EXISTS "job_checklist_item_photos" (
  "id" serial PRIMARY KEY NOT NULL,
  "job_checklist_item_id" integer NOT NULL REFERENCES "job_checklist_items"("id") ON DELETE CASCADE,
  "object_path" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
