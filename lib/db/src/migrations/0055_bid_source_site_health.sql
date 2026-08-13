-- Add per-site health JSON to bid_source_connections so partial failures
-- (e.g. individual municipal sites unreachable) can be surfaced separately
-- from overall connection status.

ALTER TABLE bid_source_connections
  ADD COLUMN IF NOT EXISTS site_health_json TEXT;

-- Register the Kentucky eMarketplace (VSS) as an automated source.
-- This is a public_scrape source — no API key required.
INSERT INTO bid_source_catalog (slug, name, category, connection_method, automated_discovery, notes)
VALUES (
  'ky_vss',
  'KY eMarketplace (VSS)',
  'jobs_contracts',
  'public_scrape',
  true,
  'Kentucky Finance Cabinet Vendor Self-Service portal. Public solicitations scraped from the state procurement system. "My Commodities" matching uses your capability profile keywords since account-based matching requires a VSS vendor login.'
) ON CONFLICT (slug) DO NOTHING;

-- Register Kentucky surplus auctions as a portal-link-only source.
-- The KY Direct surplus portal requires a registered account and is not
-- publicly automatable; we add it so the owner can visit it manually.
INSERT INTO bid_source_catalog (slug, name, category, connection_method, automated_discovery, notes)
VALUES (
  'ky_surplus',
  'KY Surplus Auctions',
  'auctions_surplus',
  'portal_link_only',
  false,
  'Kentucky Finance Cabinet surplus property auctions at kydirect.ky.gov. No public data API. Visit the portal to view and bid on surplus equipment, vehicles, and materials.'
) ON CONFLICT (slug) DO NOTHING;
