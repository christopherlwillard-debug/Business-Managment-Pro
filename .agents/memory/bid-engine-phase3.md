---
name: Bid Engine Phase 3
description: Capability-grouped SAM.gov search, 90-day lookback, soft NAICS mismatch, geographic scoring, v2 skill buckets, auto-migration of v1 profiles
---

# Bid Engine Phase 3 — SAM.gov Search Overhaul

## Problem solved
The old approach merged all NAICS codes and all keywords from all 6 GC capability profiles into a flat set, then searched every NAICS × every keyword — roughly 4,000 parallel requests. Results were either an empty feed (blocked in dev) or a completely irrelevant one.

## CapabilitySearchGroup interface (samGov.ts)
Each group has:
- `capabilityKey` / `capabilityName` — for matching results back to capabilities
- `naicsCodes` — searched paired with `anchorKeywords` (NAICS + keyword to keep results tight)
- `anchorKeywords` — broad terms combined with NAICS filter
- `specificKeywords` — searched WITHOUT NAICS filter (catches mismatches, different NAICS)
- `pscCodes` — optional PSC-paired searches

`fetchSamOpportunitiesGrouped(groups)` runs all searches with a `Semaphore` (SAM_MAX_CONCURRENT=8). Total GC requests: ~200 vs ~4,000 before.

## SAM_LOOKBACK_DAYS extended to 90 (was 30)
Old 30-day window silently missed still-active solicitations posted earlier in the quarter.

## Soft NAICS mismatch (NOT hard drop)
Old: records returned by keyword searches whose NAICS wasn't in the requested set were deleted before storage.
New: `naicsMismatch: true` field on `SamOpportunity` — records kept, flagged for user review.

In `scoreOpportunity`: when `naicsMismatch=true`, `capScore` is capped at 15 (always surfaces as REVIEW, not auto-BID).

**Why:** Opportunities frequently use unexpected NAICS codes. Hard-dropping silently lost relevant work.

## Geographic scoring (+0–10 pts in scoreOpportunity)
- +10: Owensboro/Daviess County/local area
- +7: Kentucky (KY)
- +5: Southern Indiana (Evansville area)
- 0: National (still surfaces, scores lower)
Source: title + description + agency fields concatenated.

## 7 v2 GC skill buckets (bidCapabilitySeeds.ts)
Replaced 6 v1 profiles (waste_hauling, mh_finishing, flooring, site_work, general_contracting, industrial_maintenance) with 7 real skill buckets:

| Key | Name |
|---|---|
| trim_carpentry | Trim Carpentry & Interior Finish Work |
| flooring_installation | Flooring Installation |
| residential_remodel | Residential Remodeling & Maintenance |
| building_park_maintenance | Building & Park Facility Maintenance |
| welding_fabrication | Welding & Metal Fabrication |
| debris_hauling | Debris Hauling & Site Cleanup |
| compact_dirt_work | Compact Loader / Backhoe / Small Dirt Work |

## qualificationRequired field on CapabilityDefinition
Optional `string[]` of terms that trigger a REVIEW flag rather than exclusion when found in an opportunity. e.g. "ASME", "R-stamp" for welding; "licensed electrician" for remodeling. Stored in capability definition but NOT yet surfaced in UI (Phase 4 opportunity).

## Auto-migration of v1 DB rows
`loadOrSeedCapabilities()` checks if any stored capability key is in `LEGACY_GC_CAPABILITY_KEYS`. If so, deletes all DB rows for that business and re-seeds with v2 definitions. Fires automatically on next sync — no manual DB migration needed.

## purgeIrrelevantFederalBids removed from sync flow
This function deleted federal bids whose NAICS wasn't in `profile.naicsCodes`. With soft mismatch, those records should be kept. `rescoreExistingBids` handles true scope violations via the scope classifier.

## New NAICS codes added to bidScopeClassifier.ts
- `561210` → `general_contracting` (facilities support services)
- `561499` → `general_contracting` (all other building service contractors)

## getSearchGroupsForBusinessType() 
Exported from `bidCapabilitySeeds.ts`. Returns `CapabilitySearchGroup[]` for SAM.gov queries. `getCapabilitiesForBusinessType()` still exists for DB seeding and scoring.

`mergeCapabilitySearchParams()` still used by non-SAM sources (USASpending, SUBNet, GSA Forecast).
