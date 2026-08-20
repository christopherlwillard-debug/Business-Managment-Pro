-- Canonical ownership columns are nullable during the compatibility period.
-- Rows with no business_line are intentionally left unassigned and are inventoried
-- by the final SELECTs below; they must be classified before NOT NULL constraints.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES businesses(id) ON DELETE SET NULL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES businesses(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES businesses(id) ON DELETE SET NULL;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES businesses(id) ON DELETE SET NULL;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES businesses(id) ON DELETE SET NULL;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES businesses(id) ON DELETE SET NULL;

UPDATE clients c SET business_id = b.id
FROM businesses b WHERE c.business_id IS NULL AND c.business_line = b.slug;
UPDATE jobs j SET business_id = b.id
FROM businesses b WHERE j.business_id IS NULL AND j.business_line = b.slug;
UPDATE invoices i SET business_id = b.id
FROM businesses b WHERE i.business_id IS NULL AND i.business_line = b.slug;
UPDATE estimates e SET business_id = b.id
FROM businesses b WHERE e.business_id IS NULL AND e.business_line = b.slug;
UPDATE prospects p SET business_id = b.id
FROM businesses b WHERE p.business_id IS NULL AND p.business_line = b.slug;

-- Inventory for the deliberate classification step. This is emitted to the
-- migration log without assigning ambiguous historical rows.
DO $$
DECLARE
  table_name text;
  unassigned_count bigint;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['clients','jobs','invoices','estimates','prospects','assets']
  LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE business_id IS NULL', table_name) INTO unassigned_count;
    RAISE NOTICE 'business ownership inventory: % has % unassigned rows', table_name, unassigned_count;
  END LOOP;
END $$;