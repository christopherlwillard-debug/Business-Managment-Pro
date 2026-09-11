# Phase 6: Component Production-Day Learning — Implementation Plan

## 1. Preserve Custom-profile identity in component snapshots

**Files**

- `artifacts/api-server/src/lib/job-production-components.ts`
- `lib/db/src/schema/job-production-components.ts` only if type helpers are
  required; no new table is planned
- focused component snapshot tests

**Work**

1. Load active business-scoped Custom profile mappings for the production
   service IDs used by the job.
2. Add a stable `customProfile` object to the snapshot's existing
   `knowledgeContext` when a Custom service has an explicit profile mapping.
3. Include profile identity and mapped service IDs in snapshot fingerprinting so
   mapping changes create a new snapshot rather than rewriting history.
4. Leave existing snapshots unchanged; missing profile context makes historical
   Custom evidence ineligible.
5. Verify Service/travel and unmapped Custom services remain outside learning.

## 2. Extend the pure observation engine

**Files**

- `artifacts/api-server/src/lib/production-observations.ts`
- `artifacts/api-server/src/lib/production-observations.test.ts`

**Work**

1. Preserve current job-level presence calculations and completed/invoiced
   eligibility.
2. Add typed inputs for component snapshots and Phase 5 work sessions.
3. Normalize sessions by exact snapshot ID and matching job ID.
4. Exclude explicit `not_here` session dates and report conflicts.
5. Deduplicate sessions by date.
6. Normalize one component observation per job and stable learning key,
   unioning valid dates across historical snapshots.
7. Exclude conflicting expected-duration snapshots from aggregates while
   preserving their evidence.
8. Aggregate expected days, actual work days, and deltas with distinct-job
   sample counts and the existing minimum sample size.
9. Preserve missing-evidence, relationship-conflict, and custom-profile
   exclusion reasons.

## 3. Load historical component and session evidence in the MFH API

**Files**

- `artifacts/api-server/src/routes/mfh.ts`
- route tests for production observations and authorization

**Work**

1. Keep the existing model, job, service, profile, and presence queries.
2. Query historical `job_production_components` for eligible candidate jobs.
3. Query `job_component_work_sessions` for those jobs/components.
4. Pass immutable snapshots and raw sessions to the pure engine.
5. Extend the existing observation response without changing benchmark review
   writes or adding a new endpoint.
6. Keep business predicates on every job/service/profile/component/session read.
7. Preserve current all-business-only review authorization.

## 4. Update the API contract and generated clients

**Files**

- `lib/api-spec/openapi.yaml`
- generated `lib/api-client-react` files
- generated `lib/api-zod` files and explicit exports if needed

**Work**

1. Add the component observation response schemas and reason enums.
2. Keep old observation fields backward compatible.
3. Run the repository's OpenAPI generation workflow.
4. Build the generated client libraries and fix only contract-related type
   collisions.

## 5. Extend the Knowledge Center UI

**Files**

- `artifacts/contractor-app/src/pages/MfhKnowledgeBase.tsx`
- `artifacts/contractor-app/src/pages/MfhKnowledgeBase.production-observations.test.tsx`

**Work**

1. Keep existing job-level stat tiles and benchmark-hours review behavior.
2. Add component production-day learning cards for all approved component
   scopes and Interior Finish variants.
3. Display expected days, actual component work days, delta, sample size,
   paused/unrecorded context, and evidence status.
4. Add expandable evidence rows with job ID/title, snapshot ID/version,
   captured expected days, work dates, and conflict/exclusion reasons.
5. Add loading, error, empty, insufficient-history, conflict, and
   no-business-context-safe states.
6. Do not expose forecasts, labor-hour learning, payroll, or financial values.

## 6. Regression and validation

**Tests**

- Extend pure observation tests for all eligibility and measurement rules.
- Extend API tests for authorization, component scope, snapshot history,
  Custom profile isolation, Service exclusion, and no-write boundaries.
- Extend UI tests for new response states and evidence rendering.
- Run generated contract checks.

**Validation**

1. Verify development schema metadata; no aggregate learning migration is
   expected because Custom profile context uses existing JSONB.
2. Run focused tests.
3. Run full API tests.
4. Run API, library, and contractor-app typechecks.
5. Build contractor app.
6. Run close-job, production-presence, job-profit-contract, and
   job-profit-client checks.
7. Restart the active API and contractor-app workflows.
8. Perform authenticated Knowledge Center UI verification.
9. Update architecture registry, ADR/changelog, and project memory only after
   verification.

Phase 7 and forecasting are not part of this plan.