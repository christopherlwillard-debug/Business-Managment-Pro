# Production Learning Observations — Phase 3 Design

**Status:** Approved for implementation planning

## Goal

Add a read-only Production Intelligence view to the existing Knowledge Center so the owner can see what completed production jobs have actually required, based on confirmed daily presence history.

This first slice is observational only. It does not change benchmark values, create production plans, write presence records, or modify financial, payroll, checklist, or scheduling behavior.

## Decisions

- The first surface is the existing Knowledge Center/Home Knowledge Base, not Jobs or the production-plan editor.
- Existing MH production service selections and model-to-benchmark links are reused.
- Observations are grouped by home model and its existing benchmark.
- Selected production services are displayed as scope context, not as separate trade-level duration measurements.
- Existing benchmark values remain unchanged.
- A model needs at least three eligible completed jobs before a learned baseline is shown.
- `job_daily_presence` remains the sole operational source of daily presence truth.
- Service work is excluded from production learning.

## Existing boundaries

The implementation must preserve the Production Intelligence contract in `artifacts/api-server/src/lib/production-intelligence-contract.ts`:

- `here`, `not_here`, and `unrecorded` remain distinct.
- Scheduling/Operations owns daily presence and schedule history.
- Knowledge Center owns reusable observations and learning baselines, but not presence.
- Financial systems, payroll, invoices, profit, and pricing remain separate.
- Custom production learning requires a named custom profile.

## Architecture

### Backend

Add a read-only endpoint under the existing MFH Knowledge Center route family:

`GET /api/mfh/knowledge-base/:modelId/production-observations`

The route must be declared before any conflicting dynamic route registration.

The endpoint:

1. Authenticates the caller.
2. Uses the existing `requestedBusiness(req)` and `businessPredicate(jobsTable, scope)` semantics. If a business selector was supplied and is invalid, it returns the existing unknown-business error through `invalidBusinessScope`. If no selector was supplied, it preserves the existing all-business Knowledge Center read behavior.
3. Applies the canonical business scope to the requested model and related jobs before loading child records.
4. Loads the model and its existing `mfh_models.benchmark_id` link to `job_type_benchmarks`.
5. Loads eligible terminal production jobs for that model.
6. Resolves the numeric IDs in `jobs.mh_production_services` against `production_service_types`.
7. Loads the related `job_daily_presence` rows.
8. Derives job-level observations in a pure calculation layer.
9. Returns the grouped observation and traceable job basis.

The endpoint must not mutate any table.

The MFH router is already mounted after global authentication and Jobs
permission checks. The new route must preserve that mounting and must not
weaken it or bypass the business-scope helper.

### Frontend

Add an `Observed Production History` card to the existing model detail view in `MfhKnowledgeBase.tsx`. Do not add the observation query to the model list in the first slice; this avoids an N+1 request pattern and keeps the existing model cards stable.

The card should use the app’s existing loading, card, stat-tile, expandable-detail, and toast/error conventions.

Add the route to the same typed API-client source and regeneration flow used by
`useMfhModelDetail`, exposing a `useMfhProductionObservations(modelId)` query.
The query is enabled only when a model is selected, is keyed by model ID and
business selector, and is cancelled or ignored automatically when the detail
view changes models or unmounts. The Retry action invalidates only this query.

## Eligible jobs and scope

A job qualifies for the observation sample when all of these are true:

- It belongs to the requested home model.
- It is in a terminal status already treated as completed by the Knowledge Center: `completed` or `invoiced`.
- Its `jobs.workflow` value is exactly `mh_production`, not `mh_service`.
- Its `jobs.mh_production_services` JSON array contains at least one numeric ID that resolves to a row in `production_service_types` with `applies_to = 'production'`. The row may be inactive because historical jobs must remain explainable; a missing service row is ignored and does not qualify the job.
- A service row with `item_key = 'custom'` is excluded because the current catalog has no named custom-profile field. The endpoint must not infer a custom profile from a free-text service name or category. Any future custom-profile mapping is a separate schema/design task.
- It is business-scoped to the authenticated business.
- It has at least one `job_daily_presence` row with `state = 'here'` and `provenance = 'confirmed'`.

The query scope for traceability includes every terminal MH production job
that passes the model, workflow, service, and business predicates. Jobs with
no confirmed `here` evidence are returned in the traceability section with an
explicit `no_confirmed_presence` reason, but are not included in learned
metrics. Jobs that fail the model, workflow, service, or business predicates
are not returned.

The selected production service names for included jobs are returned as scope context. A whole-job presence duration must not be duplicated into independent siding, plumbing, skirting, or other trade measurements.

## Observation calculations

Calculations operate per eligible job before aggregation. Only rows with
`provenance = 'confirmed'` participate in any learning calculation. Rows with
`inferred`, `derived`, or `snapshot` provenance are ignored rather than being
treated as confirmed work or confirmed pauses.

- `actualProductionDays`: count of confirmed `here` rows.
- `firstProductionDate`: earliest `here` date.
- `lastProductionDate`: latest `here` date.
- `calendarSpanDays`: inclusive calendar difference between the first and last `here` dates. Null if either date is unavailable.
- `explicitPauseDays`: count of confirmed `not_here` rows from the first through last confirmed `here` date, inclusive. This matches `calculateProductionTiming` in `production-presence.ts`.
- `unrecordedDays`: count of confirmed `unrecorded` rows from the first through last confirmed `here` date, inclusive. This is reported as missing evidence and never treated as zero production.

Because `job_daily_presence.date` is non-null, a job with confirmed `here`
evidence always has both a first and last production date. The pure
calculator must still return null dates for an empty record set and tests
should cover that empty case rather than malformed dates.

Group-level values:

- `eligibleJobCount`: number of jobs with at least one confirmed `here` row.
- `productionDaysMedian`: median of job-level actual production days.
- `productionDaysRange`: minimum and maximum job-level actual production days.
- `calendarSpanMedian`: median of non-null job-level calendar spans.
- `calendarSpanRange`: minimum and maximum non-null calendar spans.
- `explicitPauseDaysTotal`: total explicit pauses across eligible jobs.
- `lastObservedDate`: latest job-level last production date.
- `serviceScopes`: unique selected production service names represented in the sample.

Median is the primary learned value because one unusually long job should not dominate the model’s observed expectation. For an even number of eligible jobs, median is the arithmetic mean of the two middle values after ascending sort; fractional results are allowed and are serialized as JSON numbers. The range and job basis remain visible for context.

If fewer than three eligible jobs exist, the response must provide the available sample count but set learned aggregate values to null and mark the sample as insufficient.

## API response shape

The response should have a stable envelope:

```ts
type ProductionObservationResponse = {
  modelId: number;
  benchmark: {
    id: number | null;
    jobType: string | null;
    estimatedHours: number | null;
  };
  sample: {
    eligibleJobCount: number;
    minimumJobsRequired: 3;
    sufficient: boolean;
    lastObservedDate: string | null;
  };
  observed: {
    productionDaysMedian: number | null;
    productionDaysRange: { min: number; max: number } | null;
    calendarSpanMedian: number | null;
    calendarSpanRange: { min: number; max: number } | null;
    explicitPauseDaysTotal: number;
    serviceScopes: { id: number; name: string; jobCount: number }[];
  };
  jobs: {
    id: number;
    title: string;
    status: string;
    productionDays: number | null;
    calendarSpanDays: number | null;
    explicitPauseDays: number;
    unrecordedDays: number;
    firstProductionDate: string | null;
    lastProductionDate: string | null;
    serviceScopes: { id: number; name: string }[];
    exclusionReason: "no_confirmed_presence" | null;
  }[];
};
```

The API must return dates as ISO calendar-date strings and numeric aggregates as JSON numbers or null, matching existing API conventions.

The `benchmark` fields map directly to `job_type_benchmarks.id`,
`job_type_benchmarks.job_type`, and `job_type_benchmarks.estimated_hours`.
The server parses the numeric database value before serializing it; it does
not expose the database decimal string.

## Knowledge Center UI

The model detail view receives the new observation response and displays:

- Card title: `Observed Production History`.
- A short explanation that these are confirmed presence observations and do not change the current benchmark.
- Sample count and last observed date.
- Median production days with range.
- Median calendar span with range.
- Explicit pause days.
- Selected service scope chips or labels.
- An expandable `Why this observation?` section listing the contributing jobs and their per-job metrics.

Empty and partial states:

- No qualifying jobs: “No completed production history is available for this model.”
- Fewer than three eligible jobs: show the sample count and “Not enough history to show a learned baseline.”
- Jobs exist but have no confirmed `here` rows: explain that daily presence must be recorded before they can contribute.

The existing editable benchmark card remains separate and unchanged. No “Apply,” “Save,” or automatic update action is included in this phase.

## Error handling

- A failed observation request must not blank or replace the existing model detail data.
- The observation card shows a local error state with a retry action.
- Retry refetches only the observation endpoint.
- A failed request must not change benchmark values, Knowledge Base records, presence records, or job data.
- Unauthorized, cross-business, missing-model, and server errors must use the existing route error conventions.

## Testing

### Backend unit tests

Test the pure observation calculator with fixtures for:

- multiple `here` dates,
- `not_here` pauses,
- explicit `unrecorded` rows,
- an empty record set returning null first/last dates,
- inferred, derived, and snapshot rows excluded from every learned metric,
- pauses and unrecorded rows outside the first/last confirmed `here` window excluded,
- one and two eligible jobs below the threshold,
- exactly three eligible jobs,
- outlier jobs and median/range behavior,
- no confirmed presence evidence.

### Backend route tests

Cover:

- authenticated model-scoped success,
- model and job business isolation,
- terminal-status filtering,
- exact `jobs.workflow = 'mh_production'` filtering and MH service exclusion,
- JSON service ID resolution, `applies_to = 'production'` filtering, and retention of inactive historical service names,
- benchmark link and service-scope output,
- stable empty and insufficient-sample responses,
- failed database/request handling,
- read-only behavior.

### Frontend tests

Cover the Knowledge Center model detail card for:

- loading,
- populated observations,
- insufficient sample,
- no eligible history,
- request failure and retry,
- traceability expansion,
- unchanged existing benchmark display.

### Regression verification

Run the relevant API tests, contractor-app typecheck, API typecheck, and the existing production-presence browser verifier. Confirm no presence, schedule, payroll, financial, or benchmark mutation occurs.

## Non-goals

- Automatically updating `job_type_benchmarks`.
- Creating an approval workflow for benchmark changes.
- Creating a new production component or variant schema.
- Producing trade-level duration estimates from whole-job presence.
- Adding job-specific production-plan snapshots.
- Including Service jobs.
- Changing the daily presence editor or schedule history behavior.
- Using presence observations in pricing, payroll, expenses, invoices, or profit calculations.