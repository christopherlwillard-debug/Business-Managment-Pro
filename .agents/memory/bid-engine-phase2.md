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
