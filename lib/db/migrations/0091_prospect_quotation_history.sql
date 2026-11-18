ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS prospect_id integer REFERENCES prospects(id) ON DELETE SET NULL;

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS prospect_id integer REFERENCES prospects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS properties_prospect_idx ON properties(prospect_id);
CREATE INDEX IF NOT EXISTS estimates_prospect_idx ON estimates(prospect_id);

ALTER TABLE prospects DROP CONSTRAINT IF EXISTS prospects_status_check;
ALTER TABLE prospects
  ADD CONSTRAINT prospects_status_check
  CHECK (status IN (
    'cold',
    'contacted',
    'needs_measurements',
    'quote_in_progress',
    'quoted',
    'won',
    'serviced',
    'lost',
    'future_opportunity'
  ));

-- Preserve only unambiguous legacy prospect-to-estimate links.
UPDATE estimates AS estimate
SET prospect_id = prospect.id
FROM prospects AS prospect
WHERE prospect.linked_estimate_id = estimate.id
  AND estimate.prospect_id IS NULL
  AND (
    SELECT COUNT(*)
    FROM prospects AS linked
    WHERE linked.linked_estimate_id = estimate.id
  ) = 1;
