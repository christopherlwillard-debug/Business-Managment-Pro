-- Store the raw SAM.gov typeOfSetAside code on each opportunity so the
-- scoring engine can apply the set-aside bonus without re-fetching the API.
ALTER TABLE bid_opportunities ADD COLUMN IF NOT EXISTS set_aside_type text;
