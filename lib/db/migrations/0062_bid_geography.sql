ALTER TABLE bid_opportunities
  ADD COLUMN IF NOT EXISTS geography TEXT,
  ADD COLUMN IF NOT EXISTS place_of_performance TEXT,
  ADD COLUMN IF NOT EXISTS geography_reason TEXT;