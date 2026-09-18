# Jobs duration and work-state repair

## Status

Approved by the user on 2026-09-18.

## Problem

The Jobs workspace currently mixes three different concepts:

- the overall planned duration of a job;
- the planned duration of an individual production component;
- the actual unique production dates recorded for the job.

The existing implementation defaults `jobs.daysOnJob` to `1`, copies that value into every production component, and calculates schedule timing only from the job-level value. This makes a multi-component job appear to have a one-day plan even when its work breakdown has multiple durations.

The workspace also exposes state inconsistencies:

- job-level production presence does not reconcile with component progress;
- Finish Job can mark a job completed while required components remain Planned or In Progress;
- Start Work Today writes a `workday_action` source that is rejected by the currently observed production schema in production;
- future production dates can be recorded and then shown as the last actual work date;
- daily history renders the state label “Here” without showing the job location.

## Approved behavior

### Duration separation

The application must show these values as separate, named concepts:

1. **Job Expected Days** — the overall planned production duration.
2. **Component Expected Days** — the expected production duration for one work item.
3. **Actual Days** — unique production dates recorded for the job.

The resolution order for Job Expected Days is:

1. an explicitly entered job-level override;
2. otherwise the longest applicable current component expected duration;
3. otherwise Not Set.

Component durations are independent planning values. Changing the job-level override must not alter, erase, or silently recalculate an existing component duration. The existing component duration value is preserved during snapshot synchronization; new components start unset unless a component-specific planning value is supplied.

The old database default of `1` is not evidence that a user intentionally entered a one-day override. New jobs must not receive an implicit one-day override. A new `jobs.daysOnJobExplicit` boolean records whether the value was intentionally supplied. New writes set it to `true` only when a valid value is present in the request and set both the value and flag to unset when the field is cleared. The migration classifies legacy rows with `daysOnJob = 1` as non-explicit/unset and legacy values greater than one as explicit. A newly entered one-day override after this change is explicit because the provenance flag is true.

The component table also receives `expectedDurationDaysExplicit`. Existing component rows are set to `false` without rewriting their stored duration. Their values remain visible as legacy component planning values but are excluded from derived Job Expected Days until a user confirms or edits the component duration. New component-specific duration writes set the flag to `true`; clearing the value sets the flag to `false`.

### Work-item state

Production components remain the job’s independent work items. Existing statuses remain the authoritative status values:

- planned;
- in_progress;
- paused;
- completed;
- not_applicable.

Multiple components may be In Progress simultaneously. Component status is not inferred from a job’s daily presence alone. Component-specific actual evidence continues to come from `job_component_work_sessions`.

### Actual production days

Job-level Actual Days count unique recorded production dates. Component durations and component work-session dates must never be summed into the job’s actual-day count. Component actual-day evidence remains component-specific and may be consumed by the existing production-intelligence systems.

The current-component predicate for derived Job Expected Days is:

- `supersededAt IS NULL`;
- `status <> 'not_applicable'`;
- `expectedDurationDaysExplicit = true`;
- `expectedDurationDays` is a positive integer.

Null, zero, negative, malformed, unconfirmed, superseded, and Not Applicable component durations are excluded. If no current applicable component qualifies, the resolver returns `null`.

### Start, resume, and date validation

The existing daily presence route remains the source of truth for job-level presence and timestamps. The server-approved date is the current application operating date in `America/Chicago`, matching the current user-facing operating timezone. The route does not trust a client-supplied future date.

Start Work Today must:

- accept only the server-approved current production date;
- distinguish first production day, resuming after an explicit not-here interruption, and recording an additional production day in its response:
  - `first_day`: no prior `here` record;
  - `resume`: at least one prior `here` record followed by a confirmed `not_here` record before the requested date;
  - `additional_day`: prior `here` history with no intervening confirmed not-here interruption;
- the mode is evaluated from the latest prior meaningful presence event, ordered by date and limited to `here` or confirmed `not_here` rows; `resume` requires that latest event to be `not_here` and at least one earlier `here` row, while `additional_day` requires the latest event to be `here`; `unrecorded` rows do not change the mode;
- remain idempotent for an already-started date;
- preserve the boundary that presence does not create payroll, expenses, mileage, invoices, payments, profit, checklists, or component work sessions;
- write a source value accepted by development and production schemas.

Manual presence edits must reject future dates. Existing past-date corrections remain supported.

### Finish Job

The existing `PATCH /api/jobs/:id` completion route must inspect current applicable component statuses before allowing completion. The request may include the additive boolean `confirmIncompleteWork`.

- Completed and Not Applicable components satisfy the work-item guard;
- Planned, In Progress, or Paused components produce a structured incomplete-work response;
- a missing confirmation returns `409` with:

  ```json
  {
    "code": "INCOMPLETE_WORK_ITEMS",
    "error": "Required work items are incomplete",
    "incompleteWorkItems": [
      { "componentInstanceKey": "siding:unspecified", "componentLabel": "Siding", "status": "planned" }
    ]
  }
  ```

- with `confirmIncompleteWork: true`, the server re-reads the current component rows while holding the job-row lock and then completes the job;
- the client must not be the only enforcement point.

The completion guard uses the same current-component set as the duration resolver (`supersededAt IS NULL`), but its status rule is different: every current component except `not_applicable` must be `completed`. If no persisted current snapshot exists, the server uses the current unsaved component drafts derived from the selected production services, so a selected production work item cannot bypass the guard by avoiding synchronization.

Existing unpaid worker/subcontractor and financial closeout behavior remains unchanged.

### Location and payment display

Daily history must show the job’s location label or address instead of using “Here” as the only contextual label. Location precedence is `locationName`, then `address`, then `city + state`, then the exact fallback `Location not recorded`.

Payment Snapshot continues to consume the existing server financial-summary calculation and must not introduce a second payment or owner-pay calculation. Regression coverage will assert the snapshot remains aligned with the existing job financial detail path.

## Architecture review

### Existing systems that overlap

- Jobs owns job identity, lifecycle status, dates, manual job planning fields, and business ownership.
- `job_daily_presence` owns job-level per-day production presence and workday timestamps.
- `job_production_components` owns versioned job-specific work-item snapshots and independent component status.
- `job_component_work_sessions` owns component-specific actual work evidence.
- The existing job-profit and financial-summary engines own financial and payment values.
- `Jobs.tsx`, `JobPresencePanel`, and the existing production component/work-session controls own the UI surfaces.

### Tables affected

- `jobs`: remove the implicit one-day default and add `days_on_job_explicit` provenance needed to distinguish legacy defaults from intentional overrides.
- `job_production_components`: preserve independent component expected durations, add `expected_duration_days_explicit`, and stop copying the job override into every component.
- `job_daily_presence`: no new concept or table; align schema acceptance for the existing `workday_action` source and validate dates at the API boundary.
- No new tables are required.

### APIs affected

- `artifacts/api-server/src/routes/job-presence.ts`
  - resolve expected duration through a shared job/component resolver;
  - validate future dates;
  - return start mode;
  - improve structured errors.
- `artifacts/api-server/src/routes/jobs.ts`
  - preserve component expected durations during snapshots;
  - accept optional component expected-duration updates through the existing `/:id/production-components/status` API surface;
  - enforce incomplete-work confirmation on completion.

Existing route names and response fields remain compatible where possible. New fields are additive.

### Calculation engine

Expected-duration resolution belongs in a server-side Jobs/production-presence helper, not in React. The helper returns both the resolved value and its source:

```text
explicit job override
  → max(current applicable component expectedDurationDays)
  → null
```

The contract is:

```ts
type JobExpectedDurationResolution = {
  expectedDurationDays: number | null;
  source: "job_override" | "component" | "unset";
};
```

Actual job days remain calculated from unique `job_daily_presence.date` values where state is `here`.

For the job PATCH contract:

- omitted `daysOnJob` preserves the existing value and provenance;
- `daysOnJob: null` clears the override and sets `daysOnJobExplicit` to `false`;
- a positive integer from 1 through 365 stores an explicit override and sets `daysOnJobExplicit` to `true`;
- zero, negative, fractional, non-numeric, or greater-than-365 values return `400`;
- `daysOnJobExplicit` is server-owned and is not accepted from the client.

For the existing component status route, the additive request shape is:

```json
{
  "status": "planned | in_progress | paused | completed | not_applicable",
  "expectedDurationDays": "positive integer 1..365 or null"
}
```

At least one field is required. Omitted fields preserve their current values; `expectedDurationDays: null` clears the component plan. The route validates business ownership with the existing component-status guard and creates a new versioned snapshot under the existing job lock rather than mutating a historical row. The response is the new current component view.

### Primary UI

- `artifacts/contractor-app/src/pages/Jobs.tsx`
- `artifacts/contractor-app/src/components/planner/JobPresencePanel.tsx`
- Existing production component and work-session sections

The UI will display the duration source and labels clearly but will not calculate business values locally.

### Reports and financial systems

No financial ledgers, profit calculations, payroll calculations, invoice calculations, tax calculations, mileage calculations, or reports change. The change is operational scheduling and production-state data only.

## Data migration

The schema migration must:

1. make the job-level duration nullable with no default;
2. add `days_on_job_explicit BOOLEAN NOT NULL DEFAULT FALSE`;
3. classify existing values greater than one as explicit legacy overrides;
4. classify rows holding only the legacy default of one as non-explicit/unset;
5. add `expected_duration_days_explicit BOOLEAN NOT NULL DEFAULT FALSE` to components, backfill it to `FALSE`, and avoid changing component expected-duration values in place;
6. leave historical presence, work-session, financial, payroll, invoice, and checklist rows untouched;
7. update the production source constraint to accept `workday_action`.

The migration must be repeatable and use guarded SQL. Development schema must be applied and inspected before verification.

The migration does not rewrite or erase existing component expected-duration values. Snapshot synchronization stops changing them based on a job-level override. Existing values remain visible as component planning values and can be independently edited or cleared.

Live timing excludes retained historical presence rows whose date is after the server-approved current application date. Those rows remain readable in history for audit, but they do not affect Actual Days, actual start, last work date, calendar span, paused-day counts, or variance.

## Error and confirmation behavior

### Start Work Today

The API returns:

- `400` for invalid or future dates;
- `404` for an inaccessible job;
- `409` for completed/closed jobs or an invalid state transition;
- a structured `500` response with the stable code `WORKDAY_START_FAILED` for unexpected persistence failures; raw database details are logged server-side and are not returned to the client.

The client displays the server message near the workday action and invalidates the presence/job caches after success.

Start, end, and manual presence writes reject dates after the server-approved current application date. Existing past-date records, including any already-invalid future rows, remain stored for audit.

### Finish Job

An incomplete-work response includes the component labels and statuses that block ordinary completion. The client presents a confirmation action; only an explicit confirmation sends the override field. The server rechecks the current component state in the same completion request.

## Testing

### Unit and API tests

- expected-duration resolver: explicit override wins;
- expected-duration resolver: longest component duration is used when no override exists;
- component duration changes do not mutate job override or other component durations;
- legacy/default one-day rows resolve as unset;
- actual days count unique `here` dates;
- future presence dates are rejected;
- first/resume/additional start modes are returned;
- `workday_action` start succeeds against the target schema contract;
- multiple components can remain `in_progress`;
- completion blocks incomplete components without confirmation;
- explicit completion confirmation succeeds;
- payment snapshot contract remains aligned with financial-summary values.

### Existing regression suites

- production-presence tests;
- production-component tests;
- component work-session tests;
- close-job verification;
- API and frontend typechecks;
- job-profit contract and client checks;
- full API test suite.

### Browser validation

Using authenticated real application data:

- verify a new blank duration does not display one day;
- verify a manually entered job override is labeled as manual;
- verify component durations remain unchanged when the job override changes;
- verify a derived job duration displays the longest component duration;
- verify Actual Days counts unique dates;
- verify first start, resume, and additional production day labels;
- verify future-date entry is rejected;
- verify the daily history displays the job location;
- verify Finish Job warning/confirmation behavior;
- verify payment values remain unchanged.

The affected mutations retain their existing authenticated, business-scoped job-write permission checks. Component-duration updates use the same business scope and permission boundary as component-status updates. The completion lock and response contract are tested for concurrent component changes.

## Non-goals

- No new production, financial, payroll, checklist, or presence table.
- No automatic component status changes based only on job-level presence.
- No summing component durations.
- No automatic rewriting of component expected durations when the job override changes.
- No changes to financial accounting or payment semantics.
- No redesign of unrelated pages.