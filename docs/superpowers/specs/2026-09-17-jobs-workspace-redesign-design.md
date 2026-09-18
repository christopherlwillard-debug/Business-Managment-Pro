# Jobs landing page and job workspace redesign

## Status

Approved by the user on 2026-09-17.

## Goal

Make the Jobs experience easy to understand without training:

```text
JOBS → find a job → OPEN JOB → JOB / SCHEDULE / OVERVIEW
```

The Jobs landing page should answer “Where are my jobs?” The dedicated job workspace should answer “What am I doing with this job?” The SCHEDULE tab should answer “When am I doing it?” The OVERVIEW tab should answer “What else do I need to know?”

This is a UX restructuring. Existing accounting, payment, invoice, payroll, production, presence, work-session, checklist, materials, trip, photo, note, and scheduling data and behavior remain authoritative and unchanged.

## Architecture review

### Existing systems that overlap

- Jobs owns the job record, lifecycle status, planning state, date range, business ownership, and job relationships.
- The existing Jobs page owns the job list, schedule views, job editing, closeout, and access to job-specific detail panels.
- Daily production presence owns per-job/per-day presence and work start/finish timestamps.
- Existing financial and payroll engines own the values surfaced in job financial summaries and detail panels.
- Existing planner, schedule-history, production-component, checklist, materials, trips, photo, notes, invoice, and payment panels already own their respective detail behavior.

### Existing database tables

No tables will be added or changed. The redesign continues to read existing job, presence, financial, payroll, production, scheduling, checklist, materials, trip, photo, note, invoice, and payment tables through their current APIs.

### Existing API routes

No API routes will be added or changed for the UX restructure. Existing jobs, scheduling, production-presence, production-component, financial, invoice, payroll, materials, checklist, trip, photo, note, and payment routes remain the sources used by the existing panels.

### Existing UI pages

- `artifacts/contractor-app/src/pages/Jobs.tsx` remains the primary page.
- Existing specialized panels and planner components will be extracted or repositioned into a dedicated job workspace.
- No new top-level page or competing Jobs workflow will be created.

### Existing calculations

No calculations will be recreated. The compact landing rows will use existing job response fields. Financial details in the workspace will use the existing profit/payment hooks and engines. Schedule timing will use the existing production-presence timing response.

### Existing reports

No reports change. Job, financial, payroll, invoice, tax, mileage, and production reporting continue to query their current sources.

### Source of truth

| Concern | Source of truth |
| --- | --- |
| Job identity, lifecycle, dates, planning, ownership | `jobs` table via Jobs API |
| Daily work state and timestamps | `job_daily_presence` via production-presence API |
| Profit and financial values | Existing shared job-profit and financial calculation engines |
| Payroll and worker/subcontractor payment | Existing payroll ledgers and API |
| Production components and work sessions | Existing component snapshot and work-session systems |
| Primary UI | `Jobs.tsx` and its extracted workspace components |

### Duplicate-system check

The redesign does not add a second job detail page, schedule system, presence system, financial calculation, or payment workflow. It changes where existing capabilities appear and when their data is loaded.

### Recommendation

Extract a compact landing-page row and a dedicated workspace from the existing Jobs page. Use a large desktop drawer/modal and a full-screen mobile workspace. Preserve existing specialized panels inside JOB, SCHEDULE, or OVERVIEW sections.

## Product structure

### Jobs landing page

Keep:

- Search
- New Job
- Today, Week, Month, and Agenda views
- Practical job filters
- Compact job rows
- Job name
- Customer
- Location
- Date range
- Simple current work state
- Amount/status summary
- `OPEN JOB`

Remove from the primary landing-page cards and summary area:

- Large payment snapshots
- P&L details
- Materials
- Labor summaries
- Checklists
- Business trips
- Worker pay
- Subcontractor payment detail
- Detailed production components
- Detailed work sessions
- Detailed payment information
- Finish Job
- Scheduling follow-up blocks
- Ready-to-start/no-start-date blocks
- Unscheduled/waiting/This Week statistic cards

Scheduling operations that remain useful stay inside the schedule view rather than appearing as competing dashboard blocks.

### Dedicated job workspace

Opening a job selects the job and opens a real workspace instead of expanding the compact row.

Desktop behavior:

- Large right-side drawer or modal with nearly full available height
- Wide content area for readable sections
- Clear close action
- Persistent three-tab navigation

Mobile behavior:

- Full-screen workspace
- Sticky header with job title and back/close action
- Full-width or horizontally scrollable tabs
- No compressed desktop card layout

### JOB tab

Primary day-to-day screen:

- Job name
- Customer
- Location
- Current job status
- Schedule summary
- Today’s work state
- Important financial summary
- Compact work breakdown
- Finish Job

Daily work states:

1. Not started:
   - Show `READY TO WORK`
   - Show `START WORK TODAY`
2. Started:
   - Show `WORKING TODAY`
   - Show `DONE FOR TODAY`
3. Finished for today:
   - Show `DONE FOR TODAY`
   - Show `START WORK TODAY` for the next work day

The existing start/end API behavior remains the source of truth. No manual Here, Unrecorded, Calendar Day, or Production Day controls appear on JOB. Component statuses remain independent and optional. Starting work never depends on component statuses or a new business selection.

### SCHEDULE tab

Show:

- Scheduled date range
- Expected production days
- Actual production days
- Actual production start
- Last work date
- Daily work history
- Optional detailed date-by-date presence editor

Existing schedule-history and presence components are moved here and remain available as detail/history, not as the primary work control.

### OVERVIEW tab

Organize the remaining detail into readable sections:

- Customer and location
- Business and distance
- Production components
- Invoice and payment
- Workers
- Subcontractors
- Materials
- Labor summary
- Checklist
- Business trips
- Photos
- Notes
- Other job details

Use progressive disclosure for large or specialized sections so the initial view is scannable.

## Component boundaries

The current `JobCard` will no longer own all job detail surfaces. The page will be organized around focused components with explicit responsibilities:

- `JobsLandingHeader`: page title, search, New Job, and top-level actions.
- `JobsScheduleView`: existing Today/Week/Month/Agenda schedule surface.
- `CompactJobRow`: list-only summary and `OPEN JOB`.
- `JobWorkspace`: responsive drawer/full-screen shell and selected-job lifetime.
- `JobWorkspaceHeader`: job identity, status, edit, and close/back actions.
- `JobWorkspaceTabs`: JOB, SCHEDULE, and OVERVIEW navigation.
- `JobWorkspaceJobTab`: daily work state, concise work breakdown, financial summary, and Finish Job.
- `JobWorkspaceScheduleTab`: schedule metrics, history, and optional presence editor.
- `JobWorkspaceOverviewTab`: progressive-disclosure sections for the remaining job panels.

Existing specialized panels are reused and moved into these surfaces rather than duplicated.

## Data flow and loading

1. The landing page loads the existing job list and schedule data needed for compact rows and calendar views.
2. The landing page does not render detailed per-job financial, production, materials, trips, checklist, work-session, or payment panels.
3. Selecting `OPEN JOB` stores the selected job in page state and opens `JobWorkspace`.
4. Workspace-only queries are enabled for the selected job and active tab where possible.
5. Mutations invalidate the existing job/detail caches and update the workspace state so the result is visible without closing the workspace.
6. Closing the workspace clears the selected job and returns to the same landing-page schedule/list context.

No URL or database contract is required for the first implementation. A deep-link route is intentionally out of scope to keep the approved request focused on the pop-up workspace.

## Error, loading, and empty states

- Landing-page loading shows a compact list skeleton rather than large card placeholders.
- Empty search/filter results explain how to clear the filter or create a job.
- Workspace loading shows a workspace shell with section skeletons.
- A failed workspace query identifies the unavailable section and provides retry without hiding unrelated sections.
- Start/end work errors stay near the daily work control and retain the plain action vocabulary.
- Financial unavailable states preserve the existing “Unavailable” and reason behavior; the client must not invent zero values.
- Closing/reopening a workspace must initialize from current data rather than stale open-time props.

## Responsive and accessibility requirements

- Mobile-first layout with no horizontal page overflow.
- Minimum touch target of 44px for main actions and tab controls.
- Visible keyboard focus states.
- Dialog/drawer focus management and Escape-to-close on desktop.
- Semantic tab roles and selected state.
- Buttons use plain action labels, not icon-only controls without accessible names.
- Respect reduced-motion preferences.
- Preserve readable contrast for status and action colors.

## Testing and verification

### Automated

- Contractor-app typecheck
- Existing contractor-app tests
- API and production-presence regression suites
- Existing close-job, profit-contract, production-component, and component-baseline checks

### Browser/manual

- Desktop landing page: compact rows, schedule modes, search, filters, and `OPEN JOB`
- Desktop workspace: JOB, SCHEDULE, OVERVIEW, close, edit, and Finish Job
- Mobile workspace: full-screen layout, tabs, sticky header, and daily work actions
- Start Work Today → Active + Here + timestamp
- Done For Today → finish timestamp while remaining Active
- Start again on a later work day
- Schedule history and optional presence editor
- Overview sections and existing specialized panels
- Existing accounting/payment values remain unchanged and available in the workspace

## Non-goals

- No new database tables
- No new financial or payroll calculations
- No new job lifecycle
- No deletion of existing job detail data
- No redesign of unrelated pages
- No native mobile app
- No deep-link route required for the first implementation