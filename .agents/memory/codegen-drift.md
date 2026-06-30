---
name: orval codegen wipes Prospect/RouteStop (spec drift) — RESOLVED
description: How to safely run orval codegen; what was missing from openapi.yaml and why; known hook-path conflict pattern
---

# orval codegen / openapi.yaml — safe operation guide

## The problem (resolved)
The committed orval-generated client (`lib/api-client-react/src/generated/api.ts` + `api.schemas.ts`) was out of sync with `lib/api-spec/openapi.yaml`. The generated code contained schemas (e.g. `Prospect`, `ProspectStatus`, `RouteStop` detail, dashboard business-line types, `Asset` types) that `openapi.yaml` did not define. Because orval uses `clean: true`, running codegen would DELETE every generated symbol not present in the yaml, silently breaking the frontend at runtime.

## Resolution
All missing schemas were added to openapi.yaml:
- **Prospect group**: `ProspectStatus`, `ProspectPropertyType`, `Prospect`, `CreateProspectRequest`, `UpdateProspectRequest`, `ProspectStatusEvent`, `ProspectServiceVisit`, `AddServiceVisitRequest`, `ProspectDetail`, `ProspectRevenueSummary`
- **Asset group**: `AssetType`, `AssetStatus`, `DepreciationMethod`, `Asset`, `CreateAssetRequest`, `UpdateAssetRequest`
- **RouteStop group**: `RouteStopStatus`, `RouteStop`, `CreateRouteStopRequest`
- **DashboardStats** extended with missing optional fields: `periodMileageDeduction`, `ytdMiles`, `ytdMileageRate`, `ownerDrawTotal`, `undrawnBalance`, `subContractorOwed`, `subContractorPaid`, `subContractorRemaining`, `ownerProfit`
- **ServiceBilling/ClientBillingProfile** group added (Task 1045 billing feature)

Running `pnpm --filter @workspace/api-spec codegen` now reproduces all types without deleting anything, and the frontend vite build succeeds cleanly.

## Hook-path conflict pattern
`/prospects`, `/assets`, `/route-stops` paths are intentionally **NOT** in openapi.yaml paths section. Their hooks are provided by hand-written custom hook files in `lib/api-client-react/src/hooks/` (e.g. `useProspects.ts`, `useSquare.ts`) which add proper react-query cache invalidation that orval-generated hooks lack. If you add these paths to yaml, orval generates hooks with the same names, causing a star-export conflict in `index.ts` (duplicate export error).

**Why:** orval does not generate cache invalidation on mutations. Custom hooks call `qc.invalidateQueries()` on success. If you need to add a documented path for these, you must either: (a) accept that custom hook files' exports override generated ones (update index.ts to use named re-exports instead of `export *`), or (b) accept the paths as documentation-only and keep hooks in custom files.

## How to safely add a new endpoint going forward
1. Add the schema to `openapi.yaml` `components/schemas` section.
2. If the endpoint has NO conflicting custom hook, add the path too — codegen will generate the hook.
3. If a custom hook already exists for this endpoint (e.g. prospects, assets), add the schema to yaml but NOT the path. Keep the custom hook.
4. Run `pnpm --filter @workspace/api-spec codegen` — it is now safe to run.
5. Commit the generated files together with the yaml change.

## api-zod note
api-server validates request bodies with zod from `@workspace/db/schema`, not from `@workspace/api-zod`. The frontend does not import api-zod at all. So api-zod generated files can be left at HEAD when adding endpoints — billing/serviceBilling work needs nothing there.

## lib/db dist rebuild
`lib/api-client-react` and `lib/db` export from `src` directly, so no build is needed for runtime. But `lib/db` has a `dist` of `.d.ts` used by api-server's TS project references — rebuild it with `pnpm exec tsc -p tsconfig.json` in `lib/db` after schema changes, or api-server typecheck will report the new columns/exports as missing.

## Migration convention
Despite drizzle using `push` (no `generate` script, no `out` in drizzle.config), there IS a numbered hand-written SQL log under `lib/db/src/migrations/` (latest is the MFH series, 0044+). New schema changes should add the next numbered `.sql` there (idempotent: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`). There is a second divergent dir `lib/db/migrations/` (lower numbers) — `src/migrations/` is the one carrying recent feature work.
