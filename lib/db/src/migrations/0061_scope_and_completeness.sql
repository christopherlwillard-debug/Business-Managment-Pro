-- Phase 7: Scope classification + data completeness tracking
-- scope_category: primary capability category determined at ingest time (asphalt | flooring | general_contracting | industrial_maintenance | mfg_homes | site_work | dump_waste | subcontracting)
-- data_completeness: how complete this record is (complete | partial | needs_verification | unknown)
-- source_reference_id: the external source's own identifier (SAM.gov noticeId, BidNet solicitation id, etc.)

ALTER TABLE bid_opportunities
  ADD COLUMN IF NOT EXISTS scope_category       text,
  ADD COLUMN IF NOT EXISTS data_completeness    text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS source_reference_id  text;

-- Backfill data_completeness for existing rows based on available data
UPDATE bid_opportunities
SET data_completeness = CASE
  WHEN response_deadline IS NOT NULL
    AND naics_code IS NOT NULL
    AND description IS NOT NULL AND length(description) > 50
    AND agency IS NOT NULL
    THEN 'complete'
  WHEN response_deadline IS NOT NULL OR (description IS NOT NULL AND length(description) > 50)
    THEN 'partial'
  ELSE 'needs_verification'
END
WHERE data_completeness = 'unknown';

-- Backfill scope_category from naics_code for existing rows where we can
UPDATE bid_opportunities SET scope_category = 'asphalt'
  WHERE naics_code = '237310' AND scope_category IS NULL;

UPDATE bid_opportunities SET scope_category = 'site_work'
  WHERE naics_code IN ('238910','237990','237110') AND scope_category IS NULL;

UPDATE bid_opportunities SET scope_category = 'dump_waste'
  WHERE naics_code IN ('562111','562119','562910') AND scope_category IS NULL;

UPDATE bid_opportunities SET scope_category = 'industrial_maintenance'
  WHERE naics_code IN ('811310','332312','332313','332410','332420','238190','238290') AND scope_category IS NULL;

UPDATE bid_opportunities SET scope_category = 'flooring'
  WHERE naics_code IN ('238330','238340') AND scope_category IS NULL
    AND (SELECT type FROM businesses WHERE id = bid_opportunities.business_id) != 'asphalt_sealing';

-- Index scope_category + business_id for efficient filtering
CREATE INDEX IF NOT EXISTS bid_opp_scope_biz_idx ON bid_opportunities (business_id, scope_category);
