CREATE TABLE IF NOT EXISTS job_checklist_item_parts (
  id serial PRIMARY KEY,
  job_checklist_item_id integer NOT NULL REFERENCES job_checklist_items(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamp,
  completed_by_user_id text,
  completed_by_name text,
  created_at timestamp NOT NULL DEFAULT now()
);
