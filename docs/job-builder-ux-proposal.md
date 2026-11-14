# BuildPro Job Builder UX Proposal

**Status:** Proposed for owner review only. No application code or data has been changed.

## Design goals

- Keep the existing Job Builder as the foundation, including all its fields and business-specific behavior.
- Keep the current Job, Schedule, and Overview tabs.
- Use the eight requested areas as grouped sections inside the workspace, not as eight new top-level tabs.
- Make the next useful action easy to identify for someone unfamiliar with the app.
- Keep existing panels, APIs, records, save behavior, calculations, and safeguards authoritative.
- Do not add a supplier field or change the material catalog without first resolving where supplier information belongs.

## 1. New-job flow

Keep the existing workflow selection as the first choice: Manufactured Home Production, Manufactured Home Service, General Contracting, or the existing Asphalt-specific path. Then present the existing job form in short, named steps. Only the relevant existing business-specific fields appear; conditional fields are not deleted.

```text
New job
Choose work type  →  Job details  →  Customer & location
                 →  Work & schedule  →  Subcontractors
                 →  Review & create

[Back]                                       [Continue]
```

### Step 1 — Choose work type

- Retain the current workflow/business selection and its descriptions.
- Keep Asphalt's existing business-specific entry path.
- When editing an existing job, retain the current business association and current edit behavior.

### Step 2 — Job details

- Job title, job type, scope/description, and notes.
- Keep all current type-specific options and inputs:
  - MH production builder/manufacturer, model, year, placement, construction type, and selected services.
  - MH service job types and existing billing workflow.
  - General Contracting job types.
  - Asphalt square footage and coats.
- Keep the mileage/fuel-estimate setting and its current explanation.
- Preserve the existing service catalog and add-on prompts.

### Step 3 — Customer and location

- Client/builder and optional customer property.
- Work-location name, street, city, and state.
- Keep current client/property filtering and lot-model address behavior.

### Step 4 — Work and schedule

- Existing start/end dates, status control, and man-hours calculator inputs.
- Keep the distinction between planned dates, expected duration, production presence, and recorded hours.
- Do not make scheduling mandatory when it is currently optional.

### Step 5 — Subcontractors

- Keep the existing multi-subcontractor picker and all compensation types: hourly, fixed, and allocation.
- Keep all current rate/amount/percentage inputs and allocation-total feedback.
- Preserve the existing remove-subcontractor choice to keep or remove recorded hours.
- Make the payment arrangement visible in the review step.

### Review and create

- Summarize all entered values, including business-specific values, crew/pay arrangements, dates, and mileage setting.
- Provide Back navigation to each step without clearing entered values.
- Keep the existing explicit create/save action. Do not introduce autosave into job creation.
- Show a clear save error and preserve the form contents if saving fails.
- Keep quotes, materials, service billing, and pricing in their existing connected workflows; do not silently add them as new required job-creation steps.

## 2. Existing job workspace

Keep the current tab labels and order:

```text
┌─────────────────────────────────────────────────────────────┐
│ ‹ Jobs     Howard · Cavco Owensboro       [status] [Edit job]│
│                 JOB       SCHEDULE       OVERVIEW            │
└─────────────────────────────────────────────────────────────┘
```

### Job tab — the working screen

Start with one clear **Next step** card:

```text
TODAY'S WORK
Ready to work / Work in progress / Done for today
[Start work today] or [Done for today]
Next scheduled work · current job dates
```

Then show the eight requested areas as section cards/anchors within this tab. Each section shows a short status summary and opens its existing panel or control. This is organization and navigation, not a replacement for the panels.

```text
JOB SECTIONS
1. Job Details          Client, property, work type, location       [Edit job]
2. Schedule             Date range, next planned work               [Open schedule]
3. Work & Checklist     Production progress, checklist blockers     [Open work]
4. Subcontractors       Assigned crew, owed / paid / unknown         [Manage and pay]
5. Materials            Existing lists and item totals               [Open materials]
6. Job Financials       Shared profit summary and availability      [Open financials]
7. Photos & Documents   Daily log, checklist photos, trip packet     [Open activity]
8. Closeout             Work, invoice, and sub-payment requirements  [Review closeout]
```

- **Job Details** opens the existing edit form; no fields are moved to a new data model.
- **Schedule** links to the existing Schedule tab and preserves job dates, planner, component/checklist planning, and presence as distinct concepts.
- **Work & Checklist** retains the existing checklist, phases, production components, component history, work sessions, and daily logs.
- **Subcontractors** presents the existing authoritative balance state and makes **Manage and pay** the prominent action. It opens the existing job-scoped payment workflow, retaining hours, advances, partial payments, payment review, and history.
- **Materials** opens the current job materials builder and keeps catalog, snapshots, markup, optional expense link, and invoice attachment behavior.
- **Job Financials** uses the existing server calculation and shows unavailable/unknown explicitly. It does not calculate profit in the browser or collapse estimates, invoices, expenses, and payments into one number.
- **Photos & Documents** opens the actual activity/photo area. The existing misrouted “Photos and notes” link must no longer open expense allocation. The separate expense-allocation action stays in the financial/expense context.
- **Closeout** displays the result of existing checks: incomplete required work, invoice state, and subcontractor balances that are unpaid, unknown, or unable to verify. It explains each blocker and links to the relevant existing area.

### Schedule tab — dates and actual work

Retain the existing Schedule tab and its capabilities:

- Planned job dates and calendar/planner access.
- Component expected duration and planned work dates.
- Checklist-item schedule dates and assigned subcontractor.
- Daily presence state, start/end workday actions, and history.
- Clear labels separating scheduled/expected days from actual confirmed workdays.
- Links back to the job and to scheduled work.

Calendar or presence changes remain operational; they do not change job financials.

### Overview tab — status and next action

Retain the current overview content, organized in this order:

1. Job status, business, client/property, location, and schedule.
2. Scope and type-specific summary.
3. One clear “What needs attention” area: outstanding work and payment state, using current authoritative responses.
4. Existing financial snapshot: revenue, expenses, labor, profit, and invoice action.
5. Notes, permit items, and links to the eight Job-tab sections.

The Overview should summarize and route; it should not become another place to edit financial inputs or duplicate calculations.

## 3. Closeout states and actions

Use plain language and distinguish **Finish Job** (normal completion) from **Close Job** (archive/close after the existing completion and payment requirements).

```text
CLOSEOUT CHECK
✓ Required work complete
! Invoice still unpaid
! Subcontractor balance unknown — review rate/hours
✓ No other existing closeout blocker

[Review the item]   [Close Job — unavailable until existing checks pass]
```

- Show only checks and blockers that the existing system actually returns; do not invent new required documents.
- Preserve all current blocking behavior for normal completion and closeout.
- Reopening an already-closed job keeps the approved incomplete-work exception only.
- Reopening never marks a subcontractor paid, writes/changes payment records, or completes unfinished production components.

## 4. Save and status feedback

- Job creation/editing remains explicitly saved using the existing save action.
- Materials remain explicitly saved; service billing retains its current automatic/explicit save behavior.
- Where a form has unsaved local edits, show a local “Unsaved changes” state and preserve those edits when navigating backward or switching steps.
- Do not imply that other panels autosave if they do not.
- For failed saves, keep entered values and show the server's useful error rather than a generic success or silent fallback.

## 5. Capabilities that remain separate

The following stay connected but are not merged into one simplified form or calculation:

- Job estimate/quote creation and quote acceptance/work authorization.
- Manufactured-home guide pricing and line items.
- Materials lists, catalog, optional expense synchronization, and invoice PDFs.
- Service billing worksheet and invoice actions.
- Actual expenses, expense allocations, mileage reimbursement, business trips, and trip documentation.
- Subcontractor assignment, hours, advances, authoritative payment records, and balance evaluation.
- Checklist records/photos, daily logs/photos, workday presence, and production work sessions.

## 6. Items to resolve during detailed design

1. **Photos and Notes navigation:** point the existing card to the actual daily-log/photo surface; retain expense allocation under financial/expense actions.
2. **Supplier information:** the inspected material catalog/list has no supplier field. Do not add one until the existing catalog architecture and any other supplier workflow are reviewed.
3. **Job-level direct payment:** decide how the existing payroll/payment panel is embedded or opened from the Subcontractors section without creating a duplicate ledger or confusing job context.
4. **Closeout wording:** use existing API/readiness responses to explain blockers; do not change which states block completion or closing.

## Approval gate

This is a proposed organization only. No application code has been changed. Implementation should begin only after the owner approves this layout and the four design details above are resolved.
