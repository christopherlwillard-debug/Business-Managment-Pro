# BuildPro Architecture Changelog

This file records completed architectural changes — what changed and when. It is the "history" layer showing structural evolution over time.

**Rules for this file:**
- Only record changes after they are **implemented and verified**
- Do not add entries for planned or in-progress work
- This is a historical record, not a plan

For *why* decisions were made, see `DECISIONS.md`.  
For the current state of each system, see `SYSTEM_REGISTRY.md`.

---

## 2026-09-29

### Use confirmed Here dates as the sole source of estimated gas days

- Job Financials and batch profit summaries now estimate fuel using only distinct dates explicitly confirmed as Here. Scheduled duration and Expected Days remain separate.
- When no confirmed Here dates exist, the route estimate is unavailable. Daily Logs, Sub Hours, component sessions, inferred presence, and scheduled dates are not fallback fuel days.
- Kept route distance and fuel arithmetic in RoutingEngine and VehicleEngine; no actual expense, mileage, reimbursement, payroll, or ledger record is created or changed.
- Verified with the full API suite, focused fuel regressions, API/frontend typechecks, and the profit-client guard. The separate job-profit contract guard still reports unrelated generated production-component schema drift.

---

## 2026-09-25

### Confirmed daily presence as fuel workday evidence

- Job Financials and batch profit summaries count confirmed Here dates together with Daily Logs, Sub Hours, and component work sessions, deduplicating dates before estimating fuel through the existing route and vehicle engines.
- Unrecorded, Not Here, and inferred presence do not contribute; start/end timestamps remain operational state, not time tracking.
- No ledger, accounting report, mileage, reimbursement, or payroll records are created from presence. Focused workday and profit-route regression tests and API/frontend typechecks passed.

---

## 2026-09-19

### Banking file-as-expense authentication and concurrency repair

- Kept owner-only authorization while making stale-session recovery explicit:
  Banking preserves the pending expense draft, checks authentication without
  cache, and returns through login without automatically replaying a financial
  write.
- Serialized file-as-expense writes by locking the bank transaction inside the
  existing database transaction before inserting the canonical expense and
  marking the bank row matched.
- Added non-sensitive session-state diagnostics plus focused coverage for
  cookie-backed authentication, authorization, validation, business isolation,
  exact bank values, conflicts, draft restoration, and no automatic replay.
- Preserved `expenses` as the accounting source of truth and `bank_transactions`
  as the reconciliation source; no calculation, report, or ledger was added.

---

## 2026-09-17

### Simplified one-tap daily work state

- Extended the existing `job_daily_presence` source with operational
  start/finish timestamps and a `workday_action` provenance source.
- Added atomic, idempotent start-work-today and done-for-today actions that
  mark the job Active and Here without creating hours, payroll, expenses,
  payments, profit, or component-status changes.
- Simplified the normal Jobs card workflow to START WORK TODAY, DONE FOR TODAY,
  and the existing financial FINISH JOB closeout; component detail is labeled
  WORK BREAKDOWN and uses the job's assigned business context.
- Preserved the existing date-by-date presence editor as optional detail/history.
- Verified the development schema, API/frontend typechecks, production-presence
  regression suite, and schema/API contract inventory.

---

## 2026-09-11

### Production Intelligence Phase 4: job-specific production components

- Added the versioned `job_production_components` snapshot table while preserving
  `jobs.mh_production_services` as the backward-compatible selection source.
- Added one centralized classifier for Interior Finish (VOG/Hybrid/Drywall),
  Siding, Plumbing, Skirting, and Custom; Service and travel-surcharge rows
  remain outside production components.
- Added business-scoped Jobs API reads, snapshot sync, and independent component
  status updates. Snapshots retain expected values and checklist, materials,
  pricing, and Knowledge Center context without entering financial, payroll,
  mileage, invoice, profit, presence, or benchmark calculations.
- Added compact responsive component/status controls to the Jobs UI and focused
  classifier regression coverage. Development schema and typechecks were
  verified; existing jobs were not bulk-backfilled.
- Snapshot synchronization now serializes per job inside the existing transaction
  before reading versions, preventing concurrent writers from producing conflicting
  current rows. Focused concurrent API coverage verifies deterministic versioning.

### Production Intelligence Phase 4.1: ready-to-start scheduling

- Added a separate Ready to Start queue for jobs without a definite start date,
  including production-component summaries and active dependency details.
- Starting a job is limited to writing its requested `startDate` and scheduled
  `planningState`; it does not create presence, clear blockers, reschedule
  checklists, or touch financial, payroll, expense, mileage, invoice, profit, or
  learning data.
- Waiting and actively blocked jobs remain ineligible for starting. Queue order is
  deterministic and server-owned: explicit `queuePosition`, then `createdAt`,
  then `id`, with ranks preserved across ready and waiting groups.
- Added authenticated API, UI, focused API coverage, and browser verification for
  Today and specific-date starts and the scheduling-only write boundary.

### Production Intelligence Phase 5: component work sessions

- Added the Jobs-owned `job_component_work_sessions` operational evidence table,
  including exact component-snapshot references, work dates, worker identity,
  decimal actual hours, optional notes, and database hour bounds.
- Added business-scoped list, create, and correction endpoints. New rows require
  a current applicable component; historical/superseded snapshots remain readable
  for corrections, while closed jobs reject writes.
- Added assigned-subcontractor and outside-worker entry modes plus exact-hour
  totals, history, correction UI, and explicit loading/error/closed-job states
  beneath the existing Jobs production-component section.
- Kept work-session writes separate from payroll, expenses, profit, invoices,
  mileage, checklists, presence, and Knowledge Center learning. Shared job-row
  locking serializes work-session and component-snapshot mutations.
- Added focused API coverage for multiple same-day workers/components, exact
  totals, worker-link corrections, business isolation, decimal validation, and
  closed-job protection. Development schema, full API tests, app build, and
  browser release verifiers were verified.

### Production Intelligence Phase 6: component production-day learning

- Extended the existing read-only Knowledge Center observation engine with
  component-level expected-versus-actual production-day observations sourced
  from exact versioned component snapshots and Phase 5 work-session dates.
- Kept whole-job confirmed presence, calendar span, pauses, and unrecorded gaps
  separate; jobs without component sessions remain job-level evidence only.
- Normalized one observation per job and stable component learning key,
  deduplicated same-day sessions, excluded explicit pause conflicts, and kept
  snapshot/version evidence and exclusion reasons traceable.
- Captured immutable named Custom-profile context in new component snapshots;
  historical snapshots without that context remain ineligible rather than
  being reinterpreted.
- Added Knowledge Center component cards and evidence expansion without
  creating benchmark writes, labor-hour learning, forecasts, or financial,
  payroll, invoice, expense, mileage, checklist, or presence side effects.
- Verified focused and full API tests, development schema, typechecks,
  contractor-app tests/build, closed-job release check, profit contracts, and
  active workflow startup.

### Production Intelligence Phase 7A: reviewed component production-day baselines

- Added a dedicated business-scoped append-only component baseline review ledger
  with pending, approved, rejected, and superseded proposal history.
- Kept Phase 6’s three-job observation threshold for visibility while requiring
  five distinct eligible jobs for a persisted proposal.
- Captured deterministic source-evidence fingerprints with job, presence,
  immutable snapshot/version, and work-session references. Approval re-computes
  the existing Phase 6 observation, rejects stale evidence or active baselines,
  and transactionally supersedes the prior approved revision.
- Added business-scoped Knowledge Center controls for proposal, approval,
  rejection, current approved values, history, and evidence references without
  touching labor hours, financials, payroll, pricing, scheduling, or checklists.

## 2026-09-10

### Production Intelligence Phase 2: persistent daily presence

- Added the Jobs-owned `job_daily_presence` raw fact table with one unique
  job/date row, the approved three-state presence model, optional not-here
  reason/notes, and source/provenance fields.
- Added authenticated, business-scoped presence reads and idempotent daily
  writes. Timing is calculated live for actual start, last work date, calendar
  span, actual production days, explicit pause days, and expected-duration
  variance.
- Added compact daily presence controls to Schedule History. Here days count as
  production days; unrecorded days remain distinct from not-here days; no
  hours, payroll, expenses, mileage, invoices, payments, or profit rows are
  created.
- Kept Active Schedule, checklist scheduling, daily logs, labor hours,
  financial behavior, and Knowledge Center learning unchanged.

### Production Intelligence Phase 3: reviewed production baselines

- Added `job_type_benchmark_revisions` as append-only review history while
  keeping `job_type_benchmarks.estimated_hours` as the active source of truth.
- Added all-business-only review creation, pending review listing, approval,
  rejection, duplicate-pending protection, and stale benchmark conflict handling.
- Approval updates the existing benchmark transactionally and records the prior
  value, observed production-day summary, source job IDs, reviewer, and decision
  timestamps; rejection leaves the active benchmark unchanged.
- Added Knowledge Center controls for explicit benchmark-hour entry, pending
  approval/rejection, and review history. No automatic days-to-hours conversion
  or business-scoped global benchmark mutation is allowed.

### Production Intelligence Phase 2 follow-up: Active Schedule entry point

- Reused the existing `JobPresencePanel` and business-scoped production-presence
  API from Active Schedule job cards, loading a job's snapshot only when the
  user opens the compact Presence control.
- Checklist entries remain separate and do not render duplicate presence
  controls; presence writes remain limited to `job_daily_presence` and do not
  affect checklist scheduling, labor, payroll, or financial behavior.
- The authenticated browser regression now covers both Active Schedule and
  Schedule History presence entry points.

### Production Intelligence Phase 1: read-only schedule history

- Added a separate, business-scoped schedule-history read route using existing
  terminal job dates and checklist scheduled dates.
- Added a separate Schedule History view with selectable past date ranges.
- Active Schedule remains on its existing current/future route and filtering;
  no presence records, production-day records, component snapshots, work
  sessions, learning, or financial behavior was added.

### Production Intelligence Phase 0 contract

- Established the pure contract for Willard's production vocabulary: Interior
  Finish with VOG/Hybrid/Drywall variants, Siding, Plumbing, Skirting, and
  Custom.
- Explicitly excluded Finish Carpentry, top-level Drywall, Electrical, HVAC,
  Inspection, and Cleanup; reserved Service as a separate future work type
  outside production learning.
- Defined daily presence states, optional not-here reasons, source versus
  provenance, module ownership, Active Schedule versus Schedule History, and
  learning eligibility without changing runtime behavior, schema, routes, UI,
  or financial systems.

### Target-schema guard covers subcontractor payments

- The existing read-only release schema contract now verifies every column used
  by the pay-worker transaction before application code is promoted.
- Migration 0069 ownership columns are also verified as nullable integer foreign
  keys to `businesses.id` with `ON DELETE SET NULL`.
- Failures name the blocked pay-worker route and point a missing payroll
  `business_id` to the canonical migration; no payment, DDL, or data write occurs.

### Canonical split pool includes agreed fixed-worker obligations

- Individual Job Financials now consumes the same canonical allocation pool as
  Job Payroll, outstanding subcontractor balances, and close-job flows.
- The allocation engine deducts unpaid fixed-worker obligations from the pool
  using the agreed assignment amount, while retaining posted fixed payments
  only as a compatibility fallback when no agreed amount exists.
- Growth Reserve remains calculated before non-allocation worker obligations;
  no payroll ledger, payment mechanics, P&L structure, or persisted financial
  records changed.
- Focused API and frontend financial regressions, route tests, source
  typechecks, and job-profit contract guards pass.

### Server-backed invoice delivery repair

- The authenticated Contractor Management App now repairs unresolved invoice
  delivery history through the existing server-side read-only Gmail connection.
- Recovery performs a bounded Sent search and requires one exact delivery-header,
  recipient, subject, label, and time-window match before finalizing the existing
  communication event.
- Repair no longer depends on browser localStorage, Developer Tools, the public
  Website Studio site, or another Google reconnect; no send path or new event is
  introduced.
- Focused API and frontend tests, API typecheck, and Contractor App source
  typecheck pass.

### Gmail acceptance finalizes invoice delivery

- Browser Gmail acceptance plus its returned message ID now finalizes the same
  prepared communication event and updates the invoice Sent compatibility fields.
- A secondary Gmail metadata read no longer blocks new sends or known-message
  repair; no automatic resend is introduced.
- Exact message ID, Sent label, delivery header, recipient, and subject matching
  remains available for bounded recovery when an interrupted event has no saved
  provider message ID.
- Accepted Gmail invoice events with provider message IDs are labeled sent in
  the communication timeline even when they predate the optional audit marker.
- Focused API and frontend regressions and API typecheck pass. The complete
  frontend test typecheck remains blocked by unrelated stale profit fixtures
  missing the required response version.

### Browser-checkpoint invoice history repair

- Pending invoice events that missed the server checkpoint now retain and use
  the matching Gmail message identity already saved by the sending browser.
- The event-specific repair action finalizes that same event through the normal
  acceptance route without requesting a Gmail token, metadata permission, or a
  second send.
- Gmail metadata search and reconnect remain available only when neither the
  event nor the browser checkpoint contains a known message identity.
- Focused delivery-history tests and the contractor application source
  typecheck pass.

### One-app Website Studio deployment identity

- Renamed the web artifact to `Contractor Management App + Website Studio` to make clear that Website Studio is an internal module of the same multi-business application.
- Documented `business-managment-pro.replit.app` as the authenticated dashboard URL and `willardsgc.com` as the public Website Studio URL.
- Explicitly kept DNS, custom dashboard domains, project splitting, and data duplication out of scope.

### Stale profit deployment protection and browser Gmail entry point

- Bumped the canonical job-profit response marker to version 3 so a previously deployed API cannot be accepted by the current Closed Jobs client after the keyed batch calculation change.
- Added an explicit browser link to Gmail Sent in the invoice compose panel; Gmail API sending and evidence-only recovery remain unchanged.
- Verified API typecheck, focused API regressions, frontend typecheck/build, profit contract checks, client consumer checks, release guard, and local workflow startup.

---

## 2026-09-09

### Canonical profit release and business-scoped recovery safeguards

- Added an explicit version marker to canonical individual and batch job-profit responses; clients reject missing or unsupported versions as unavailable rather than displaying stale arithmetic.
- Extended the Closed Jobs release guard to require the version marker in source, generated client, and built frontend assets.
- Extended client list/profile reads with active business ownership, preserving the legacy `business_line` fallback and scoping owned profile records where canonical ownership exists.
- Added a Gmail reconnect path that clears the browser token, requests metadata permission again, and retries existing delivery verification without resending.
- Routed Closed Jobs batch profit through the same keyed source loader used by reports, eliminating route-local source aggregation that could leak one job's labor into another.
- Made client profiles compatible with legacy production `square_payments` by explicitly projecting existing fields while retaining client-level business authorization.
- Allowed unresolved Gmail events to be verified or safely cleared as failed when no exact Sent message exists; invoice status remains unchanged without evidence.
- Reworked the invoice drawer into a fixed responsive action header with independently scrollable invoice and delivery content.
- Verified API/frontend typechecks, OpenAPI codegen contract checks, focused profit regressions, production frontend build, release guard, and clean diff; the full API test wrapper remains blocked by the pre-existing development schema check for unrelated missing business columns.

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

## 2026-09-09

### Canonical ownership for remaining financial mutations

- Financial mutation routes now resolve a canonical business owner before creating or changing expenses, income, mileage, recurring costs, payroll records, owner capital, tax payments, assets, growth-fund deployments, provider mirrors, portal rows, and legacy payments.
- Job-linked and recurring-generated rows inherit their parent's owner; omitted selectors resolve General Contracting by slug; explicit DBA ownership remains preserved.
- Added canonical `business_id` columns and development backfill migration for legacy payment, Square mirror, subcontractor payment, and estimated-tax ledgers.
- Legacy `businessLine` remains compatibility-only, and All Businesses remains a read-only scope.

### Accounting gate includes the canonical job-profit contract check

- The `accounting:gate` release validation sequence now runs the read-only
  job-profit OpenAPI/generated-output/server-response contract check first.
- The existing schema, typecheck, and API test stages remain fail-fast behind
  the contract check, so contract drift blocks the gate before later release
  validation or publishing.

## 2026-09-06

### Unified alternate job-profit report paths

- Closed Jobs CSV and Owner Pay Summary now load job-scoped source records through the same canonical `calculateJobProfit` input path used by individual and batch job-profit views.
- Export revenue includes non-voided invoices and linked other income; canonical exclusions, allocations, mileage reimbursement, payroll-ledger payments, accrued bonuses, and cross-job labor isolation are preserved.
- Owner-pay presentation applies allocation, growth-reserve, and tax-reserve rules only after canonical job profit is calculated; owner withdrawals remain sourced from `owner_capital_entries`.
- Added regression coverage proving two jobs cannot share labor/cost inputs and that allocated/audit-only expense rows are handled once.

## 2026-09-07

### Unified user-facing job-profit consumers

- Job Payroll and job-card allocation/close flows now use the server's canonical job-scoped split pool instead of reconstructing profit arithmetic in the browser.
- Route Planner now sums canonical per-job net profit and included costs, counting each linked job once even when it has multiple route stops.
- Batch profit aggregation now includes payroll advance amounts consistently with per-job and export calculations.
- Added regression coverage for authoritative split-pool usage, canonical aggregation, and stale job-response rejection during navigation.

### Shared job-profit response contract

- Per-job and batch profit responses now derive from one shared contract built from the complete `calculateJobProfit` result.
- Batch fuel enrichment rebuilds the complete response instead of manually copying selected fields, so payroll-ledger additions remain present in both paths.
- Added response-shape regression coverage for payroll advances and all current calculation fields.

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

## 2026-09-07

### Generated job-profit API contract

- Added the individual and batch job-profit operations to the canonical
  OpenAPI specification.
- Generated Zod and React client types now own the shared job-profit response,
  including the detail/batch mileage representation.
- Removed the parallel hand-maintained profit type so frontend and API
  consumers compile against the same generated contract.

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

### Closed-job profit calculation reconciliation

- Per-job Job Financials and the Closed Jobs batch summary now use one shared
  live profit calculation over the existing invoice, expense, allocation,
  mileage, and subcontractor ledgers.
- Allocation source expenses are excluded from the direct bucket when an
  allocation is present, preventing one source cost from being counted twice.
- Both responses expose a source-level included-cost and excluded-row breakdown
  so displayed profit can be explained without changing production records.

### Recoverable Gmail invoice finalization

- Gmail message and thread identifiers are checkpointed on the existing pending
  communication event before finalization.
- Finalization and repair reuse that event idempotently, including in-place
  repair of legacy accepted events that lack the optional audit marker.
- The former mandatory Sent-folder verification threshold was superseded on
  2026-09-10; strict metadata matching remains only for no-message-ID recovery.

### Explicit custom production learning profiles

- Added business-scoped custom production profiles and service mappings.
- Production observations now include only mapped custom services and expose the
  resolved profile in evidence.
- Added profile creation/listing API operations with business ownership
  validation; unmapped custom services remain excluded.

### Explicit material-list invoice assignment

- Material lists now have one current invoice assignment that can target any
  draft invoice for the same client and business, including another job.
- Reassignment from a sent or paid invoice requires confirmation and never
  rewrites the finalized invoice or moves the list's expense records.
- Added append-only assignment history and invoice-specific material-line sync.

## 2026-11-06

### Route stop job/client relationship integrity

- Route stop creation now verifies that a supplied job exists and, when a client is also linked, that both references identify the same customer.
- Partial route stop edits resolve omitted job/client link values from the stored route stop before validating a changed relationship, preventing one-sided reassignment from creating mismatched links.
- Job-only route stops and unrelated field edits remain supported. No schema, financial ledger, or source-of-truth changes were introduced.
