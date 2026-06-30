-- Add active flag to mfh_manufacturers so builders can be deactivated without deletion
ALTER TABLE mfh_manufacturers ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- Unique constraint on builder name (enforced at DB level)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mfh_manufacturers_name_unique') THEN
    ALTER TABLE mfh_manufacturers ADD CONSTRAINT mfh_manufacturers_name_unique UNIQUE (name);
  END IF;
END $$;

-- Unique constraint on model name within a builder
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mfh_models_name_manufacturer_unique') THEN
    ALTER TABLE mfh_models ADD CONSTRAINT mfh_models_name_manufacturer_unique UNIQUE (manufacturer_id, name);
  END IF;
END $$;
