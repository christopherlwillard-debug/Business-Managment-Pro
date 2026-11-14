# Job Scheduling and Workday Retirement — Implementation Plan

The approved design is in `docs/superpowers/specs/2026-11-13-job-scheduling-workday-retirement-design.md`. Work is split so existing behavior is captured before each major edit.

## Phase 1 — Establish regression coverage

- Run focused existing Job Builder, Jobs Planner, workday/presence, route-matching, manufactured-home labor, production observation, close/closeout, and profit tests.
- Add tests first for the approved post-retirement contracts: no schedule creation step, no planner/workday surfaces, no workday writes, status-only Active, legacy date retention, manual home-job days-on-site when the date span is incomplete, and preserved Route Planner/checklist/financial/closeout behavior.
- Record any pre-existing failures before product edits.

## Phase 2 — Retire job scheduling UI

- Remove the Job Builder Schedule step and job-date controls from create/edit without sending nulls that would clear existing dates.
- Remove the Workspace Schedule tab, workday history/presence controls, and scheduling summary/prompt UI; retain Job and Overview tabs.
- Remove the Jobs Planner section and scheduling-only page state, navigation/focus links, and job scheduling dialogs.
- Keep checklist item dates and assignments; keep Route Planner route-stop scheduling and explicit job linking.
- Preserve historical job dates for closed-job displays, sorting, reports, Route Planner matching, and existing records.

## Phase 3 — Preserve status and labor review

- Add a status-only Mark Active action using the existing job update contract; do not write job dates or presence.
- Keep Finish Job, Close Job, subcontractor payment checks, incomplete-work behavior, and reopening safeguards unchanged.
- Change manufactured-home labor draft behavior so date-derived Days On-Site is used only with both dates; otherwise require a manual value in the existing review flow.
- Keep all historical knowledge records and production observations untouched.

## Phase 4 — Retire dedicated write paths

- Disable the dedicated schedule-start and daily-presence/workday mutation endpoints with explicit retired responses.
- Keep historical reads, stored fields/tables, and database-based consumers for existing presence rows.
- Do not change the generic historical job-date fields, schema, production data, financial formulas, or unrelated APIs.

## Phase 5 — Full verification

- Run focused frontend and API tests, workspace typechecks, and the existing job lifecycle/financial validation workflows.
- Verify Route Planner, checklist scheduling, manufactured-home labor review, date-based closed-job displays, historical estimates, job completion/closeout, and reopening.
- Restart affected workflows once after code changes, inspect logs, and capture an app preview where authentication allows.
- Do not deploy or access/write production job data.
