# BuildPro Architecture Changelog

This file records completed architectural changes — what changed and when. It is the "history" layer showing structural evolution over time.

**Rules for this file:**
- Only record changes after they are **implemented and verified**
- Do not add entries for planned or in-progress work
- This is a historical record, not a plan

For *why* decisions were made, see `DECISIONS.md`.  
For the current state of each system, see `SYSTEM_REGISTRY.md`.

---

## 2026-08-05

### Task #1757 → #1760 — Owner Pay Architecture (two-phase correction)

**Phase 1 (Task #1757):** Added a new `owner_distributions` table as a separate ledger for job-level owner pay withdrawals. This was later identified as creating a duplicate system alongside the existing `owner_capital_entries` ledger.

**Phase 2 (Task #1760):** Removed `owner_distributions` entirely. Extended `owner_capital_entries` with a nullable `job_id` column so job-linked payments can be stored in the existing ledger. The job Pay Breakdown tab now reads from `owner_capital_entries` filtered by `job_id`; the Accounting page continues to show all entries unfiltered.

- Dropped table: `owner_distributions`
- Dropped schema file: `lib/db/src/schema/owner-distributions.ts`
- Dropped migration: `0044_owner_distributions.sql` (superseded by 0045)
- Added column: `owner_capital_entries.job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL`
- Added migration: `lib/db/migrations/0045_owner_capital_job_id.sql` (includes backfill before DROP)
- Removed routes: GET/POST/DELETE `/api/jobs/:id/owner-distributions`
- Updated route: GET `/api/owner-capital` now accepts `?jobId=` filter; POST accepts `jobId` in body
- Updated UI: Job Pay Breakdown tab now reads from `/api/owner-capital?jobId=X`
- Reason: Rule 1 (Single Source of Truth), Rule 26 (No Parallel Systems), ADR-001

---

### Task #1761 — BuildPro Architecture Governance System

Created the four-document architecture governance system:
- `.agents/architecture/CONSTITUTION.md` — 27 rules + mandatory pre/post checklists
- `.agents/architecture/SYSTEM_REGISTRY.md` — inventory of all core systems (read-only except via review)
- `.agents/architecture/DECISIONS.md` — ADR log seeded with ADR-001 through ADR-005
- `.agents/architecture/CHANGELOG.md` — this file
- Updated `.agents/memory/MEMORY.md` — pointers to all four files
- Updated `replit.md` — mandatory Architecture Review Gate requirement

---

### Gas/Fuel expense audit-trail bug fix
- Root cause: `isTravelCategory()` in `Expenses.tsx` included `"fuel/travel"`, causing the form to auto-set `countsTowardJobProfit = false` whenever a Fuel/Travel expense was linked to a job (lines 3782, 3797). This silently routed all job-linked fuel expenses to the "Travel & Audit Docs" bucket instead of "Job Expenses."
- Fix: Removed `"fuel/travel"` from `TRAVEL_CATEGORIES_LC`. Fuel is a car & truck operating expense (Schedule C Line 9), not IRS trip documentation.
- Also added `"Fuel/Travel"` to `TRIP_RECEIPT_CATEGORIES` in `Jobs.tsx` so fuel receipts can be logged directly from the job card trip section.
- Added Rules 28–50, 10 Core Principles, 7 Engineering Priorities, and 3-tier rule classification to `CONSTITUTION.md`. Frozen as v1.0.
- Created `.agents/architecture/PATTERNS.md` with 6 proven implementation patterns: financial ledger, calculation engine, configurable business rule, extending a module, debugging workflow, schema migration.

---

### Task #1780 — RoutingEngine + VehicleEngine consolidation; Estimated Fuel Cost fix

**Audit findings (before):** 3 independent server-side OSRM implementations, each with its own geocoding block and in-memory cache:
1. `jobs.ts` profit route — `fuelRouteCache` + inline geocode/OSRM block
2. `geocode.ts` `/route-distance` — `routeDistanceCache` + inline geocode/OSRM block
3. `geocode.ts` `/business-distance` — `businessDistanceCache` + inline geocode/OSRM block

**After:** 1 RoutingEngine + 1 VehicleEngine. All 3 callers now delegate to RoutingEngine.

**Root cause fixed:** The profit route's independent OSRM pipeline was the reason `estimatedFuelCost` was always null — when it failed silently, the fuel cost card never rendered. Now all routing goes through the same engine that already powered the "X mi from shop" job card display, so the values are guaranteed to be consistent.

- Created: `artifacts/api-server/src/lib/routing-engine.ts` — `RoutingEngine.calculate({ origin, destination })` → `{ miles, durationMinutes, routeStatus, provider, cached }`
- Created: `artifacts/api-server/src/lib/vehicle-engine.ts` — `VehicleEngine.operatingCost({ onewayMiles, daysOnJob, vehicleProfile })` → `{ fuelGallons, fuelCost, totalMiles, roundTripMiles }`
- Updated: `jobs.ts` — removed `fuelRouteCache`, removed inline geocode/OSRM, calls VehicleEngine (which uses RoutingEngine); `fuelBreakdown` now includes `fuelGallons`
- Updated: `geocode.ts` — removed `routeDistanceCache`, removed `businessDistanceCache`, both endpoints now delegate to RoutingEngine
- Amended: Constitution v1.0 → v1.1 — added Rules 51–54 (One Service Per Domain, One Engine Many Workflows, One Engine Owns All Calculations, Engines Have One Responsibility)

---

### Owner pay ledger correction

- Job-linked owner pay now writes exclusively to `owner_capital_entries` as a
  negative withdrawal, and the Owner Pay report reads that ledger directly.
- Legacy owner-pay expense rows are linked into the canonical ledger and voided
  by migration `0053_migrate_owner_pay_expenses.sql`, preserving audit history
  without retaining an operating-expense effect.

*Add new entries here as architectural changes are completed and verified.*

## 2026-08-20

### Task #1965 — Core business ownership enforcement

- Added nullable canonical `business_id` ownership columns to clients, jobs, invoices, estimates, prospects, and assets.
- Backfilled rows whose legacy `business_line` matches a registered business; ambiguous/unassigned rows remain explicitly inventoried.
- Added scoped ID enforcement for clients, jobs, invoices, expenses, assets, and other-income, including asset receipt/business-use paths.
- Updated dashboard report business selection to accept canonical `businessId` while retaining legacy slug compatibility.

### Cash-basis revenue reconciliation

- Centralized invoice cash-receipt date attribution (Stripe → Square → manual issue-date fallback) in one reusable calculation helper used by dashboard, accounting, P&L, Schedule C, year-end, reserve, and export data paths.
- Schedule C now attributes paid invoices by effective payment date, excludes unassigned business-line rows from filtered business reports, and applies the same business-mileage/classification/subcontractor predicates to mileage totals and counts.

### Other-income revenue reconciliation

- Established `other_income` as the source of non-invoice cash receipts, with canonical `business_id` ownership and explicit `job_id` attribution.
- Linked other-income rows now participate once in per-job and batch operational revenue/profit; unmatched rows remain aggregate/tax revenue only.
- Square unmatched-payment deduplication now claims `square_payment_id` before invoice matching, preventing retry/concurrency duplicates.

### Financial correction history

- Added void metadata to financial source rows and a migration for expenses,
  invoices, other income, owner capital, mileage, and subcontractor reversals.
- Replaced posted financial DELETE behavior with explicit void/reversal actions;
  draft invoices remain hard-deletable.
- Updated report, tax, and job-profit reads to exclude voided source rows while
  preserving their ownership and job/client relationships.

### Mileage rate reconciliation

- Consolidated manual entries, imports, summaries, tax calculations, and
  reports onto one effective-date IRS mileage-rate engine.
- Reports now calculate deductions from raw trip date, miles, and
  classification instead of trusting stale stored snapshots.
- Added preview/confirm import recalculation endpoints that update snapshots
  only after explicit confirmation and preserve monthly aggregate expenses.

### Tax assumption configuration

- Centralized federal self-employment, Kentucky, occupational, meal, and
  reserve assumptions with tax-year-aware defaults and business overrides.
- Added settings controls and report metadata showing the assumptions used.
- Tax reports now roll DBA activity into the parent business tax owner.
- Existing meal snapshots remain historical; new meal records use the
  configured deductible percentage.

### Financial snapshot drift controls

- Invoice responses and report paths now recompute totals from line items and
  expose whether persisted totals match the source.
- MFH knowledge records retain historical profit snapshots but expose live
  invoice/expense-derived calculations and stale-field metadata.

### Job mileage reimbursement

- Added a job-card-only reimbursement record for route-based fuel estimates.
- Job costs and net profit include the reimbursement once, while percentage
  split calculations exclude it.
- MileIQ mileage, IRS deductions, company expenses, and owner-capital ledgers
  remain unchanged.

## 2026-08-23

### Invoice cent-precision reconciliation

- Centralized invoice line, subtotal, tax, and total rounding in the shared API calculation library.
- Editor previews, API saves and reads, invoice lists, print output, email output, and report serialization now use the same cent-based totals.
- Persisted line items remain the invoice source of truth; stored snapshots continue to expose drift status.

## 2026-08-24

### Bid ownership enforcement

- Removed the legacy sync behavior that assigned every null-owned bid to the asphalt business.
- Legacy null-owned bid rows are now retained and marked as quarantined for manual review.
- Scoped bid routes validate that the requested business exists; AI enrichment writes retain the business predicate used by their reads.
- Automated bid inserts use the existing `(notice_id, business_id)` uniqueness rule with conflict-safe inserts.
- The intentional owner-only unified feed excludes unowned rows and validates a requested scoring business.

### Bid service-area classification

- Added structured place-of-performance and service-area classification to the existing bid opportunity system.
- Synchronization now classifies local, regional, outside-area, and unknown opportunities without changing capability scoring or deleting historical records.
- The bid feed defaults to Local + Regional and exposes the classification reason on each card.

## 2026-08-27

### Mileage rate-period enforcement

- Mileage summaries, accounting reports, Schedule C, reserves, and subcontractor portal reports now derive deductions from raw trip date, miles, and classification through the shared effective-date engine.
- Split-rate periods return separate exact rate buckets; aggregate rate fields are null instead of exposing a weighted or blended IRS rate.
- Year-End, Profit & Loss, Mileage, portal, and export displays show the applicable rate periods separately while retaining the sum of independently calculated deductions.

## 2026-08-30

## 2026-09-03

### Invoice delivery-state reconciliation

- Invoice reads now reconcile stale `approved` compatibility fields from a verified Gmail invoice communication event that has a provider message ID.
- Reconciliation preserves the append-only communication timeline as delivery evidence, uses the event completion time for `sentAt`, and leaves pending or ambiguous attempts unresolved and blocked.
- Invoice list, detail, job-summary, and legacy send reads now agree on `sent` versus `approved`; no accounting ledger, revenue calculation, or report source changed.

### Owner-pay ledger enforcement

- New owner pay is recorded only in `owner_capital_entries`; operating-expense and Banking routes reject owner-pay categories.
- Historical owner-pay expenses are migrated idempotently, retain their source link, and are voided only after a matching active capital entry exists.
- Owner-capital reads exclude voided entries, validate business/job ownership, and require owner access.
- Dashboard owner withdrawals now use the canonical owner-capital API, while fixed subcontractor payments remain separate from allocation payouts.

### Owner Withdrawals naming standard

- Standardized normal user-facing owner-money workflows on “Owner Withdrawals.”
- New owner transactions create one canonical negative `owner_capital_entries` row and never an expense row.
- Removed contribution/capital creation controls and the duplicate equity-withdrawal dialog while preserving historical positive ledger records.
- Profit & Loss and year-end reports show withdrawals as an informational cash summary outside operating profit and tax deductions.

## 2026-08-30

### Jobs planning and readiness

- Added canonical job planning fields and the `job_readiness_conditions` audit-history table for internal, business-scoped blockers.
- Job list scoping now uses canonical `business_id`, using `business_line` only for null-owned legacy rows.
- Checklist progress now uses one fractional calculation across detailed, summary, public, and subcontractor views; production scope updates the applied checklist evidence in place.

## 2026-08-31

### Invoice communication history

- Added the append-only `invoice_communication_events` table and compatibility-safe backfill from legacy invoice send/reminder fields.
- Added pending/finalized communication APIs and provider/message metadata for server email, browser Gmail, reminders, payment-link emails, and payment receipts.
- Added the invoice detail communication timeline and compact sent/reminder summaries without changing accounting, payment, invoice lifecycle, Jobs, or Route Planner behavior.

## 2026-09-01

### Growth reserve waterfall alignment

- Job Financials, Job Payroll, and percentage-based subcontractor allocations now read the configured Growth Reserve percentage instead of using a hidden 5% constant.
- Standardized the job waterfall as revenue, job expenses, Growth Reserve, hourly/fixed subcontractor labor, split pool, owner share, then tax reserve.
- Growth Reserve is calculated from the amount remaining after split-eligible job expenses; job mileage reimbursement remains outside the percentage split pool.
- Legacy default display order is normalized to expenses, Growth Reserve, then subcontractor labor.

## 2026-09-02

### Invoice SENT and reminder eligibility

- SENT now represents a verified Gmail invoice delivery tied to the prepared communication event.
- Manual status changes, SMTP sends, and Square payment-link creation no longer set SENT or arm reminders.
- Automatic and manual reminders require an accepted Gmail invoice event with verified provider evidence.
- Existing communication events remain append-only; the production audit found one reminder that preceded its invoice send and no invoices currently marked sent without confirmed Gmail evidence.

### Active-job financial visibility

- The Jobs financial summary now excludes closed jobs defensively at both query and response boundaries.
- Job-linked Owner Withdrawals reduce remaining Owner Pay without changing earned pay.
- Unknown worker, subcontractor, or Owner Pay balances remain null and mark the response partial instead of appearing as zero.
- Unavailable balances now name the authoritative missing pay input beside each affected job summary, while valid zero balances remain numeric zero.

## 2026-09-03

### Bid deep-read evidence

- Deep-read AI output now carries sanitized evidence alongside each extracted requirement, including a source heading, short excerpt, and confirmed/ambiguous/missing status.
- Full Requirements preserves the extracted values and displays their supporting evidence inline, with explicit manual-verification messaging when the solicitation does not provide clear support.
- Evidence remains part of the existing `bid_opportunities.ai_summary` JSON; no new table, endpoint, or parallel source record was introduced.

### Checklist photo captions

- Extended the existing `job_checklist_item_photos` evidence rows with optional captions rather than creating a separate annotation system.
- Caption updates are scoped through the photo, checklist item, checklist, and job relationship.
- Checklist panels and exported PDFs now read the same stored caption alongside each item photo.

### Schedule C wage-advance reconciliation

- Schedule C now excludes expenses explicitly flagged as hourly wage advances,
  matching the existing P&L and Business Health treatment.
- Hourly accrual expenses remain deductible, while settled advances remain
  preserved in the expense history and are not counted a second time.
- No ledger, schema, API ownership, or source-of-truth changes were introduced.

### Actual worked-date fuel estimates

- Per-job fuel estimates now count the distinct union of Daily Log and
  subcontractor-hour dates.
- Scheduled start/end dates no longer imply that every calendar day was worked.
- When no actual work-date evidence exists, the Jobs UI shows the estimate as
  unavailable and directs the user to record the worked dates.

### Job allocation split-pool consistency

- The per-job profit response now exposes the server-calculated allocation split
  pool used by the compact outstanding-payments route; the batch profit summary
  now exposes the same pool to job cards.
- Job Financials, the subcontractor-hours payment view, and close-job fallback
  calculations prefer that same live pool, preventing status refreshes from
  showing different percentage-pay amounts.
- Shared pool revenue includes job-linked other income, and the compact fuel
  estimate uses the union of actual Daily Log and subcontractor-hour work dates
  instead of assuming one day.
- Job-only fuel estimates remain outside the accounting ledgers, but when shown
  in Job Costs they now reduce the percentage split pool. Remaining and Split
  Pool therefore use the same finalized server waterfall (ADR-017).

### Owner gas reimbursement after take-home

- Automatic fuel estimates now qualify for the existing owner reimbursement
  presentation when no editable reimbursement has been saved.
- Job Financials shows the post-tax `Recommended Take Home`, then `Gas Cost
  Reimbursement`, then a combined `Total to You`.
- The reimbursement remains outside expenses, mileage, payroll, and owner
  withdrawal ledgers; saved recipient, amount, and paid status still take
  precedence over the automatic estimate.

## 2026-09-04

### Dashboard WTD period correction

- Corrected the dashboard `WTD` period from a trailing seven-day window to the
  current Monday-start calendar week.
- Kept all existing cash-basis revenue, expense, subcontractor-pay, and
  outstanding-invoice calculations unchanged.
- Added regression coverage for month-boundary and Sunday/Monday week starts.

### Dashboard invoice revenue attribution

- Dashboard revenue and its six-month trend now attribute paid invoices to the
  verified invoice-send timestamp, with invoice issue date as the explicit
  fallback for historical records without verified delivery timestamps.
- Payment status still controls recognition: unpaid sent and overdue invoices
  remain outstanding rather than becoming dashboard revenue.
- Cash-basis accounting, tax, P&L, reserve, Year-End, and payment-history
  calculations continue to use payment dates.


### Business-specific invoice logo layout

- Each business can now save one invoice-header logo position and proportional
  size directly from the editable invoice.
- Legacy shared logo alignment and size remain the compatibility fallback until
  a business saves its own layout.
- Browser previews, printing, Gmail, server email, reminders, and invoice
  attachments consume the same resolved business layout.
- The duplicate Invoice Logo Placement card was removed from Settings; logo
  upload and replacement remain unchanged.
### Yearly monthly-revenue overview

- Added a 12-month Accounting report that reuses Dashboard invoice-revenue
  attribution rather than creating a competing revenue calculation.
- Each month separates paid-invoice revenue from receipt-dated other income and
  exposes the annual total and monthly average without storing derived values.
- Profit & Loss, tax, reserve, Year-End, and payment-history reports remain on
  their existing cash-basis payment-date treatment.

## 2026-09-05

### Gmail invoice delivery verification recovery

- Gmail message IDs may be retained on pending communication events after
  provider acceptance, but they remain repair candidates rather than proof.
- Only server-verified Gmail evidence receives the durable verification marker
  required to reconcile an Approved invoice to Sent.
- Finalization retries brief Gmail Sent-folder delays, preserves strict
  recipient, subject, correlation-header, and Sent-label checks, and keeps
  duplicate sends blocked while repair is pending.
- Google authorization now requests Gmail metadata access in addition to send
  access. Pending events that lost their provider message ID can search a
  bounded Sent-folder window and recover only an exact delivery-header match;
  the recovery never sends another email.
- The invoice editor now refreshes communication history after delayed
  verification and exposes a clearly labeled mobile Send Invoice action.
- A guarded ownership repair assigns the user-confirmed Wil-1047 invoice and
  Wil-1049 job/invoice records to General Contracting so business-scoped invoice
  lists and job financial summaries use the canonical owner.

### Corrected MileIQ export deduplication

- New MileIQ trips retain their exported start/end timestamp identity, allowing
  corrected re-exports to add only drives that were not previously imported.
- Active imported trips are protected by a business- and provider-scoped unique
  database index, including simultaneous or repeated-file submissions.
- Existing trip rows, exact-file detection, rollback history, effective-date
  deductions, and monthly consolidated mileage expenses remain unchanged.


### Atomic mileage imports

- Mileage import batches, conflict-safe trip inserts, monthly aggregate expenses,
  and finalized batch counters now commit in one database transaction.
- A failure during aggregate expense creation rolls back the batch and its trips
  instead of leaving mileage and accounting records out of sync.
- Corrected-export deduplication, rollback history, and effective-date deduction
  behavior remain unchanged.
### Canonical job and invoice mutation ownership

- Job and invoice mutations now resolve a canonical business id and slug through
  the business registry, defaulting absent ownership selection to the permanent
  General Contracting parent.
- Job-linked invoices inherit canonical job ownership and reject conflicting
  explicit business selection; production-pricing invoices follow the same
  rule, and estimate-to-job conversion preserves a known DBA owner.
- Conflicting explicit business ID/slug pairs are rejected rather than allowing
  one selector to silently override the other.
- A job's business cannot be reassigned while invoices are linked, preventing
  the job and its financial documents from splitting across owners.
- The guarded ownership migration audit is dry-run-first and only repairs
  deterministic General Contracting legacy records, leaving other-business and
  ambiguous records untouched.
