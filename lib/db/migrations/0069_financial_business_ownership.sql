-- Canonical ownership for financial ledgers that previously had no business FK.
-- Existing rows remain available for compatibility; new mutation paths always
-- resolve a canonical owner before inserting.
ALTER TABLE estimated_tax_payments
  ADD COLUMN IF NOT EXISTS business_id INTEGER;

ALTER TABLE sub_payment_records
  ADD COLUMN IF NOT EXISTS business_id INTEGER;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS business_id INTEGER;

ALTER TABLE square_payments
  ADD COLUMN IF NOT EXISTS business_id INTEGER;

UPDATE estimated_tax_payments
SET business_id = businesses.id
FROM businesses
WHERE estimated_tax_payments.business_id IS NULL
  AND businesses.slug = 'general_contracting';

UPDATE sub_payment_records
SET business_id = jobs.business_id
FROM jobs
WHERE sub_payment_records.business_id IS NULL
  AND sub_payment_records.job_id = jobs.id
  AND jobs.business_id IS NOT NULL;

UPDATE sub_payment_records
SET business_id = businesses.id
FROM businesses
WHERE sub_payment_records.business_id IS NULL
  AND sub_payment_records.business_line = businesses.slug;

UPDATE payments
SET business_id = businesses.id
FROM businesses
WHERE payments.business_id IS NULL
  AND businesses.slug = 'general_contracting';

UPDATE square_payments
SET business_id = businesses.id
FROM businesses
WHERE square_payments.business_id IS NULL
  AND businesses.slug = 'general_contracting';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'estimated_tax_payments_business_id_fkey'
  ) THEN
    ALTER TABLE estimated_tax_payments
      ADD CONSTRAINT estimated_tax_payments_business_id_fkey
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sub_payment_records_business_id_fkey'
  ) THEN
    ALTER TABLE sub_payment_records
      ADD CONSTRAINT sub_payment_records_business_id_fkey
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_business_id_fkey'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_business_id_fkey
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'square_payments_business_id_fkey'
  ) THEN
    ALTER TABLE square_payments
      ADD CONSTRAINT square_payments_business_id_fkey
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE SET NULL;
  END IF;
END $$;