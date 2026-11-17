ALTER TABLE job_checklist_item_photos
  ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'image';

ALTER TABLE job_checklist_item_photos
  ADD COLUMN IF NOT EXISTS file_name text;

ALTER TABLE job_checklist_items
  ADD COLUMN IF NOT EXISTS required_evidence_type text;
