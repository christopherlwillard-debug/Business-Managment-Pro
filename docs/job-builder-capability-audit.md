# BuildPro Job Builder and Job Workspace Capability Audit

## Purpose and boundary

This is a source-code audit of the existing Job Builder and job workspace, prepared before proposing a redesign. It records current capabilities, persistence, and connected workflows so a later experience redesign can reorganize access without removing functionality or changing business rules.

No application code, database records, or production data were changed or queried for this audit. The central job record remains the source of truth linking clients/properties, invoices, expenses, mileage, payroll, materials, owner pay, scheduling, and job activity.

## 1. Creating and editing a job

### Entry paths and workflow choices

- The Jobs page supports creating and editing jobs; job cards also expose edit and delete actions according to permissions.
- New-job creation first asks for a workflow when applicable: Manufactured Home Production, Manufactured Home Service, or General Contracting. Asphalt sealing follows its business-specific path.
- Editing an existing job uses the same broad form, with the owning business association displayed rather than freely reassigned.
- Jobs may also be created by converting an estimate. Estimate conversion checks the estimate's accepted revision and recorded work authorization before creating a scheduled job; a changed accepted revision blocks conversion.

### Shared job fields

- Owning business; required for a new job.
- Job title; required.
- Client/builder; optional and business-scoped.
- Customer property; optional, selected from the client's properties. For lot-model manufactured-home placement, the address can be populated from the client/property context.
- Work-location name and address fields (street, city, state).
- Job type and scope/description, including job notes.
- Start and end dates, and job status.
- Include mileage/fuel estimate in job costs; this affects route-based estimates and saved mileage reimbursement treatment, not actual travel/fuel expenses or invoice mileage.
- Man-hours calculator: worker count, days, hours per day, and a manual total.
- Assigned subcontractors and compensation arrangement for each: hourly (including rate), fixed amount, or allocation percentage. Allocation totals are surfaced. Removing an assigned subcontractor offers a choice to keep or remove recorded hours.

The job record stores identity, business/client/property links, status, type, address/location, dates, notes, workflow, man-hours, and the business-specific values described below. Updates use the jobs API; subcontractor assignments/compensation also use the job-subcontractor and payment configuration endpoints.

### Business-specific fields and workflows

- **Asphalt sealing:** square footage and number of coats.
- **Manufactured Home Production:** builder/manufacturer, model, model year, Field vs. Lot Model placement, construction type (VOG, Hybrid, Drywall), and selected services. The service catalog supports adding/editing services, configuring applicability and add-on prompts, and retaining inactive/archived entries for existing records. Home models/builders support suggestions and managed records.
- **Manufactured Home Service:** warranty/service/callback/inspection/dealer punch-list job types and a service-billing worksheet.
- **Legacy manufactured-home jobs:** existing trim-out, plumbing hookup, marriage-line, flooring, underpinning, complete-finish, and warranty-completion types remain represented.
- **General Contracting:** job types include kitchen, bath, deck, siding, roofing, window/door, addition, repair, and other. The separate GC Estimate Wizard carries the richer estimate workflow.

### Manufactured-home pricing and production setup

- The Manufactured Home panel selects builder, model, and year; shows model/construction/benchmark context and baseline pricing; supports quoted-price overrides, reset, and guide selection.
- Applying or refreshing model/guide pricing updates manufactured-home estimate line items and can update the associated checklist. Reset confirms before replacing manufactured-home line items and preserves custom line items.
- Selected production services create versioned job production-component snapshots. Components retain source-service context, status, duration/labor/crew context, and other captured context; historical snapshots are superseded, not overwritten.
- Production components are operational planning context, not inputs to financial, payroll, mileage, or invoice calculations.

### Manufactured-home service billing worksheet

- Billing profile, one/two technicians, repair hours, drive hours, mileage, and profile-seeded/editable rate snapshots (repair and drive rates for one/two technicians plus mileage rate).
- Service vs. contracted work type; parts/material rows have description, quantity, unit cost, and reimbursable flag.
- Internal labor rate and fuel estimate are available in the internal section.
- The worksheet computes billing and internal-cost views, saves to the job's service-billing data, and connects to invoice create/edit/view actions. It has automatic save behavior plus an explicit save action.

## 2. Job workspace and navigation

The job workspace currently has three tabs: **Job**, **Schedule**, and **Overview**. It is opened from job cards and has an Edit Job action. The page also groups jobs into Scheduled, Awaiting Payment, Paid, and Closed Jobs; it supports search, sorting, planner/calendar access, and closed-job export.

### Job tab

- Today's work state, with Start Work Today / Done for Today actions.
- Job date range and actual production-day summary.
- Payment summary that can direct users to worker, subcontractor, or owner-pay details.
- Manufactured Home Service billing worksheet and invoice action where relevant.
- Production work breakdown, component status and expected duration edits, and snapshot history.
- Open Financial Details, View Invoice, Finish Job, and Close Job actions subject to status, permissions, invoice, and subcontractor balance checks.

### Schedule tab

- Expected days (manual job override or longest applicable component), actual production days, actual start, and last work date.
- Recorded workday history, including Here / Not Here / Unrecorded, reason, and start/end timestamps.
- Presence controls for recording daily work state. Start/end workday actions update operational presence and refresh related job data.
- Calendar/planner scheduling, date changes, and schedule visibility are separate from workday presence. Expected duration and checklist item scheduling feed planning; presence timestamps are not payroll hours.

### Overview tab

- At-a-glance status/business, client/builder, property, job location, schedule, crew, and today's work.
- Scope description, production progress, checklist progress and next scheduled checklist item.
- Job revenue, expenses, labor, profit, and invoice status/action.
- Job notes/issues and permit checklist attention.
- Links to production components, materials, workers/subcontractors, checklist, business trips, photos/notes, and other job details.

Audit observation: the Overview card labeled “Photos and notes” currently opens the job-expense allocation dialog, while the actual photo/log surfaces are the Daily Log and Checklist panels. This mapping should be explicitly reconciled during design; no behavior was changed.

## 3. Work, checklists, and history

### Production components and work sessions

- Component states are Planned, In Progress, Paused, Completed, and Not Applicable; expected duration can be changed.
- Component snapshot history shows current/superseded versions, captured date, source services, and changes from a prior snapshot.
- Component work sessions record date, worker type/identity (assigned subcontractor or named outside worker), actual hours, and notes. Sessions can be corrected and remain tied to the exact component snapshot. They are not payroll or expense entries.

### Phases

- Project phases can be generated from the GC Estimate Wizard, saved onto a job, and checked off in the Project Phases panel.
- The panel shows completion count and percentage. The job stores phase names and completed states.

### Job checklist

- Attach an existing checklist template to a job; templates have sections and items.
- Activate/deactivate sections, complete a section, complete/skip individual items, and split checklist items into independently completable parts that can be renamed or removed.
- Add item notes, section notes, start notes, and finished-work notes.
- Schedule individual checklist items and assign them to an assigned subcontractor.
- Upload/delete/caption photos on items; upload/delete start-of-job and finished-work photos.
- Track checklist status changes and edit/delete status history entries.
- Enable/disable the public checklist link, copy its URL, download a PDF, or email the PDF.
- Checklist summaries and ready-to-start/readiness services feed job cards and planning.

Checklist data is stored in the applied job-checklist, section, item, part, photo, note, and status-log tables. The original template remains separate from the job's applied checklist.

### Daily logs and job activity

- Daily Log entries include date, work completed, additional notes/issues, linked material list, and one or more uploaded photos.
- History is date-sorted, displays author when available, and supports deleting entries with the appropriate permission.
- Daily logs have their own data records and photo URLs; they are distinct from checklist photos and workday-presence records.

## 4. Subcontractors and payroll

### Assignment and earned balances

- A job can have multiple subcontractors, each with hourly, fixed, or percentage-allocation compensation.
- Hourly records support work and travel hours/rates, date, type, description, and rate snapshot. Hour entries can be corrected.
- Draft payroll data supports accrued bonus/note, advancement, and payment method/reference without recording a payment.
- Advances can be recorded and applied to payment; overpayment correction context is surfaced where relevant.

### Payment and history

- The job's financial panel exposes subcontractor payments, amounts owed/paid/remaining, and payment history.
- The dedicated Job Payroll route supports per-sub pay management, hours logging, bonuses, advances, partial payments, payment date/notes/method/reference, a review-before-recording step, and payment history.
- Payment entries support deletion/reversal workflows with recalculated balances. Idempotency keys prevent duplicate payment submission.
- `sub_payment_records` is the authoritative payment ledger; the shared balance evaluator determines owed/paid/remaining and unknown balances. Job assignment/rate data and hours/advances contribute according to the existing compensation type.
- Closing or completing a job remains blocked for unpaid or unknown subcontractor balances. Reopening a previously closed job is the approved exception to incomplete production-work checks; it does not mark a subcontractor paid, modify payment records, or complete unfinished work.

Relevant records are held across `job_subcontractors`, `job_sub_hours`, `sub_advances`, and `sub_payment_records`. The UI must not introduce a parallel payment ledger or replace the shared evaluator.

## 5. Materials and pricing

### Job materials builder

- Create multiple job-linked material lists; search and add catalog materials; increase quantities; remove lines; set markup; review item and list totals; edit or delete a list.
- Each list item retains a material link when available plus name, unit, and unit-cost snapshots, quantity, and optional expense synchronization metadata.
- Creating, editing, or deleting a list regenerates/attaches an itemized materials PDF to the draft invoice.
- A daily log can reference a job material list.
- Material items can optionally create and synchronize an auto-managed job expense; that expense is protected from edits/deletion by the automatic material-list logic unless it is still identified as auto-managed.
- Existing invoice assignment/history behavior for material lists is separate and must be preserved.

### Catalog and supplier audit finding

The catalog supports material name, description, unit, unit cost, category, and active/inactive status. The inspected job-level material list and catalog schema do not expose a supplier field. Supplier information may exist in a separate workflow; this must be confirmed before design because the requested preservation list specifically includes suppliers. The list schema itself stores list name, job/invoice links, markup, item snapshots, and optional expense links.

### Estimates and pricing

- The job's Quotes panel lists multiple estimates by trade/scope, status (draft/sent/won/lost), line-item previews, and total; estimates can be built, edited, deleted, and loaded into an invoice.
- Estimate records retain client/property/job/business links, title, job type, address, status, subtotal, markup, contingency, total, notes/customer notes, expiry, line items, calculation snapshot, payment-link fields, and manufactured-home pricing context.
- The GC Estimate Wizard has six steps: optional property analysis/address lookup; job-type scope questions; trade breakdown with low/mid/high or custom cost and editable quantity/description; project phases; permit/code intelligence and city/town; review/create with title, markup, contingency, notes/scope language, and optional saving of phases to the job.
- The GC Wizard's permit/code content is advisory and tells the user to confirm local requirements.
- Manufactured-home pricing, GC estimates, invoice line items, and material lists are related but distinct workflows; the redesign must preserve the existing connections rather than combine their underlying calculations.

## 6. Job financials

- The Job Financials panel has Profit Split and Sub Hours views.
- Profit detail comes from the shared server-side job-profit calculation; the UI displays gross invoiced revenue, expenses/job costs, net business profit, included/excluded cost breakdown, and operational profit where available.
- The panel supports the collected-revenue toggle, growth reserve, owner split, tax reserve, and breakdown of income, expenses, hourly labor, split pool, subcontractor share, owner share, reserve, tax, and recommended take-home.
- Subcontractor earnings, payments, remaining balances, hourly/travel breakdown, and payment history are linked to the authoritative sub-payment ledger and balance evaluator.
- The panel includes owner withdrawals tied to the owner-capital ledger; recorded entries can be viewed/removed through the existing workflow.
- Mileage reimbursement supports amount, recipient type/name/subcontractor, notes, and owed/paid status. It is a separate recorded reimbursement and follows existing job-profit inclusion rules.
- Job expense drill-down, expense allocations, actual fuel expenses, estimated fuel, reimbursement and trip documentation are available in the financial/trip surfaces. Allocations distribute an existing expense; they do not create a second accounting transaction.
- Expense details can show informational or excluded entries; preserving their distinction from included job costs is required.
- Financial values can be unavailable when source inputs are unknown; the UI has explicit loading/error/unavailable states and must not display an invented zero.

The shared profit engine is the only source for job-profit arithmetic across individual/batch views and dependent reports. No new formula or client-side duplicate calculation is part of this audit.

## 7. Photos, documents, invoices, and trips

- Checklist: item/start/finished photos, captions, public share link, PDF download/email, notes, and status history.
- Daily Log: dated activity, attached material list, and job photos.
- Invoice: draft/edit/view, line items and attachments, payment links, sent/accepted/paid/void lifecycle, and invoice status actions from the job.
- Estimates: quote records, PDFs, status, customer notes, expiration, and line items.
- Materials: itemized materials PDF attachment to draft invoice.
- Trips: job-linked business trips and mileage documentation, with a Trip Documentation Packet available from the financial/trip workflow.
- Expenses: receipts and job allocation details remain in the existing expense ledger.

These are multiple records and document surfaces, not one interchangeable “job photos” collection.

## 8. Scheduling, completion, closeout, and reopening

### Scheduling

- Job start/end dates appear on job cards, the workspace, and planner/calendar.
- Checklist items can have their own date and assigned subcontractor.
- Production components can have expected durations and planned dates; readiness/planning state and resource demand are separate from job status.
- Daily presence records Here / Not Here / Unrecorded, reason, workday start/end, provenance, and notes. Only confirmed Here dates count for the existing estimated fuel-day calculation; schedule dates, logs, and hours are not substitutes.
- Calendar and presence operations are operational only; they do not change job financials.

### Completion and closeout

- Normal completion retains existing incomplete-work checks, with the existing explicit confirmation path where applicable.
- Closing a completed job requires the invoice to be paid in the card flow and verified subcontractor balances to be settled; unpaid, unknown, or unavailable-to-verify balances block closure.
- Readiness and checklist state are existing closeout inputs. The workspace should surface blockers without substituting or weakening their underlying checks.
- Closed Jobs has its own archive/list, financial summaries, search/sort, and export controls.

### Reopening

- Reopening an already closed job follows the previously approved exception: it may reopen despite incomplete production work remaining.
- This exception does not apply to normal job completion and does not bypass the unpaid/unknown subcontractor balance safeguards for closing/completing.
- Reopening must not write payment records, mark subcontractors paid, or auto-complete unfinished production components.

## 9. Persistence and dependencies inventory

| Capability | Existing authoritative records / service | Important dependency |
|---|---|---|
| Job identity, ownership, type, dates, notes | `jobs` | Central link for invoices, expenses, property, payroll, materials, owner pay, and planning |
| Client and property | `clients`, `properties`, business access | Property link does not replace job address or alter calculations |
| Subcontractor assignments and rates | `job_subcontractors` | Compensation type determines the evaluator's source inputs |
| Hours, advances, payments | `job_sub_hours`, `sub_advances`, `sub_payment_records` | Shared balance evaluator; payment ledger is authoritative and idempotent |
| Job profit and cost breakdown | Shared job-profit engine and linked source records | Same calculation powers job and batch/report views |
| Estimates/GC quotes | `estimates` and quote revision/decision records | Conversion depends on current accepted revision and work authorization |
| Invoices/payments | `invoices` and invoice communication/payment records | Invoice status feeds completion/closeout actions |
| Materials | `materials`, `material_lists`, `material_list_items` | Optional synchronized auto-expense and invoice PDF/assignment history |
| Expenses and allocations | `expenses`, `job_expense_allocations` | Original expense remains sole ledger row for a split allocation |
| Checklist and photos | applied checklist, item/section/part/photo/status tables | Template is separate; public status link and PDF/email depend on applied checklist |
| Daily log | `daily_logs` | Separate from checklist, payroll, and presence |
| Production components/sessions | `job_production_components`, `job_component_work_sessions` | Versioned context; not financial or payroll entries |
| Schedule/presence/readiness | `job_daily_presence`, planning fields, `job_readiness_conditions` | Dates, readiness, workday presence, and job status remain distinct |
| Owner withdrawals | `owner_capital_entries` | One owner-money ledger shared with Accounting |

## 10. Design constraints carried forward

1. Preserve every existing field, workflow, record, calculation, and status path; reorganize access only.
2. Keep manufactured-home production, manufactured-home service, general contracting, and asphalt-specific behavior intact.
3. Keep subcontractor assignment, hours, advances, partial payments, payment history, and unknown-balance detection on existing records and shared evaluator.
4. Keep materials catalog/list/markup/expense/invoice relationships intact; confirm the supplier-field location before redesigning that section.
5. Keep financial displays tied to the authoritative calculation and preserve unavailable/unknown states.
6. Keep normal completion and closeout safeguards; preserve only the already-approved reopening exception.
7. Keep job schedule dates, checklist dates, planning, and presence as distinct concepts.
8. Clarify the existing “Photos and notes” navigation target before deciding how that section should be reached.

This audit records the current system only. It does not yet propose a layout or authorize code changes.
