CREATE TABLE IF NOT EXISTS material_lists (
  id serial PRIMARY KEY,
  name text NOT NULL,
  user_id text,
  job_id integer REFERENCES jobs(id) ON DELETE SET NULL,
  markup numeric(5, 2) NOT NULL DEFAULT '40',
  created_at timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS material_list_items (
  id serial PRIMARY KEY,
  list_id integer NOT NULL REFERENCES material_lists(id) ON DELETE CASCADE,
  material_id integer REFERENCES materials(id) ON DELETE SET NULL,
  name_snapshot text NOT NULL,
  unit_snapshot text NOT NULL DEFAULT 'ea',
  unit_cost_snapshot numeric(12, 2) NOT NULL DEFAULT '0',
  qty numeric(10, 2) NOT NULL DEFAULT '1'
);

ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS material_list_id integer REFERENCES material_lists(id) ON DELETE SET NULL;

ALTER TABLE material_lists ADD COLUMN IF NOT EXISTS user_id text;
