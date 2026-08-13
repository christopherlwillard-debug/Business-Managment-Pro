-- Migration 0060: Industrial qualification cache + private opportunity fields
-- Add qualification analysis cache and private opportunity support to bid_opportunities

ALTER TABLE bid_opportunities
  ADD COLUMN IF NOT EXISTS industrial_qual_summary      jsonb,
  ADD COLUMN IF NOT EXISTS industrial_qual_summary_at   timestamp,
  ADD COLUMN IF NOT EXISTS is_private_opportunity       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS private_opportunity_contact  text,
  ADD COLUMN IF NOT EXISTS private_source_type          text;

-- Index for quickly finding private opportunities per business
CREATE INDEX IF NOT EXISTS bid_opp_private_idx
  ON bid_opportunities (business_id, is_private_opportunity)
  WHERE is_private_opportunity = true;
