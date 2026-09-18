# Schedule-First Production Planning

**Status:** Design approved for implementation  
**Date:** 2026-09-18

## Problem

Production Components already identify the major work packages for a manufactured-home
job and retain independent status and expected duration. The current Jobs Schedule
primarily shows job start/end dates and scheduled checklist items, while the Job view
also shows a larger Work Breakdown section. This makes the planned production sequence
hard to see by date and makes the Work Breakdown look like a second checklist.

The Schedule should answer “What are we doing each day?” using Production Components.
The Checklist should continue answering “What tasks are complete?” Daily Production
Presence must continue recording what actually happened, independently of planned dates.

## Approved design

Extend the existing Jobs `schedule-overview` read model with a server-derived,
date-filtered production plan. Do not create a new planning table or write derived
component dates back to the database.

For each active, business-scoped job:

1. Use the job's existing `startDate` as the planning anchor.
2. Walk current, non-superseded, applicable Production Components in their existing
   component order.
3. Assign each component a consecutive calendar block whose length is its explicitly
   entered `expectedDurationDays`.
4. Include each component/date occurrence that overlaps the requested Schedule range.
5. Keep components with no job start date or no expected duration in a separate
   unscheduled production list. Never invent a date or duration.
6. If the derived blocks extend beyond the job's existing `endDate`, retain the
   existing job date and expose the overflow as a planning warning; never mutate the
   job dates.

The derived plan is informational. It does not infer or change component status,
presence, checklist completion, work sessions, job state, or any financial data.
Multiple components may remain `in_progress`; status is displayed as stored and is
not derived from whether a planned date is current or past.

## Data flow and ownership

- **Source of truth:** `jobs` owns job dates; `job_production_components` owns current
  component status and expected duration; the existing component classifier and
  snapshot reader remain authoritative for component identity/order.
- **API owner:** the existing `GET /jobs/schedule-overview` route in
  `artifacts/api-server/src/routes/job-checklists.ts`.
- **UI owner:** the existing Schedule section in
  `artifacts/contractor-app/src/pages/Jobs.tsx`.
- **Actual production owner:** `job_daily_presence` and existing component work-session
  records remain read and written only by their current presence/work-session paths.
- **Checklist owner:** existing checklist records and scheduled checklist-item fields
  remain unchanged.

The route should add a production-plan collection to each existing schedule job,
alongside the existing `checklistItems` and `unscheduledChecklistItems`, plus an
unscheduled production collection and an explicit overflow indicator or equivalent
explainable metadata. The client should consume the response as returned rather than
reimplementing date allocation independently.

## Schedule behavior

The Schedule remains date-first in all three existing views:

- **Week:** each day column/card lists planned component work under the job, with
  component label, stored status, and duration context. Checklist items remain visually
  distinct task events.
- **Month:** component work contributes to the selected date's event count and detail
  list, with a distinct visual treatment from checklist tasks.
- **Agenda:** dates are grouped in order and show component work before or alongside
  checklist tasks without merging their meanings.

An item opens the existing job context. Component events should provide a direct
route to the existing Production Components detail/editor surface, not create a new
component editor. The Schedule should clearly label these as **Planned** so they
cannot be mistaken for recorded presence.

Loading, error, empty, and partial states must remain safe. If production planning
cannot be derived for a job, the existing checklist schedule must still render and the
job must expose an explainable unscheduled or unavailable state.

## Job-page treatment

The Job page keeps a compact production summary rather than a second full calendar:

- show the component completion/status summary;
- show a concise indication of planned component work or missing planning inputs;
- provide a “View on Schedule” action that returns to the Schedule context;
- preserve the existing component detail surface for status and expected-duration edits.

The Job page must not duplicate the full date-by-date production plan or use checklist
completion as the production plan.

## Explicit non-goals and safety boundaries

- No new database table, route, mutation, or persisted component-date fields.
- No changes to job `startDate` or `endDate`.
- No changes to manually entered `job_daily_presence` records or their interpretation.
- No conversion of planned dates into “Here,” work sessions, hours, payroll, expenses,
  mileage, invoices, profit, owner withdrawals, or tax records.
- No automatic changes to component status, checklist completion, planning readiness,
  or job lifecycle state.
- No replacement of the existing checklist schedule or Schedule History behavior.
- No change to the separate Route Planner or its date/deduplication rules.

## Edge cases

- **No start date:** the job remains available in existing unscheduled/queue support;
  production components are not placed on arbitrary dates.
- **Missing duration:** the component is visible in unscheduled production planning with
  a “duration not set” explanation.
- **Zero or invalid duration:** treat it as unavailable and surface the invalid input
  rather than silently using one day.
- **End-date overflow:** render the derived occurrences outside the job end date only
  when they fall inside the requested Schedule range, and mark the job/component plan
  as extending beyond the job window.
- **Not applicable or superseded component:** exclude it from the current plan.
- **Several components in progress:** render each independently; never collapse them
  into one active component.
- **Business switching:** use the existing business-scoped route behavior and do not
  retain production events from the previous business in the visible Schedule.
- **Range boundaries:** use date-only comparisons and include occurrences exactly on
  `from` and `to`.

## Testing and verification

Add focused API coverage for:

1. sequential blocks from the job start date;
2. date-range filtering at both boundaries;
3. missing start date and missing duration;
4. not-applicable and superseded exclusion;
5. independent simultaneous component statuses;
6. end-date overflow without changing job dates;
7. business isolation;
8. checklist behavior remaining unchanged.

Add focused client coverage for:

1. component events appearing in week, month, and agenda views;
2. distinct planned-versus-checklist labels;
3. unscheduled and overflow explanations;
4. safe loading/error/empty states;
5. Job-page compact summary and Schedule navigation;
6. no presence controls or actual-work labels being introduced into planned events.

Before delivery, run the focused API tests, API and contractor-app typechecks, the
existing production-component and production-presence checks, and a responsive app
preview. Production validation, when the corrected build is published, must target
`https://business-managment-pro.replit.app` only.