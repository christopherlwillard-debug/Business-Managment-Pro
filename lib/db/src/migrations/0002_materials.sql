CREATE TABLE IF NOT EXISTS materials (
  id serial PRIMARY KEY,
  name text NOT NULL,
  description text,
  unit text NOT NULL DEFAULT 'ea',
  unit_cost numeric(12, 2) NOT NULL DEFAULT '0',
  category text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now() NOT NULL
);
