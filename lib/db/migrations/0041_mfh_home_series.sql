-- Task #1015 (fixes Task #1012): Rewrite for safe single-run against production
-- database currently at schema 0040.
--
-- What this migration does (in order):
--   A  mfh_models (Southern/Giles/Appalachia/…) → mfh_home_series  [rename; all priced columns survive]
--   B  Drop mfh_home_series.manufacturer_id                          [dealer info moves to job Client field]
--   C  Drop mfh_pricing_guides.manufacturer_id                       [guides become global]
--   D  mfh_guide_items.model_id → home_series_id                     [column name alignment; FK target updated by A]
--   E  CREATE new mfh_models table                                    [genuine model names under a series]
--   F  Jobs: add mfh_series_id, copy from mfh_model_id, fix FKs     [preserve historical job → series links]
--   G  DROP mfh_manufacturers                                         [obsolete; no FKs remain at this point]

-- ── A: Rename old mfh_models (the priced entities) to mfh_home_series ──────────
-- The old mfh_models rows ARE the Home Series: Southern, Giles, Norris,
-- Appalachia, etc. All priced columns (construction_type_id, benchmark_id,
-- checklist_template_id, default_addon_keys, notes, active, introduced_year,
-- discontinued_year) survive the rename without modification.
-- Renaming the sequence and primary-key constraint frees those names so the
-- new mfh_models table (Step E) can claim them without collision.
ALTER TABLE mfh_models RENAME TO mfh_home_series;
ALTER SEQUENCE mfh_models_id_seq RENAME TO mfh_home_series_id_seq;
ALTER TABLE mfh_home_series RENAME CONSTRAINT mfh_models_pkey TO mfh_home_series_pkey;

-- ── B: Remove the dealer link from the series ─────────────────────────────────
-- Dropping the column automatically drops its FK constraint to mfh_manufacturers.
-- After this step, mfh_home_series has no reference to mfh_manufacturers.
ALTER TABLE mfh_home_series DROP COLUMN manufacturer_id;

-- ── C: Make pricing guides global ────────────────────────────────────────────
-- Dropping manufacturer_id automatically drops its FK constraint to
-- mfh_manufacturers. Guides are now shared across all series.
ALTER TABLE mfh_pricing_guides DROP COLUMN manufacturer_id;

-- ── D: Align the guide-items FK column name ───────────────────────────────────
-- After Step A, PostgreSQL automatically updated the FK target from
-- mfh_models(id) → mfh_home_series(id). This step only renames the column
-- to match the new architecture.
ALTER TABLE mfh_guide_items RENAME COLUMN model_id TO home_series_id;

-- ── E: Create the genuine model level beneath a series ────────────────────────
-- Models are optional and descriptive. They inherit all pricing, benchmark,
-- checklist, and add-ons from their parent Home Series.
CREATE TABLE mfh_models (
  id            serial      PRIMARY KEY,
  home_series_id integer    NOT NULL REFERENCES mfh_home_series(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  notes         text,
  active        boolean     NOT NULL DEFAULT true,
  introduced_year  integer,
  discontinued_year integer,
  created_at    timestamp   NOT NULL DEFAULT now()
);

-- ── F: Remap job-level MFH references ─────────────────────────────────────────
-- Add the new series column.
ALTER TABLE jobs ADD COLUMN mfh_series_id integer;

-- Promote old mfh_model_id (which stored the series id) into mfh_series_id.
UPDATE jobs SET mfh_series_id = mfh_model_id WHERE mfh_model_id IS NOT NULL;

-- Clear mfh_model_id — it now holds optional new-model references (all NULL
-- initially; users can assign models going forward).
UPDATE jobs SET mfh_model_id = NULL;

-- Drop the old FK constraints before adding the corrected ones.
ALTER TABLE jobs DROP CONSTRAINT jobs_mfh_manufacturer_id_fkey;
ALTER TABLE jobs DROP CONSTRAINT jobs_mfh_model_id_fkey;

-- Drop the manufacturer column (now obsolete).
ALTER TABLE jobs DROP COLUMN mfh_manufacturer_id;

-- Add corrected FK constraints pointing at the new tables.
ALTER TABLE jobs ADD CONSTRAINT jobs_mfh_series_id_fkey
  FOREIGN KEY (mfh_series_id) REFERENCES mfh_home_series(id) ON DELETE SET NULL;
ALTER TABLE jobs ADD CONSTRAINT jobs_mfh_model_id_fkey
  FOREIGN KEY (mfh_model_id)  REFERENCES mfh_models(id)      ON DELETE SET NULL;

-- ── G: Drop the now-obsolete manufacturer table ───────────────────────────────
-- Steps B and C already dropped the two FK columns that referenced this table
-- (mfh_home_series.manufacturer_id and mfh_pricing_guides.manufacturer_id).
-- Step F dropped jobs.mfh_manufacturer_id. No remaining FKs point here.
-- CASCADE is not needed; including it would be misleading about the intent.
DROP TABLE mfh_manufacturers;
