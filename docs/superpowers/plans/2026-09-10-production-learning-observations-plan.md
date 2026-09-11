# Production Learning Observations — Implementation Plan

**Source spec:** `docs/superpowers/specs/2026-09-10-production-learning-observations-design.md`

## Implementation sequence

### 1. Add a pure production-observation calculation module

**Files**

- Add `artifacts/api-server/src/lib/production-learning-observations.ts`
- Add focused tests beside it, following the API server’s existing Vitest conventions

**Work**

- Define typed calculation inputs for presence rows and job metadata.
- Filter learning records to `provenance = "confirmed"` before calculation.
- Reuse `calculateProductionTiming` for first/last confirmed work dates, inclusive calendar span, and pause-window semantics.
- Add confirmed `unrecorded` counting within the same first/last `here` window.
- Return null dates and empty aggregates for an empty record set.
- Implement median with ascending sort and arithmetic averaging of the two middle values for even-sized samples.
- Implement min/max ranges and group-level aggregation.
- Keep the module free of database and HTTP dependencies.

**Tests**

- Confirmed `here` days and date ordering.
- Confirmed `not_here` pauses inside and outside the work window.
- Confirmed `unrecorded` rows inside and outside the work window.
- Inferred, derived, and snapshot rows excluded.
- Empty input.
- One, two, three, and even-sized sample aggregation.
- Outlier behavior and fractional median results.

### 2. Add the read-only scoped API route

**Files**

- Update `artifacts/api-server/src/routes/mfh.ts`
- Add or extend the route-level test file used for MFH routes

**Work**

- Register `GET /knowledge-base/:modelId/production-observations` before the existing dynamic model-detail route.
- Preserve the existing global authentication and Jobs section guard.
- Resolve `requestedBusiness(req)` and stop on `invalidBusinessScope`.
- Use `businessPredicate(jobsTable, scope)` for all job selection.
- Resolve the model and benchmark join through `mfhModelsTable.benchmarkId` and `jobTypeBenchmarksTable`.
- Load candidate jobs with:
  - matching `mfhModelId`
  - status `completed` or `invoiced`
  - workflow `mh_production`
  - business predicate
  - numeric IDs from `mhProductionServices`
- Resolve service IDs against `productionServiceTypesTable`.
- Require at least one resolved service with `appliesTo = "production"`.
- Preserve inactive historical service names; ignore missing service IDs.
- Exclude any explicit `itemKey = "custom"` service because no named custom-profile field exists.
- Scope model visibility and child jobs together so a business cannot infer another business’s job history.
- Load all presence rows for the scoped candidate jobs in one query.
- Filter to confirmed provenance and pass each job through the pure calculator.
- Return traceable jobs that pass model/workflow/service/business predicates, marking those without confirmed `here` evidence with `no_confirmed_presence`.
- Parse benchmark numeric values before serialization.
- Return stable empty and insufficient-sample envelopes.
- Do not write to any table.

**Tests**

- Authenticated success.
- Invalid business selector.
- Cross-business model/job isolation.
- Terminal status and exact workflow filtering.
- Service ID resolution, production-only filtering, inactive historical services, and explicit custom exclusion.
- Confirmed provenance behavior.
- Benchmark mapping and numeric output.
- Traceability exclusions and insufficient sample.
- Read-only request behavior.

### 3. Add typed client access

**Files**

- Update `lib/api-client-react/src/hooks/useMfh.ts`
- Update the matching generated schema/type source if required by the project’s client generation flow
- Update `lib/api-zod` generated/source definitions only when the existing generation process requires it

**Work**

- Add the `ProductionObservationResponse` client type.
- Add `useMfhProductionObservations(modelId, businessSelector?)`.
- Use a query key containing the model ID and business selector.
- Enable the query only when a model ID is selected.
- Use the existing `customFetch` and error behavior.
- Ensure React Query cancellation/stale-result behavior is safe when switching models.
- Keep retry scoped to the observation query.

### 4. Add the Knowledge Center card

**Files**

- Update `artifacts/contractor-app/src/pages/MfhKnowledgeBase.tsx`
- Add a focused component file only if the page’s existing component boundaries make the card too large

**Work**

- Add the `Observed Production History` card to model detail, not the model list.
- Display sample count, last observed date, median production days/range, median calendar span/range, pause total, and selected service scope.
- Keep the editable benchmark card separate and unchanged.
- Add loading state using existing Knowledge Center patterns.
- Add empty states for no qualifying history, insufficient history, and no confirmed presence.
- Add a local error state and retry action that invalidates only the observation query.
- Add expandable traceability rows with job title, production dates, presence metrics, and exclusion reason.
- Avoid financial, payroll, scheduling, presence-write, or benchmark-write actions.

**Tests**

- Loading, populated, empty, insufficient, and error states.
- Retry behavior.
- Model switching and unmount safety.
- Traceability expansion.
- Existing benchmark edit/display regression.

### 5. Run focused verification

**Commands**

- API unit and route tests covering the new calculator and endpoint.
- `pnpm exec tsc -b lib/db lib/api-zod lib/integrations-openai-ai-server && pnpm --filter @workspace/api-server run typecheck`
- `pnpm exec tsc -b lib/api-client-react lib/replit-auth-web && pnpm --filter contractor-app run typecheck`
- Existing production-presence verifier.
- `git diff --check`

**Verification boundaries**

- Confirm the new endpoint is read-only.
- Confirm no `job_daily_presence`, benchmark, Knowledge Base, invoice, payroll, expense, profit, checklist, or schedule rows change.
- Confirm the existing production-presence browser coverage remains green.