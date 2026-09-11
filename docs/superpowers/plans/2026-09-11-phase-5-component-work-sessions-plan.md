# Phase 5: Component Work Sessions — Implementation Plan

## 1. Database source of truth

- Add `lib/db/src/schema/job-component-work-sessions.ts`.
- Export the table from `lib/db/src/schema/index.ts`.
- Add the next SQL migration under `lib/db/src/migrations` with:
  - job and production-component foreign keys
  - restricted component-snapshot deletion
  - `numeric(6, 2)` actual hours
  - positive/max-hours check
  - job/date and component indexes
- Rebuild the database library declarations and verify the migration metadata.

## 2. API and ownership

- Add the three job-scoped work-session operations to
  `artifacts/api-server/src/routes/jobs.ts`.
- Enforce `businessId` request scope, canonical job ownership, assigned-worker
  validation, persisted current component eligibility, decimal-string parsing,
  and closed-job checks.
- Use job-row transactions for create/PATCH and update the existing close
  branch in `PUT /api/jobs/:id` to share the same concurrency boundary.
- Keep the list aggregation route-local and exact-decimal; do not add a
  financial or learning calculation engine.
- Add the approved source-of-truth entry to
  `.agents/architecture/SYSTEM_REGISTRY.md` and the verified architectural
  change to `.agents/architecture/CHANGELOG.md`.

## 3. API contract and client

- Add exact query parameters, operation IDs, request schemas, response
  schemas, and error responses to `lib/api-spec/openapi.yaml`.
- Run the existing Orval generation workflow to update
  `lib/api-client-react/src/generated` and `lib/api-zod/src/generated`.
- Export/use the generated query and mutation hooks from the contractor app
  without hand-editing generated output.

## 4. Contractor app UI

- Extend the existing production-component block in
  `artifacts/contractor-app/src/pages/Jobs.tsx`.
- Add the work-session query, component-scoped log-work form, assigned
  subcontractor/outside-worker control, date, hours, notes, totals, and edit
  states.
- Keep snapshot history separate and show past-component work when the current
  eligible component no longer exists.
- Surface loading, empty, validation, closed-job, and mutation-error states.
- Invalidate only the work-session query after create/PATCH.

## 5. Tests and verification

- Add focused API route tests for valid entries, historical dates, independent
  workers/components, component and business boundaries, exact decimals, PATCH
  transitions, closed jobs, snapshot races, and side-effect isolation.
- Add or update contractor-app tests for the work form and query invalidation
  where the existing test structure supports it.
- Run API tests, API/client/library/app typechecks, app build, closed-job guard,
  and the existing contract checks.
- Restart the API and contractor-app workflows once after the implementation
  batch, inspect logs, and run the authenticated UI verification needed for the
  new flow.