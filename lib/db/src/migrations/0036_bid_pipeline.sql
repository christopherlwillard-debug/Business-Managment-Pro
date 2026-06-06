ALTER TABLE bid_opportunities ADD COLUMN IF NOT EXISTS stage text;
ALTER TABLE bid_opportunities ADD COLUMN IF NOT EXISTS notes text;

UPDATE bid_opportunities SET stage = 'reviewing' WHERE status = 'interested' AND stage IS NULL;
UPDATE bid_opportunities SET stage = 'no_bid' WHERE status = 'dismissed' AND stage IS NULL;
UPDATE bid_opportunities SET stage = 'new' WHERE stage IS NULL;

ALTER TABLE bid_opportunities ALTER COLUMN stage SET DEFAULT 'new';
ALTER TABLE bid_opportunities ALTER COLUMN stage SET NOT NULL;
