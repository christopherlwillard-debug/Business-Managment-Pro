---
name: Bid Engine Phase 2
description: Opportunity type classification, hard title suppression, SBA SUBNet + GSA Forecast sources, improved AI analysis prompt
---

# Bid Engine Phase 2

## Opportunity Type Classification
Column `opportunity_type text` on `bid_opportunities` (applied via psql ALTER TABLE, 240 rows backfilled).
Values: `solicitation | sources_sought | presolicitation | subcontracting | forecast | award_intelligence`

Derived by `deriveOpportunityType(source, noticeType?)` in `artifacts/api-server/src/jobs/bidSync.ts`:
- source=`usa-spending` → `award_intelligence`
- source=`subnet` → `subcontracting`
- source=`gsa-forecast` → `forecast`
- noticeType=`sources_sought` → `sources_sought`
- noticeType=`presolicitation` → `presolicitation`
- default → `solicitation`

## Hard Title Suppression Gate
`TITLE_HARD_SUPPRESS` array in `bidSync.ts` (local constant, NOT in bidCapabilitySeeds).
Applied in two places:
1. `scoreOpportunity()` — returns score=0 immediately
2. `upsertOpportunities()` — skips insert entirely with console.log

This means hard-suppressed titles are NEVER stored in the DB.

## New Sources
- **SBA SUBNet** (`subnetSync.ts`): fetches `https://eweb1.sba.gov/subnet/client/dsp_subnetResult.cfm` — HTML parsing (no JSON API exists). Returns `SubnetOpportunity[]`. Source field = `subnet`.
- **GSA Forecast** (`gsaForecast.ts`): fetches `https://forecast.acquisition.gov/api/forecast_of_contract_opportunities/data.json`. Source field = `gsa-forecast`.

Both fetched in `runBidSync()` AFTER the main parallel SAM/local/awards block (separate await with .catch fallback).

## upsertOpportunities() Overrides Update
Added `opportunityTypeOverride?: string` to the optional `overrides` parameter.
Used to force the type for subnet (`subcontracting`) and gsa-forecast (`forecast`) rows.

## Frontend Source Filter
"Subcontracting" filter button (teal, Handshake icon) shows `source=subnet OR source=gsa-forecast`.
SourceFilter type: `"all" | "federal" | "local" | "subnet" | "usa-spending"`.
PipelineBoard and BidOpportunities both handle `"subnet"` case.
GSA Forecast is intentionally grouped under the "Subcontracting" filter (not a separate button).

## Opportunity Type Badges in BidCard
- `sources_sought` → slate "Sources Sought" badge with Info icon
- `presolicitation` → purple "Pre-Solicitation" badge with Calendar icon
- `forecast` → indigo "Forecast" badge with Calendar icon
- `subcontracting` source → shown via teal source badge (Handshake), not an extra type badge
- plain solicitation → no badge (it's the default, no noise)

## AI Prompt Enhancement (bids.ts)
`buildSummarizePrompt()` now takes `source?` and `opportunityType?` params.
Injects source-specific context block before SOLICITATION CONTENT:
- subnet/subcontracting → explains this is a sub opportunity, not a prime contract
- gsa-forecast/forecast → frames requirements as "anticipated," not definitive
- sources_sought → explains RFI context
- presolicitation → explains early notice context
Rule 7 added: avoid making legal conclusions on license/bond requirements — use "verify" language.

## Capability Updates (bidCapabilitySeeds.ts)
- `TITLE_HARD_SUPPRESS_TERMS` now exported from bidCapabilitySeeds (for display purposes), but the functional list is in bidSync.ts
- `flooring` capability renamed "Flooring, Trim & Interior Finish" — added drywall repair, trim, finish carpentry keywords + NAICS 238310/238350
- `general_contracting` negativeKeywords added: licensed electrical/plumbing/HVAC, multistory, high-rise, new commercial construction
- Description updated to note KY license threshold and scope limits clearly

**Why:** The old capabilities had no negative guards, causing false-positive scoring on licensed-trade contracts that Willard cannot perform.

## Activation Run (Aug 2026) — Lessons

### DB was empty at activation
`bid_capability_profiles` and `bid_business_settings` had 0 rows even after code was merged. Both are lazy-seeded by `loadOrSeedCapabilities()` / `loadOrCreateBidSettings()` on first sync. Must trigger a sync (or run `src/scripts/manualBidSync.ts`) to seed them.

### USASpending: state filter + large NAICS array both fail
- KY state filter (`place_of_performance_locations`) + $2M ceiling returns 0 results (too few small KY federal construction awards).
- General Contracting (21 NAICS codes) fails with `TypeError: fetch failed` — Replit sandbox appears to reject large request bodies to usaspending.gov.
- Fix applied: removed state filter (`void state`). Sort field must be from the contract-award field list ("Award Amount" works; "Date Signed" does NOT — 400 error).
- **Remaining issue:** GC's 21-NAICS request still fails. Needs NAICS batching (groups of 5–6) in `usaSpending.ts` — tracked as follow-up task.

### Urgency scoring bug: past deadlines scored as urgent
`scoreOpportunity()` had `if (daysOut <= 7) urgencyScore = 20` which also triggered for negative daysOut (expired deadlines). Fix: added `if (daysOut < 0) urgencyScore = 0` guard before the positive branches.

### rescoreExistingBids() pattern
Added standalone `rescoreExistingBids(businessId, profile)` in `bidSync.ts` that SELECTs all non-usa-spending rows for the business and re-scores them. Called at the top of `runBidSync()` after profile load. Ensures capability changes take effect immediately even when SAM.gov is down.

### SAM.gov consistently times out in dev
All SAM.gov fetches fail with ECONNRESET / "other side closed" in the Replit dev sandbox. Network-level restriction. Production deployment may work. Not a code issue.

### SUBNet HTTP 403 and GSA Forecast network failure
Confirmed still blocked. Both sources silently return 0 records.

### Hard suppress list expanded
Added aircraft/military/industrial-equipment terms: CH-47, insulation blanket (aircraft), bilateral exercise, fan centrifugal, control column airc, ordnance, etc.

**Why:** Original list only covered waste/hazmat; military equipment and exercise notices were scoring 15–20 from urgency bonuses on expired deadlines.
