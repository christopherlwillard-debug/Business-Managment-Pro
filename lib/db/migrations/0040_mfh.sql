-- Manufactured Home (MFH) feature schema.
-- Idempotent: safe to run on environments where these objects were already
-- created via psql during development.

CREATE TABLE IF NOT EXISTS mfh_construction_types (
  id serial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  created_at timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS mfh_manufacturers (
  id serial PRIMARY KEY,
  name text NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS mfh_models (
  id serial PRIMARY KEY,
  manufacturer_id integer NOT NULL REFERENCES mfh_manufacturers(id) ON DELETE CASCADE,
  name text NOT NULL,
  construction_type_id integer NOT NULL REFERENCES mfh_construction_types(id),
  benchmark_id integer REFERENCES job_type_benchmarks(id) ON DELETE SET NULL,
  checklist_template_id integer REFERENCES checklist_templates(id) ON DELETE SET NULL,
  default_addon_keys jsonb DEFAULT '[]'::jsonb,
  notes text,
  active boolean DEFAULT true NOT NULL,
  introduced_year integer,
  discontinued_year integer,
  created_at timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS mfh_pricing_guides (
  id serial PRIMARY KEY,
  manufacturer_id integer NOT NULL REFERENCES mfh_manufacturers(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_dealer_guide boolean DEFAULT false NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS mfh_guide_items (
  id serial PRIMARY KEY,
  guide_id integer NOT NULL REFERENCES mfh_pricing_guides(id) ON DELETE CASCADE,
  model_id integer NOT NULL REFERENCES mfh_models(id) ON DELETE CASCADE,
  base_price numeric(12, 2) DEFAULT '0' NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS mfh_guide_addons (
  id serial PRIMARY KEY,
  guide_id integer NOT NULL REFERENCES mfh_pricing_guides(id) ON DELETE CASCADE,
  addon_key text NOT NULL,
  label text NOT NULL,
  price numeric(12, 2) DEFAULT '0' NOT NULL,
  is_per_day boolean DEFAULT false NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL
);

-- Job-level MFH columns (FK references + pricing snapshot)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS mfh_manufacturer_id integer;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS mfh_model_id integer;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS mfh_model_year integer;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS mfh_dealer_price numeric(12, 2);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS mfh_quoted_price numeric(12, 2);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS mfh_guide_name text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS mfh_selected_addons jsonb;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS mfh_travel_days integer;

-- Estimate-level MFH pricing snapshot
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS mfh_dealer_price numeric(12, 2);
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS mfh_quoted_price numeric(12, 2);
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS mfh_guide_name text;
