ALTER TABLE bid_opportunities ADD COLUMN IF NOT EXISTS business_id integer REFERENCES businesses(id) ON DELETE SET NULL;

ALTER TABLE bid_opportunities DROP CONSTRAINT IF EXISTS bid_opportunities_notice_id_unique;

ALTER TABLE bid_opportunities DROP CONSTRAINT IF EXISTS bid_opportunities_notice_id_business_id_unique;
ALTER TABLE bid_opportunities ADD CONSTRAINT bid_opportunities_notice_id_business_id_unique UNIQUE (notice_id, business_id);

CREATE INDEX IF NOT EXISTS idx_bid_opportunities_business_id ON bid_opportunities(business_id);
