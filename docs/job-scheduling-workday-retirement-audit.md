# Job Scheduling and Production Workday Retirement

## Scope and status

The approved interface retirement is implemented. No database migration, schema deletion, production job update, pricing change, invoice change, or financial formula change was made.

## Current job experience

- The Job Builder no longer asks for job start/end dates. Job creation remains job-type-aware and keeps its other fields, including optional planned labor hours and subcontractor assignment.
- The Job Workspace keeps the `Job` and `Overview` tabs; the `Schedule` tab and the embedded Jobs Planner are no longer shown.
- Daily presence editing and Start Work Today / Done for Today controls are removed from the job experience.
- Existing job dates, presence rows, checklist dates, production-component history, and financial records remain stored and unchanged.
- A status-only `Mark Active` action sets `in_progress`; it does not assign dates, add presence, or mark work complete.

## Dependency map

### Job start and lifecycle

- `POST /jobs/:id/start` now returns `410 JOB_SCHEDULING_RETIRED` and does not update the job.
- Presence write endpoints return `410 WORKDAY_TRACKING_RETIRED`; historical presence reads remain available for compatibility and reporting.
- `Mark Active` uses the existing job update route with only `status: in_progress`.
- Finish, close, reopen, subcontractor ledger, and payment safeguards remain unchanged.

### Shared job dates

`jobs.startDate` and `jobs.endDate` are not isolated UI fields. They are read by:

- Jobs Planner calendar and active/history views.
- Route Planner job matching by a route stop's date, in addition to its explicit job link.
- Manufactured-home labor's days-on-site calculation. A complete start/end date span still derives inclusive days. If either date is absent, a new labor review requires a positive whole-number manual value instead of defaulting to one day. Existing review values are preserved.
- Job checklist planning and timeline calculations.
- Closed-job date filtering, ordering, and date-opened/date-closed presentation.
- Job edit/create and schedule-start APIs.

The job date columns can remain intact and existing values can remain untouched, but removing date entry for new jobs changes the behavior of these consumers. No schema deletion or API removal is recommended in this change.

### Checklist dates and production-component plans

- Checklist items retain their own dates, assignments, history, and editing controls inside the checklist workflow. The separate planner calendar projection is removed.
- Existing production-component history and reviewed benchmarks remain intact. Production component status and expected-duration editing remain in the job workspace.

### Daily presence, financial estimates, and knowledge

- `job_daily_presence` holds daily Here / Not Here / Unrecorded facts, notes, provenance, and workday action timestamps. The timing summary is derived live from these rows and job dates; it is not stored as a separate calculation.
- Confirmed Here dates are the only input to the informational route-based estimated fuel cost shown in Job Financials and batch profit summaries. They do not change actual expenses or the authoritative profit calculation. If future presence capture is removed, new jobs will not have new confirmed-day inputs, so this estimate will be unavailable for those jobs; historical estimates can still be derived from retained rows. The financial formula itself need not change.
- Manufactured-home production observations and reviewed benchmarks consume confirmed presence facts as evidence. Removing future presence capture means those observations will stop receiving new presence evidence; existing observations, accepted/excluded records, and review history can remain intact.
- Component work sessions are separate from daily presence and do not write presence, payroll, expenses, or profit.

## Implemented boundary

1. Removed the Job Builder Schedule step, the Job Workspace Schedule tab, the Jobs Planner entry point, and daily workday controls.
2. Existing `jobs.startDate`, `jobs.endDate`, planning fields, presence tables, routes, and historical rows remain intact. Create/edit requests omit dates rather than clearing existing dates.
3. Route Planner remains separate and continues matching route stops to jobs using existing date ranges and explicit job links.
4. Checklist dates, assignments, and history remain accessible through the checklist workflow.
5. Job status can be changed to Active (`in_progress`) without changing dates, presence, work components, or payments.
6. Manufactured-home labor reviews require a manual Days On-Site value when no complete date span exists; complete date spans still derive the existing inclusive count.
7. Production Billing, invoice generation, pricing snapshots, financial calculations, finish/close/reopen behavior, and subcontractor ledgers were not changed.

## Files and areas inspected

- `artifacts/contractor-app/src/lib/jobBuilderNavigation.ts`
- `artifacts/contractor-app/src/pages/Jobs.tsx`
- `artifacts/contractor-app/src/components/planner/JobsPlanner.tsx`
- `artifacts/contractor-app/src/components/planner/JobScheduleHistory.tsx`
- `artifacts/contractor-app/src/components/planner/JobPresencePanel.tsx`
- `artifacts/contractor-app/src/components/JobChecklistPanel.tsx`
- `artifacts/contractor-app/src/pages/RoutePlanner.tsx`
- `artifacts/api-server/src/routes/jobs.ts`
- `artifacts/api-server/src/routes/job-presence.ts`
- `artifacts/api-server/src/routes/job-checklists.ts`
- `artifacts/api-server/src/routes/mfh-labor.ts`
- `artifacts/api-server/src/lib/production-presence.ts`
- `artifacts/api-server/src/lib/production-observations.ts`
- `artifacts/api-server/src/lib/job-workdays.ts`
- `lib/db/src/schema/jobs.ts`
- `lib/db/src/schema/job-daily-presence.ts`
- `.agents/architecture/SYSTEM_REGISTRY.md`
- `.agents/architecture/DECISIONS.md`

## Verification

### Checks performed

- API suite: 128 files, 1,506 tests passed.
- Contractor app typecheck and test typecheck passed.
- API server typecheck passed.
- Job navigation, planner component regression, and Route Planner job-matching tests: 9 passed.
- Close/finish/reopen E2E: 17/17 checks passed, including unpaid and unknown subcontractor balances, incomplete work, and no payment/component changes on reopen.
- Job-profit contract and client-consumer checks passed.
- Retired scheduling UI E2E: 5/5 checks passed at desktop and narrow viewport sizes.
- Production-component history E2E: 4 checks passed.
- Component-baseline review E2E: 10 checks passed.
- The app screenshot tool reached the sign-in page; authenticated job UI was instead checked through the scripted E2E browser.

### Files changed for this implementation

- `artifacts/contractor-app/src/lib/jobBuilderNavigation.ts`
- `artifacts/contractor-app/src/lib/jobBuilderNavigation.test.ts`
- `artifacts/contractor-app/src/pages/Jobs.tsx`
- `artifacts/contractor-app/src/components/KbTrainingModal.tsx`
- `artifacts/api-server/src/routes/jobs.ts`
- `artifacts/api-server/src/routes/job-start.test.ts`
- `artifacts/api-server/src/routes/jobs-business-scope.test.ts`
- `artifacts/api-server/src/routes/job-presence.ts`
- `artifacts/api-server/src/routes/job-presence.test.ts`
- `artifacts/api-server/src/routes/mfh-labor.ts`
- `artifacts/api-server/src/lib/job-workdays.ts`
- `artifacts/api-server/src/lib/job-workdays.test.ts`
- `artifacts/api-server/scripts/e2e-production-presence-verify.ts`
- `docs/job-scheduling-workday-retirement-audit.md`
- `docs/superpowers/specs/2026-11-13-job-scheduling-workday-retirement-design.md`
- `docs/superpowers/plans/2026-11-13-job-scheduling-workday-retirement-plan.md`

### Knowledge functionality remaining

Manufacturer/model references, baseline and override pricing, manual job pricing, historical job price snapshots, accepted/excluded knowledge records, version history, production observations, reviewed component benchmarks, Production Billing Catalog, client overrides, service prompts, invoice generation, and Trim-Out Catalog access remain in place. No knowledge or billing tables were deleted.
