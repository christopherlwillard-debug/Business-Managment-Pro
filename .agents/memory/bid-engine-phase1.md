---
name: Bid engine Phase 1 — multi-capability profiles
description: Architecture changes to bid engine in Phase 1; DB tables, seeding, scoring, and AI prompt patterns.
---

## What changed (Phase 1)

### New DB tables (applied via psql ALTER/CREATE, not Drizzle push)
- `bid_capability_profiles` — per-business search capability rows: capability_key, naics_codes (jsonb), keywords (jsonb), negative_keywords (jsonb), equipment (jsonb), local_keywords (jsonb), active, sort_order. Seeded automatically on first sync per business.
- `bid_business_settings` — per-business bid settings: profile_status ('active'|'watch'|'off'), is_sdvosb, is_vosb, is_small_business, is_hubzone, is_8a, home_zip, preferred_radius_miles, sam_credential_expires_at, plus per-source health timestamps and error fields.

### New columns on bid_opportunities
- `notice_type` text — SAM.gov ptype mapped to human label (solicitation|sources_sought|presolicitation|combined_synopsis|award|other)
- `opportunity_score` integer — 0-100 computed at upsert time without AI
- `capability_matches` jsonb — string[] of capabilityKey values that matched

### Key files
- `lib/db/src/schema/bid-profiles.ts` — new schema file (exported from index.ts)
- `artifacts/api-server/src/lib/bidCapabilitySeeds.ts` — canonical capability definitions for GC (5 capabilities: waste_hauling, mh_finishing, flooring, site_work, general_contracting) and Asphalt (1). Also exports mergeCapabilitySearchParams().
- `artifacts/api-server/src/lib/samGov.ts` — noticeType? added to SamOpportunity (optional); resolveNoticeType maps SAM ptype chars
- `artifacts/api-server/src/jobs/bidSync.ts` — now reads capability profiles from DB (seeds if absent), reads bid_business_settings (creates if absent), writes per-source health after each fetch, computes opportunityScore + capabilityMatches at upsert time, skips sync when profileStatus='off', skips email when profileStatus='watch'
- `artifacts/api-server/src/routes/bids.ts` — updated AI prompt uses DB capability profiles + certifications for fit context; new GET /api/bids/settings and GET /api/bids/capabilities routes

## Critical gotcha: settingsTable has NO businessId FK
settingsTable is a flat global settings table. Query without WHERE businessId condition. Use `settingsTable.complianceNotificationEmail` directly (not a key-value pattern).

## Scoring formula (no AI, computed at sync time)
- Capability keyword match: 0-40 pts (5 pts/keyword hit per capability, max 20/capability, penalise -8/negative hit)
- Source bonus: 0-10 pts (state-local = 10)
- Set-aside advantage: 0-20 pts (SDVOSB certified vs SDVOSB set-aside = 20; small business = 15 if certified)
- Deadline urgency: 0-20 pts (≤7d=20, ≤14d=15, ≤30d=10, ≤60d=5)

## Seeding pattern
bidSync.ts calls `loadOrSeedCapabilities(businessId, businessType)` on every sync. If no DB rows: reads from `bidCapabilitySeeds.ts` and inserts. Idempotent — duplicate insert is caught silently. Same pattern for `bid_business_settings` via `loadOrCreateBidSettings`.

**Why:** Avoids a separate migration endpoint; profiles self-seed on the first sync trigger.

## Phase 2 (not yet built)
- UI for managing capability profiles per business
- Geographic radius filtering (home_zip + preferredRadiusMiles)
- `profileStatus='watch'` for Asphalt Sealing business — no email, silent sync
- Score displayed in BidOpportunities.tsx card UI
- Source health monitoring panel
