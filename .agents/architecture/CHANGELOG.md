# BuildPro Architecture Changelog

This file records completed architectural changes — what changed and when. It is the "history" layer showing structural evolution over time.

**Rules for this file:**
- Only record changes after they are **implemented and verified**
- Do not add entries for planned or in-progress work
- This is a historical record, not a plan

For *why* decisions were made, see `DECISIONS.md`.  
For the current state of each system, see `SYSTEM_REGISTRY.md`.

---

## 2026-08-05

### Task #1757 → #1760 — Owner Pay Architecture (two-phase correction)

**Phase 1 (Task #1757):** Added a new `owner_distributions` table as a separate ledger for job-level owner pay withdrawals. This was later identified as creating a duplicate system alongside the existing `owner_capital_entries` ledger.

**Phase 2 (Task #1760):** Removed `owner_distributions` entirely. Extended `owner_capital_entries` with a nullable `job_id` column so job-linked payments can be stored in the existing ledger. The job Pay Breakdown tab now reads from `owner_capital_entries` filtered by `job_id`; the Accounting page continues to show all entries unfiltered.

- Dropped table: `owner_distributions`
- Dropped schema file: `lib/db/src/schema/owner-distributions.ts`
- Dropped migration: `0044_owner_distributions.sql` (superseded by 0045)
- Added column: `owner_capital_entries.job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL`
- Added migration: `lib/db/migrations/0045_owner_capital_job_id.sql` (includes backfill before DROP)
- Removed routes: GET/POST/DELETE `/api/jobs/:id/owner-distributions`
- Updated route: GET `/api/owner-capital` now accepts `?jobId=` filter; POST accepts `jobId` in body
- Updated UI: Job Pay Breakdown tab now reads from `/api/owner-capital?jobId=X`
- Reason: Rule 1 (Single Source of Truth), Rule 26 (No Parallel Systems), ADR-001

---

### Task #1761 — BuildPro Architecture Governance System

Created the four-document architecture governance system:
- `.agents/architecture/CONSTITUTION.md` — 27 rules + mandatory pre/post checklists
- `.agents/architecture/SYSTEM_REGISTRY.md` — inventory of all core systems (read-only except via review)
- `.agents/architecture/DECISIONS.md` — ADR log seeded with ADR-001 through ADR-005
- `.agents/architecture/CHANGELOG.md` — this file
- Updated `.agents/memory/MEMORY.md` — pointers to all four files
- Updated `replit.md` — mandatory Architecture Review Gate requirement

---

### Gas/Fuel expense audit-trail bug fix
- Root cause: `isTravelCategory()` in `Expenses.tsx` included `"fuel/travel"`, causing the form to auto-set `countsTowardJobProfit = false` whenever a Fuel/Travel expense was linked to a job (lines 3782, 3797). This silently routed all job-linked fuel expenses to the "Travel & Audit Docs" bucket instead of "Job Expenses."
- Fix: Removed `"fuel/travel"` from `TRAVEL_CATEGORIES_LC`. Fuel is a car & truck operating expense (Schedule C Line 9), not IRS trip documentation.
- Also added `"Fuel/Travel"` to `TRIP_RECEIPT_CATEGORIES` in `Jobs.tsx` so fuel receipts can be logged directly from the job card trip section.
- Added Rules 28–50, 10 Core Principles, 7 Engineering Priorities, and 3-tier rule classification to `CONSTITUTION.md`. Frozen as v1.0.
- Created `.agents/architecture/PATTERNS.md` with 6 proven implementation patterns: financial ledger, calculation engine, configurable business rule, extending a module, debugging workflow, schema migration.

---

### Task #1780 — RoutingEngine + VehicleEngine consolidation; Estimated Fuel Cost fix

**Audit findings (before):** 3 independent server-side OSRM implementations, each with its own geocoding block and in-memory cache:
1. `jobs.ts` profit route — `fuelRouteCache` + inline geocode/OSRM block
2. `geocode.ts` `/route-distance` — `routeDistanceCache` + inline geocode/OSRM block
3. `geocode.ts` `/business-distance` — `businessDistanceCache` + inline geocode/OSRM block

**After:** 1 RoutingEngine + 1 VehicleEngine. All 3 callers now delegate to RoutingEngine.

**Root cause fixed:** The profit route's independent OSRM pipeline was the reason `estimatedFuelCost` was always null — when it failed silently, the fuel cost card never rendered. Now all routing goes through the same engine that already powered the "X mi from shop" job card display, so the values are guaranteed to be consistent.

- Created: `artifacts/api-server/src/lib/routing-engine.ts` — `RoutingEngine.calculate({ origin, destination })` → `{ miles, durationMinutes, routeStatus, provider, cached }`
- Created: `artifacts/api-server/src/lib/vehicle-engine.ts` — `VehicleEngine.operatingCost({ onewayMiles, daysOnJob, vehicleProfile })` → `{ fuelGallons, fuelCost, totalMiles, roundTripMiles }`
- Updated: `jobs.ts` — removed `fuelRouteCache`, removed inline geocode/OSRM, calls VehicleEngine (which uses RoutingEngine); `fuelBreakdown` now includes `fuelGallons`
- Updated: `geocode.ts` — removed `routeDistanceCache`, removed `businessDistanceCache`, both endpoints now delegate to RoutingEngine
- Amended: Constitution v1.0 → v1.1 — added Rules 51–54 (One Service Per Domain, One Engine Many Workflows, One Engine Owns All Calculations, Engines Have One Responsibility)

---

*Add new entries here as architectural changes are completed and verified.*
