# Phase 6: Component Production-Day Learning

## Status

Design approved in conversation. Implementation has not started.

## Objective

Extend the existing Knowledge Center production-observation system so it can
show expected-versus-actual production-day behavior at Willard's approved
production-component level:

- Interior Finish: VOG, Hybrid, Drywall
- Siding
- Plumbing
- Skirting
- Custom, only when a named custom profile is preserved in the component
  snapshot

Phase 6 remains operational learning evidence. It does not change financial
truth, payroll, invoices, expenses, mileage, pricing, job profit, checklists,
or forecasting. It does not begin labor-hour learning.

## Existing system and source of truth

The existing Knowledge Center observation flow remains the owner:

- Pure calculation and eligibility logic:
  `artifacts/api-server/src/lib/production-observations.ts`
- Approved component vocabulary and learning boundaries:
  `artifacts/api-server/src/lib/production-intelligence-contract.ts`
- Knowledge Center API:
  `artifacts/api-server/src/routes/mfh.ts`
- Knowledge Center UI:
  `artifacts/contractor-app/src/pages/MfhKnowledgeBase.tsx`
- Active benchmark and review history remain:
  `job_type_benchmarks` and `job_type_benchmark_revisions`

Phase 6 extends the existing read-only observation response. It does not create
a parallel learning framework or a new aggregate-baseline table.

Raw source facts remain owned by their existing systems:

- `job_production_components`: immutable job-specific component snapshots,
  including the expected duration value captured at that version.
- `job_daily_presence`: job/day presence state and provenance.
- `job_component_work_sessions`: component snapshot/work-date evidence from
  Phase 5.
- `jobs`: workflow, model, status, and business ownership.

## Eligibility

### Job-level eligibility

A job can contribute to the existing production observation sample only when
all existing rules pass:

1. The job is in status `completed` or `invoiced`.
2. The workflow is `mh_production`.
3. The job is associated with the requested model.
4. The job passes the current business authorization and ownership filter.
5. The job has at least one confirmed presence row with state `here`.
6. At least one production component scope remains after Service/travel and
   unmapped Custom filtering.

`invoiced` remains a completed-equivalent status by decision.

### Component-level eligibility

A component observation additionally requires:

1. A persisted production-component snapshot with an approved component key.
2. The snapshot is the exact snapshot referenced by the Phase 5 work session.
3. The component is not `not_applicable`.
4. The snapshot has an expected duration value.
5. At least one Phase 5 session supplies component work-date evidence.
6. The component passes the existing learning vocabulary. Custom requires an
   immutable named custom-profile identity captured in the snapshot.

A job with valid job-level presence but no component sessions remains eligible
for job-level production-day learning. Its components are shown as missing
component evidence and are not included in component aggregates. Job-level
presence days are never copied to every component.

## Measurement semantics

### Job-level measures

The existing job-level semantics remain unchanged:

- **Expected production days:** the expected duration value from the relevant
  persisted component snapshot, shown as a snapshot-derived expectation rather
  than a newly recalculated value.
- **Actual production days:** distinct confirmed `here` dates from Phase 2.
- **Calendar span:** inclusive days from the first confirmed `here` date through
  the last confirmed `here` date.
- **Paused/delay days:** confirmed `not_here` dates inside that span.
- **Unrecorded days:** dates inside the span with no confirmed presence state.

Scheduled/planned dates are context only. They never become actual production
days.

### Component-level measures

For each component snapshot:

- **Expected component days:** `expectedDurationDays` from that immutable
  snapshot.
- **Actual component work days:** distinct Phase 5 session `workDate` values
  for that exact snapshot.
- **Expected-versus-actual delta:** actual component work days minus expected
  component days.
- **Evidence source:** `component_work_sessions`.
- **Presence context:** job-level actual days, paused days, and unrecorded days
  remain visible alongside the component evidence; they are not substituted for
  component work days.

If a session date falls on a confirmed `not_here` date, that date is treated as
a conflict: it is excluded from the component learning aggregate and surfaced
in the evidence row. A session date with no presence row may count as component
work evidence, but the absence of presence remains visible as unrecorded
context. This preserves both raw evidence sources without silently converting a
pause into work.

Component work days are distinct dates, not summed hours. Phase 5 actual hours
remain operational evidence only and are not converted into labor-hour
benchmarks.

## Historical and version behavior

Every component evidence row carries:

- job ID
- component snapshot ID
- component instance key
- component key and variant
- snapshot version
- captured expected duration
- session-derived actual work-day value

Knowledge Center changes must not reinterpret old jobs. For Custom, Phase 6
will extend component snapshot context so newly synchronized snapshots capture
the named profile ID/key/name and source service IDs. Existing Custom snapshots
without that immutable profile context remain ineligible rather than being
reclassified from the current mapping.

Superseded snapshots remain readable through their existing history and remain
valid references for Phase 5 sessions. Current-component status changes and
catalog changes do not rewrite historical evidence.

## API design

Keep the existing endpoint and all existing fields backward compatible:

`GET /mfh/knowledge-base/:modelId/production-observations`

Extend the response with a component-observation collection under the existing
observation payload. Each aggregate includes:

- component identity and custom-profile identity when applicable
- eligible count, minimum sample size, and sufficiency
- expected production-day median/range
- actual component-work-day median/range
- expected-versus-actual delta median/range
- paused and unrecorded context totals
- evidence jobs with snapshot/version IDs and exclusion/conflict reasons

The existing model-level `productionDaysMedian`, calendar-span values, service
scope counts, job evidence, and benchmark review routes remain unchanged.

Authorization remains the current `requestedBusiness`/canonical business
scope. Business-scoped observations remain scoped; global benchmark reviews
remain all-business only. No new write endpoint is introduced.

## UI design

Extend `ProductionObservationCard` in the existing Knowledge Center page:

1. Keep the existing job-level stat tiles and benchmark review behavior.
2. Add a clearly labeled “Component production-day learning” section.
3. Show one card/row per approved component scope, including the Interior Finish
   variant distinction.
4. Display expected days, actual work days, delta, sample size, and evidence
   state.
5. Keep paused/delay and unrecorded context visible without mixing either into
   actual work days.
6. Allow expansion into evidence rows showing job, snapshot/version, dates,
   conflicts, and exclusion reasons.
7. Provide loading, error, empty, insufficient-history, and no-business-context
   states consistent with the existing observation card.

The UI will not expose forecasting, automatic benchmark changes, labor-hour
learning, payroll, or financial values.

## Testing plan

### Pure learning engine tests

Cover:

- completed and invoiced eligibility
- incomplete/non-production exclusion
- confirmed presence requirement
- expected, actual, calendar, paused, and unrecorded measures
- component grouping for all approved keys and Interior Finish variants
- multiple sessions on one date count once
- missing component sessions do not become component evidence
- not-here/session conflicts are excluded and reported
- unrecorded context remains distinct
- Service and travel-only rows remain excluded
- Custom requires immutable named-profile snapshot context
- snapshot/version values are preserved in evidence

### API tests

Cover:

- authorized all-business and business-scoped reads
- cross-business denial
- component response shape and exact source IDs
- completed/invoiced jobs
- historical/superseded component references
- no writes to payroll, expenses, profit, invoices, mileage, checklists,
  presence, or work-session source data
- existing benchmark review behavior remains unchanged

### UI/regression checks

Cover:

- component learning renders beside existing job-level observations
- loading, empty, insufficient, error, and conflict states
- evidence expansion retains snapshot/version identity
- generated API client types match the OpenAPI response
- existing Knowledge Center and production review flows continue to work

## Validation

Before declaring Phase 6 complete:

- apply and verify any development schema changes required for snapshot-context
  capture; no new aggregate table or production DDL endpoint
- regenerate OpenAPI clients after contract changes
- run focused API and learning-engine tests
- run full API tests
- run API, library, and contractor-app typechecks
- build the contractor app
- run the existing closed-job, production-presence, profit-contract, and
  profit-client checks
- restart the active API and contractor-app workflows
- inspect workflow and browser logs
- perform authenticated Knowledge Center UI verification

Phase 7 and forecasting are explicitly excluded.