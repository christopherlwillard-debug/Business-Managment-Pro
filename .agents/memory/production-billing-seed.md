---
name: Production billing seed is lazy
description: MH Production billing catalog/overrides seed only runs on first authenticated GET; dev/prod DB shows stale legacy rows until triggered.
---

The MH Production billing catalog (`production_service_types`) and per-client
overrides (`production_price_overrides`) are populated by
`ensureProductionBillingSeed()` in `artifacts/api-server/src/lib/productionBilling.ts`.

It runs **lazily** — only on the first `GET /production-service-types` (auth-gated),
guarded by a module-level `seedRan` flag. Until that endpoint is hit (i.e. until
someone opens Settings → Production Billing), the DB still shows the OLD price-less
legacy rows ("Interior Trim Out", "Exterior Trim Out", etc., all `billing_type=Fixed`,
null prices, sort_order 1-4). This looks like a broken/incomplete seed but is not.

The seed is idempotent + alias-aware: it ADOPTS legacy rows by normalized name
alias (preserving their IDs so `jobs.mhProductionServices` references stay valid),
sets itemKey/billingType/home-type prices/sortOrder, then inserts the rest and
creates client overrides with `onConflictDoNothing`.

**How to verify without a browser session:** run the real code path via a one-off
tsx script that imports and calls `ensureProductionBillingSeed()` (or
`buildProductionLineItems(...)` to test the pricing math), then re-query. Delete
the temp script after. `pnpm --filter @workspace/api-server exec tsx <file>` picks
up the ambient DATABASE_URL.

**Why it matters:** don't trust a raw dev-DB snapshot of these tables to judge
whether the seed/feature works — trigger it first. Correct seeded state: Interior
Trim (Per Home, VOG/Hybrid/Drywall 1500/2500/3500), Plumbing (Per Home 1000),
Exterior Trim (Per Side 500), 4×4 Deck (Per Item 1400), Travel Surcharge (Per Day
150), plus Skirting/Steps/Service Call/Mileage/Materials/Warranty Repair; Cavco
overrides: Interior Trim drywall 3700, Plumbing 1500, Exterior Trim 600.

**Prod caveat:** DDL columns must exist in prod before the first GET or the seed
try/catch swallows the error (logs `ensureProductionBillingSeed failed`). Apply
prod schema via Publish (see prod-schema-via-publish.md), then trigger a GET.
