---
name: Integrations & Credentials Manager
description: Architecture of the central integrations/credentials system built in Aug 2026
---

## Overview

The Integrations & Credentials Manager consolidates API keys, portal logins, and procurement sync health into one page (`/integrations`). It replaces the earlier basic IntegrationsPage.

## Database

**`integration_credentials` table** (migration 0053 + extended by 0058):
- `encrypted_value` — AES-256-GCM password/API key (NEVER returned to browser)
- `key_hint` — last 4 chars of API key / password (safe to return)
- `encrypted_username` — AES-256-GCM username for portal logins (NEVER returned)
- `username_hint` — masked username display (safe to return, e.g. "joh…@domain")
- `portal_url` — portal URL (not sensitive, safe to return)
- `status` — unconfigured | active | invalid
- `expires_at`, `renewal_reminder_days` — for key expiry alerts

Portal-only and username_password integrations create rows here.
Auto-synced sources (ky_in_local, usa_spending, etc.) do NOT create rows here — their health comes from `bid_source_connections`.

## Catalog structure

`integrationCatalog.ts` has ~25 entries across categories:
- `procurement` — SAM.gov (api_key + bidSourceSlug: "sam_gov")
- `procurement_auto` — KY/IN, USASpending, SBA SUBNet, GSA Forecast (autoSync: true, no credential needed, bidSourceSlug links to bid_source_connections)
- `procurement_portal` — BidNet, DemandStar, Bonfire, PlanetBids, KY VSS, KY eMarketplace (username_password or portal_only)
- `financial` — Plaid (client_secret_pair)
- `fuel_maps` — EIA, Google Maps (api_key)
- `ai` — OpenAI (managed)
- `communication` — Gmail (managed)
- `contractor_portal` — Home Depot Pro, Lowe's Pro, 84 Lumber, ABC Supply, Fastenal (username_password, scope: business)
- `equipment` — GovPlanet, IronPlanet, GSA Auctions, GovDeals, Purple Wave (username_password)

## credentialManager.ts additions

`setPortalCredential(slug, { portalUrl, username, password, notes })` — stores portal creds encrypted.
`removePortalCredential(slug)` — clears all portal creds.
`buildUsernameHint(username)` — "joh…@domain.com" format for email-style usernames.

## Routes

All under `/api/integrations` (requireOwner):
- `GET /` — list all (excludes comingSoon entries)
- `GET /health` — aggregated health summary + all integrations
- `GET /:slug` — single integration
- `POST /:slug/test` — test current API key credential
- `POST /:slug/credential` — test-then-save API key (test-before-save enforced)
- `DELETE /:slug/credential` — revert to env
- `POST /:slug/portal` — save portal URL + username + password
- `DELETE /:slug/portal` — clear portal creds
- `POST /health/tasks` — create dashboard tasks for issues (requires businessId body)

**Route ordering note**: `GET /health` and `POST /health/tasks` are literal paths defined BEFORE `GET /:slug` and `POST /:slug/*`. This is intentional — they must come first to not be shadowed.

## SAM.gov credential slug

The canonical slug is `"sam_gov"` (not `"sam_gov_api_key"`). `getCredential("sam_gov", "SAM_GOV_API_KEY")` is the correct call everywhere. Fixed in bids.ts Aug 2026.

**Why:** The credential manager uses the integration catalog slug as the key. The old bids.ts used a different slug, so DB-managed SAM credentials weren't being picked up by the official-source lookup path.

## Health aggregation

`loadSyncHealthMap()` queries `bid_source_connections` across ALL businesses, groups by `catalogSlug`, picks the "best" status (active > error > not_configured), and returns a Map. This is merged into every integration response that has a `bidSourceSlug`.

## Frontend

- `IntegrationsPage.tsx` — tabs: Overview | Procurement | Portals | Financial | AI & Comms | Equipment
- `IntegrationCard.tsx` — handles all credential types: api_key, client_secret_pair, username_password, portal_only, none, autoSync
- QuickLinksPanel in BidOpportunities.tsx remains UNCHANGED — custom quick links are separate from catalog portals
- SourceManagementPanel in BidOpportunities.tsx remains UNCHANGED — per-business source enabling is still there
