-- Establish legal-entity ownership without rewriting transaction history.
-- General Contracting and Asphalt remain distinct operating contexts; Asphalt's
-- current businesses row resolves to the legal General Contracting entity.
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS legal_business_id INTEGER;

UPDATE businesses
SET legal_business_id = id
WHERE legal_business_id IS NULL;

UPDATE businesses asphalt
SET legal_business_id = general.id
FROM businesses general
WHERE asphalt.slug = 'asphalt_sealing'
  AND general.slug = 'general_contracting';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'businesses_legal_business_id_fkey'
  ) THEN
    ALTER TABLE businesses
      ADD CONSTRAINT businesses_legal_business_id_fkey
      FOREIGN KEY (legal_business_id) REFERENCES businesses(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Contacts remain one global identity. This table stores only their legal
-- business/client relationships and does not duplicate customer records.
CREATE TABLE IF NOT EXISTS contact_business_links (
  id SERIAL PRIMARY KEY,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  legal_business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  role TEXT NOT NULL DEFAULT 'associated',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contact_business_links_legal_business_id_idx
  ON contact_business_links (legal_business_id);

CREATE UNIQUE INDEX IF NOT EXISTS contact_business_links_contact_business_no_client_uq
  ON contact_business_links (contact_id, legal_business_id, role)
  WHERE client_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS contact_business_links_contact_business_client_uq
  ON contact_business_links (contact_id, legal_business_id, client_id, role)
  WHERE client_id IS NOT NULL;
