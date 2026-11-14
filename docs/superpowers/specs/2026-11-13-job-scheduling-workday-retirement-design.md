# Job Scheduling and Workday Retirement — Design

**Status:** Owner-approved for spec review; implementation has not started.

## Goal

Retire job scheduling and production workday tracking as BuildPro workflows while keeping job records, historical date/presence data, financial calculations, checklists, materials, subcontractor operations, labor, payments, closeout, reopening, and the separate Route Planner intact.

## Approved implementation approach

1. Remove the optional Schedule step from new-job creation. Remove job-date/scheduling controls from job editing so creating or editing a job does not require or alter planned dates.
2. Remove the Job Workspace Schedule tab and its schedule summary, Daily Work History panel, daily presence editor, production timing cards, Start Work Today / Done for Today controls, and prompts to record production days.
3. Remove the Jobs Planner section from the Jobs page, including the job calendar, scheduling queue/start-date action, schedule history, presence panel, and date-planned production-component projections. Remove associated scheduling-only navigation and focus links.
4. Preserve the existing Job and Overview workspace tabs. Keep status management distinct from completion/closure: provide a status-only **Mark Active** action that sets the job to `active` without creating dates or presence records. Keep Finish Job, Close Job, and approved reopen behavior unchanged.
5. Preserve the separate Route Planner and its route-stop scheduling. Keep explicit job links and date-range matching for jobs with historical dates. New jobs without job dates will rely on explicit job links rather than schedule-date overlap.
6. Preserve checklist features, including checklist item dates and assigned-subcontractor scheduling data. Do not delete or rewrite existing checklist dates. The retired Jobs Planner will no longer provide their calendar projection.
7. Preserve all existing `jobs.startDate`, `jobs.endDate`, planning fields, `job_daily_presence` rows, schemas, and historical APIs/read paths. Do not run migrations or modify real job records. Omit absent date fields from create/update payloads so existing saved dates are not cleared during unrelated edits.
8. Retire the workday and scheduling write workflows with explicit retired responses for their dedicated start/presence mutation endpoints. Keep historical reads and existing database-based consumers available. Do not alter financial formulas; existing estimates can still use historical confirmed presence, while new jobs will have no presence-based fuel estimate.
9. In manufactured-home labor review, stop silently defaulting missing job dates to one day on site. Use the existing date-span calculation only when both start and end dates are present; require a manual Days On-Site value for new reviews whenever either date is absent. Preserve existing saved knowledge and production records.

## Data flow and compatibility

- Job date and daily-presence columns remain unchanged. Existing values stay available to closed-job displays, route matching, labor records, historical estimates, and production-observation readers.
- Job create/edit screens no longer introduce or submit schedule dates. The job API continues serializing existing dates for compatibility; unrelated edits must omit rather than clear them.
- Dedicated scheduling and presence mutations return an explicit retired response rather than silently writing new records. Historical read behavior remains available.
- The generic job status update path remains responsible for the status-only Active action and existing completion/closeout safeguards. The action must not set dates, mark subcontractors paid, or complete work items.
- No changes to Production Billing, invoices, expenses, payroll, payment ledgers, profit formulas, or database schema are included.

## User-visible effects

- New jobs are created without a schedule step or planned dates.
- The Jobs page no longer contains a job calendar or job scheduling queue.
- The Route Planner continues to schedule route stops. Jobs with old date ranges can still match by date; newly created jobs can be linked explicitly.
- Checklist item dates remain editable and stored, but are no longer surfaced in the retired Jobs Planner.
- New job financial views may show the existing estimate as unavailable when there are no confirmed historical presence days. No new prompt may ask the owner to record presence.
- Manufactured-home labor reviews need an explicit Days On-Site value when dates do not supply one.

## Regression and verification plan

Before implementation, record the existing focused test baseline. Add tests for:

- Creation without scheduling dates and editing without clearing legacy dates.
- Removal of Jobs Planner and Schedule-tab UI while Job and Overview tabs remain available.
- Status-only Active updates with no date/presence write.
- Retired schedule/workday mutation responses and preserved read access.
- Route Planner route-stop scheduling, explicit job links, and matching against historical job date ranges.
- Checklist dates, subcontractor assignment, materials, labor, and payments remaining functional.
- Manufactured-home labor review requiring a manual Days On-Site value when either date is absent, while preserving historical records and date-derived values for complete spans.
- Existing fuel-estimate behavior using historical confirmed days and no formula changes.
- Finish Job, Close Job, unpaid/unknown subcontractor safeguards, and approved reopening behavior.
- Closed-job cards and date sorting retaining historical date values.

Run the relevant frontend and API tests and typechecks. Inspect workflow and browser logs. Do not deploy or access/write production job data.

## Out of scope

- Database migrations, schema/table deletion, historical record cleanup, or production data edits.
- Any changes to Production Billing, invoice generation, pricing, expenses, payment ledgers, financial calculations, closeout rules, or reopening safeguards.
- Retiring Route Planner or removing checklist-level date data.
- Building a replacement calendar or workday tracking system.
- Deployment.

## Key inspected sources

- `artifacts/contractor-app/src/lib/jobBuilderNavigation.ts`
- `artifacts/contractor-app/src/pages/Jobs.tsx`
- `artifacts/contractor-app/src/components/planner/JobsPlanner.tsx`
- `artifacts/contractor-app/src/components/planner/JobScheduleHistory.tsx`
- `artifacts/contractor-app/src/components/planner/JobPresencePanel.tsx`
- `artifacts/contractor-app/src/components/JobChecklistPanel.tsx`
- `artifacts/contractor-app/src/pages/RoutePlanner.tsx`
- `artifacts/contractor-app/src/components/KbTrainingModal.tsx`
- `artifacts/api-server/src/routes/jobs.ts`
- `artifacts/api-server/src/routes/job-presence.ts`
- `artifacts/api-server/src/routes/job-checklists.ts`
- `artifacts/api-server/src/routes/mfh-labor.ts`
- `artifacts/api-server/src/lib/production-presence.ts`
- `artifacts/api-server/src/lib/production-observations.ts`
- `artifacts/api-server/src/lib/job-workdays.ts`
- `lib/db/src/schema/jobs.ts`
- `lib/db/src/schema/job-daily-presence.ts`
