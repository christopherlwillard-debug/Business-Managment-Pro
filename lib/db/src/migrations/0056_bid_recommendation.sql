-- Phase 4: Bid recommendation engine (BID / REVIEW / PASS) + official source lookup
-- Adds transparent decision layer and aggregator source resolution to bid_opportunities.

ALTER TABLE bid_opportunities
  ADD COLUMN IF NOT EXISTS recommendation             TEXT,        -- 'bid' | 'review' | 'pass'
  ADD COLUMN IF NOT EXISTS recommendation_factors     JSONB,       -- RecommendationFactor[] JSON
  ADD COLUMN IF NOT EXISTS official_source_url        TEXT,        -- official .gov URL when resolved
  ADD COLUMN IF NOT EXISTS official_source_status     TEXT
                            NOT NULL DEFAULT 'not_checked',        -- 'found'|'aggregator_only'|'subscription_required'|'not_checked'
  ADD COLUMN IF NOT EXISTS official_source_checked_at TIMESTAMP;
