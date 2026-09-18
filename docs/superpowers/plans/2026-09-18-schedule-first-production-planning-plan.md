# Implementation Plan: Schedule-First Production Planning

## Architecture review

1. **Overlapping systems:** Jobs Schedule, Production Components, Checklist scheduling,
   and Daily Production Presence already exist and overlap in the visible workflow.
2. **Existing tables:** `jobs` owns scheduled dates; `job_production_components` owns
   current component snapshots/status/duration; checklist and presence tables remain
   independent.
3. **Existing API:** extend `GET /api/jobs/schedule-overview` in
   `artifacts/api-server/src/routes/job-checklists.ts`.
4. **Existing UI:** extend the Schedule section and Job workspace in
   `artifacts/contractor-app/src/pages/Jobs.tsx`.
5. **Calculation:** add one pure sequential date-allocation helper; do not duplicate
   the calculation in React.
6. **Reports/financials:** none. Planned dates must not enter accounting, payroll,
   invoices, profit, mileage, tax, or owner-withdrawal paths.
7. **Source of truth:** existing job dates and current component snapshots; derived
   occurrences are read-model output only.
8. **Duplicate risk:** avoid persisted component dates, a new planner table, or a
   client-side second date allocator.
9. **Extension:** this extends the existing Schedule read model and production component
   UI; it does not create a new subsystem.
10. **Recommendation:** implement server-derived occurrence objects with explicit
    unscheduled/unavailable states and preserve all existing schedule/presence behavior.

## Work sequence

### 1. Add and test the pure production-plan allocator

**Files**

- Add `artifacts/api-server/src/lib/job-production-schedule.ts`
- Add `artifacts/api-server/src/lib/job-production-schedule.test.ts`

**Work**

- Define the response types for production plan status, occurrence items,
  unscheduled components, and overflow warnings.
- Accept a date-only job start/end and the already ordered current component views.
- Filter out superseded, non-persisted, and `not_applicable` components.
- Validate duration as a finite integer from 1 through 365.
- Derive inclusive sequential calendar blocks, including weekends.
- Emit one occurrence per component/date with deterministic `occurrenceKey`.
- Skip missing/invalid components without reserving dates; continue later valid blocks.
- Apply the approved missing-input reason precedence.
- Emit overflow warnings only when an existing job end date is exceeded.
- Keep the helper free of database, presence, checklist, and financial dependencies.

**Tests**

- one-day and multi-day sequential blocks;
- inclusive range boundaries and weekends;
- missing start date, missing duration, invalid duration, and continuation;
- not-applicable/superseded/non-persisted exclusion;
- simultaneous stored statuses remain independent;
- end-date overflow and no-end-date behavior;
- deterministic occurrence keys and reason precedence.

### 2. Extend the existing schedule-overview response

**Files**

- Update `artifacts/api-server/src/routes/job-checklists.ts`
- Update `artifacts/api-server/src/routes/job-schedule.test.ts`

**Work**

- Reuse the current active-job business filter and checklist query unchanged.
- Load current production components for each scoped schedule job through the existing
  `getJobProductionComponents` reader.
- Run the pure allocator once per job and merge its read-only output into that job.
- If a component read fails for one job, retain its checklist fields and return the
  explicit unavailable production-plan state with empty production arrays; do not fail
  the whole schedule response.
- Preserve the current date-range behavior for checklist items and add the same
  inclusive range filtering to production occurrences.
- Do not write any database rows or mutate job dates.

**Tests**

- Extend existing strict queue fixtures for component reads.
- Verify sequential response objects, range boundaries, unscheduled reasons, status
  independence, overflow, no end date, and business isolation.
- Verify completed/invoiced/closed filtering and checklist output remain unchanged.
- Verify a component-read failure does not remove the job or its checklist events.

### 3. Render planned production events in the Jobs Schedule

**Files**

- Update `artifacts/contractor-app/src/pages/Jobs.tsx`
- Add or update the nearest existing contractor-app Schedule component test file found
  during implementation.

**Work**

- Extend the local `ScheduleJob`/schedule event types to consume the server contract.
- Add production plan occurrences to the existing event collection and date grouping.
- Render planned component events with a distinct visual treatment and explicit
  “Planned” labeling; keep checklist task labels and click behavior distinct.
- Show stored component status and duration context without deriving status from dates.
- Surface unscheduled production inputs and overflow/unavailable warnings in the
  existing Schedule support area without hiding checklist events.
- Keep loading, error, empty, and partial states safe.
- Make component events open the existing job production-component detail surface;
  do not add a new editor or presence control.
- Implement the Job-page compact production summary and “View on Schedule” action.
  It switches the current workspace to Schedule, selects the first planned component
  start date when available, and otherwise uses today.
- Preserve all existing actual-presence and work-session behavior.

**Tests**

- Verify planned events appear in week, month, and agenda grouping.
- Verify planned and checklist events remain distinguishable.
- Verify unscheduled, overflow, unavailable, and empty states.
- Verify Job-page summary/navigation behavior.
- Verify no presence write or “Here” interpretation is attached to planned events.

### 4. Verify the complete change

Run:

- focused production-plan and schedule API tests;
- `pnpm --filter @workspace/api-server run typecheck`;
- contractor-app typecheck;
- existing production-component and production-presence checks;
- the relevant contractor-app tests;
- responsive app preview at desktop and mobile widths.

Inspect API/browser logs after restarting only the affected workflows. Validate the
published build later only at `https://business-managment-pro.replit.app`, never the
public website domain.

## Completion criteria

- Schedule answers what production component is planned on each date.
- Checklist remains task-completion focused.
- Presence remains actual-work evidence and is not inferred from the plan.
- Component statuses and durations remain independently editable and preserved.
- No financial, payroll, invoice, owner-withdrawal, mileage, scheduled-date, or presence
  records change.
- Existing schedule filtering, checklist events, and Schedule History remain intact.