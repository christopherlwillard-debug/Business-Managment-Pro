-- A solicitation number is only unique within its source and business.
-- Keep identical IDs from SAM.gov, local portals, and USAspending as separate records.
ALTER TABLE bid_opportunities
  DROP CONSTRAINT IF EXISTS bid_opportunities_notice_id_business_id_unique;

DROP INDEX IF EXISTS bid_opportunities_notice_id_business_id_unique;

CREATE UNIQUE INDEX IF NOT EXISTS bid_opportunities_notice_id_business_id_source_unique
  ON bid_opportunities (notice_id, business_id, source);
