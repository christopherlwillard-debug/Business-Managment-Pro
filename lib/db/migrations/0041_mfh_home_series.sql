-- Task #1012: Restructure Manufactured Home library from Manufacturer→Model to
-- Home Series → Model. Data-preserving and idempotent.
--
-- Mapping:
--   old mfh_models (Appalachia/Giles/…)  -> mfh_home_series (priced entity)
--   NEW mfh_models                       -> genuine models under a series
--   mfh_manufacturers (Clayton)          -> dropped (dealer lives on job.Client)
--   mfh_pricing_guides.manufacturer_id   -> dropped (guides are global)
--   mfh_guide_items.model_id             -> home_series_id
--   jobs.mfh_manufacturer_id             -> dropped; jobs.mfh_series_id added
--   jobs.mfh_model_id (held the series)  -> moved into mfh_series_id, then cleared

-- 1. Promote old mfh_models to mfh_home_series (preserves ids + rows).
DO $$
BEGIN
  IF to_regclass('public.mfh_home_series') IS NULL AND to_regclass('public.mfh_models') IS NOT NULL THEN
    ALTER TABLE mfh_models RENAME TO mfh_home_series;
    -- Rename leftover identifiers so the new mfh_models table can reuse the name.
    ALTER SEQUENCE IF EXISTS mfh_models_id_seq RENAME TO mfh_home_series_id_seq;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mfh_models_pkey') THEN
      ALTER TABLE mfh_home_series RENAME CONSTRAINT mfh_models_pkey TO mfh_home_series_pkey;
    END IF;
  END IF;
END $$;

-- 2. Drop the dealer link from the series (and its FK constraint with it).
ALTER TABLE mfh_home_series DROP COLUMN IF EXISTS manufacturer_id;

-- 3. Make pricing guides global.
ALTER TABLE mfh_pricing_guides DROP COLUMN IF EXISTS manufacturer_id;

-- 4. Guide items are keyed by home series, not model.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'mfh_guide_items' AND column_name = 'model_id') THEN
    ALTER TABLE mfh_guide_items RENAME COLUMN model_id TO home_series_id;
  END IF;
END $$;

-- 5. Create the genuine model level beneath a series.
CREATE TABLE IF NOT EXISTS mfh_models (
  id serial PRIMARY KEY,
  home_series_id integer NOT NULL REFERENCES mfh_home_series(id) ON DELETE CASCADE,
  name text NOT NULL,
  notes text,
  active boolean DEFAULT true NOT NULL,
  introduced_year integer,
  discontinued_year integer,
  created_at timestamp DEFAULT now() NOT NULL
);

-- 6. Remap job-level references.
DO $$
BEGIN
  IF to_regclass('public.jobs') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'jobs' AND column_name = 'mfh_series_id') THEN
      ALTER TABLE jobs ADD COLUMN mfh_series_id integer;
    END IF;

    -- One-time data migration: old mfh_model_id held the series; promote it.
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'jobs' AND column_name = 'mfh_manufacturer_id') THEN
      UPDATE jobs SET mfh_series_id = mfh_model_id
        WHERE mfh_model_id IS NOT NULL AND mfh_series_id IS NULL;
      UPDATE jobs SET mfh_model_id = NULL;
      ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_mfh_manufacturer_id_fkey;
      ALTER TABLE jobs DROP COLUMN mfh_manufacturer_id;
    END IF;

    -- mfh_model_id previously referenced old mfh_models (now mfh_home_series).
    -- Repoint it at the new mfh_models table; values are all NULL after remap.
    ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_mfh_model_id_fkey;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_mfh_series_id_fkey') THEN
      ALTER TABLE jobs ADD CONSTRAINT jobs_mfh_series_id_fkey
        FOREIGN KEY (mfh_series_id) REFERENCES mfh_home_series(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_mfh_model_id_fkey') THEN
      ALTER TABLE jobs ADD CONSTRAINT jobs_mfh_model_id_fkey
        FOREIGN KEY (mfh_model_id) REFERENCES mfh_models(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- 7. Remove the dealer/manufacturer table entirely.
DROP TABLE IF EXISTS mfh_manufacturers CASCADE;
