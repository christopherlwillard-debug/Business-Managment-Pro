# BuildPro Architecture Decisions

This log records key architectural choices — what was decided and why. It is the "history" layer of the governance system. Consult it before implementing any feature that touches existing systems to understand prior decisions that must be respected.

For the rules that govern decisions, see `CONSTITUTION.md`.  
For the current state of each system, see `SYSTEM_REGISTRY.md`.  
For a chronological list of what changed, see `CHANGELOG.md`.

---

## ADR-001

**Title:** Owner Pay uses `owner_capital_entries` — not a separate withdrawal table

**Decision:** Do not create separate owner withdrawal tables (e.g., `owner_distributions`, `owner_withdrawals`).

**Reason:** The application already has an Owner Pay ledger (`owner_capital_entries`) that powers the Accounting page (Earned / Taken Out / Owed To You), reports, and the Owner Capital section. Job-linked owner payments are stored in the existing ledger using a nullable `job_id` column. This preserves a single source of truth and keeps the Accounting page and job Pay Breakdown tab automatically synchronized.

**Rejected Alternatives:**
- `owner_distributions` table (created in error, subsequently removed)
- `owner_withdrawals` table
- Any other separate owner pay ledger

**Status:** Accepted
**Date:** 2026-08-05

---

## ADR-002

**Title:** Subcontractor pay ledger is `sub_payment_records` — not the `expenses` table

**Decision:** Subcontractor pay is recorded exclusively in `sub_payment_records`.

**Reason:** An earlier implementation of the `pay-worker` endpoint dual-wrote to both `sub_payment_records` and the `expenses` table (with category "Subcontractor"). This caused double-counting in P&L calculations — subcontractor labor appeared as both a payroll line and a business expense. The `expenses` table is for business operating costs; payroll is a separate concept with its own ledger.

**Rejected Alternatives:**
- Writing sub pay to `expenses` as category "Subcontractor"
- Any dual-write approach

**Status:** Accepted
**Date:** 2026-08-05

---

## ADR-003

**Title:** Owner capital investment uses `owner_capital_entries` — not a settings field

**Decision:** Owner personal investment is tracked as a ledger entry in `owner_capital_entries`, not as a single value in the `settings` table.

**Reason:** A single `ownerPersonalInvestment` settings value cannot represent multiple investments over time, partial investments, or investments linked to specific jobs. The ledger model supports the full history and is auto-migrated from the legacy single value on first access.

**Rejected Alternatives:**
- `settings.calculatorDefaults.ownerPersonalInvestment` (legacy, migrated away from)

**Status:** Accepted
**Date:** 2026-08-05

---

## ADR-004

**Title:** Mileage imports create one expense per month — not one per trip

**Decision:** When a mileage import batch is processed, one consolidated expense entry is created per calendar month (linked via `expenses.mileage_import_id`), not one expense row per trip.

**Reason:** Individual trip expenses created hundreds of rows for active months, making the expense list unusable. Monthly consolidation via `recalcImportExpenses` keeps the ledger clean while preserving full trip detail in `mileage_logs`.

**Rejected Alternatives:**
- One `expenses` row per imported trip

**Status:** Accepted  
**Date:** 2026-08-05

---

## ADR-005

**Title:** PDF generation uses PDFKit (pure Node.js) — not Puppeteer/Chrome

**Decision:** All server-side PDF generation uses PDFKit.

**Reason:** Puppeteer/Chrome is broken in the production environment. PDFKit is a pure Node.js library that works reliably in both development and production without requiring a headless browser.

**Rejected Alternatives:**
- Puppeteer + headless Chrome (broken in production)

**Status:** Accepted  
**Date:** 2026-08-05

---

## ADR-007

**Title:** Non-invoice cash receipts use `other_income` with explicit job attribution

**Decision:** `other_income` is an approved second revenue source for cash receipts that do not originate from an invoice. A `job_id` link is required before the receipt affects per-job operational revenue/profit; unmatched receipts remain aggregate/tax revenue only. `business_id` is canonical ownership, with `business_line` retained only as a migration fallback.

**Reason:** The application already receives legitimate Square, website-deposit, and manually recorded cash receipts that are not invoices. Treating invoices as the only revenue source omits real receipts, while assigning unmatched receipts to jobs by client or name would create untraceable profit attribution. The existing table and Square payment idempotency key are sufficient; a new payment-event ledger is outside this decision.

**Rejected Alternatives:**
- Treating every revenue report as invoice-only
- Inferring a job from client/name when no explicit `job_id` exists
- Creating a second non-invoice revenue table

**Status:** Accepted
**Date:** 2026-08-20

---

## ADR-008

**Title:** Posted financial corrections use explicit void/reversal semantics

**Decision:** Posted expenses, other-income rows, owner-capital entries, mileage records, and issued invoices are never hard-deleted. They retain their source row and relationships, receive a required correction reason, and are excluded from accounting calculations. Draft invoices remain permanently removable; subcontractor payments use the existing reversal flag with a stored reason.

**Reason:** Hard deletion made historical reports impossible to reconstruct and removed evidence needed to explain corrections. Extending each existing source ledger preserves one source of truth without introducing a general audit table.

**Rejected Alternatives:**
- Soft-deleting every non-financial table
- Creating a parallel correction/audit ledger
- Silently converting DELETE into a void operation

**Status:** Accepted
**Date:** 2026-08-20

---

## ADR-009

**Title:** Mileage deductions use one effective-date IRS rate engine

**Decision:** `irs-rates.ts` owns the date-aware IRS schedule. Manual entries, imports, mileage summaries, tax/report calculations, and controlled import recalculation all derive deductions from raw trip date, miles, and classification. Stored rate and deduction values remain historical snapshots until an explicit recalculation is confirmed.

**Reason:** A year-only display rate and separate route-local schedule could diverge, while reports trusting stored deductions could remain stale after rate changes. Live recomputation preserves accurate reporting without silently rewriting historical financial snapshots.

**Rejected Alternatives:**
- Trusting stored deduction snapshots in reports
- Automatically rewriting every historical mileage row
- Maintaining separate manual/import/report rate tables

**Status:** Accepted
**Date:** 2026-08-20

---

## ADR-010

**Title:** Tax assumptions are effective-dated configuration owned by the main business

**Decision:** Tax calculation constants and meal treatment live in the shared tax engine with safe tax-year defaults. Business overrides are stored as JSON configuration on `settings`, and reports return the exact assumptions used. A DBA inherits the parent business as its tax owner; tax reports include the parent and its DBA children.

**Reason:** Tax rates, meal treatment, and jurisdiction rules change independently of application releases. Keeping the assumptions beside the existing settings system makes them reviewable without creating another financial ledger. Parent ownership prevents a DBA from being treated as a separate tax entity by accident.

**Status:** Accepted
**Date:** 2026-08-20

---

## ADR-011

**Title:** Job mileage reimbursement is separate from mileage and expense ledgers**

**Decision:** Store the editable job-card route-estimate reimbursement in `job_mileage_reimbursements`. Include its amount in the individual job's costs and net profit, but exclude it from the 50/50 or percentage split pool. Do not write it to `mileage_logs`, MileIQ imports, `expenses`, or `owner_capital_entries`.

**Reason:** The user needs to reimburse whoever fronted fuel while preserving the existing monthly mileage-import workflow and company accounting source of truth. Existing ledgers cannot store a flexible recipient and editable job-only amount without changing tax/accounting meaning.

**Rejected Alternatives:**
- Writing the estimate to `expenses`
- Writing it to the IRS/MileIQ mileage ledger
- Writing all reimbursements to owner capital entries
- Subtracting it from the percentage split pool

**Status:** Accepted
**Date:** 2026-08-21

---

## ADR-011

**Title:** Derived financial values are live-derived or explicitly labeled snapshots

**Decision:** Invoice totals are rebuilt from persisted line items whenever exposed to callers and reports; stored totals remain only as a reproducible snapshot with mismatch metadata. MFH knowledge-record profit fields remain immutable learning-history snapshots, while the MFH API also computes and exposes current source-derived values plus stale fields.

**Reason:** Rewriting historical learning records would destroy the evidence used to train and audit the knowledge base, while trusting them silently produces stale profitability. Separating snapshot display from live calculation preserves both historical meaning and current financial truth.

**Status:** Accepted
**Date:** 2026-08-20

---

## ADR-006

**Title:** Core records use canonical business ownership with legacy slug compatibility

**Decision:** Core clients, jobs, invoices, estimates, prospects, and assets carry a nullable `business_id` foreign key. During migration, `business_line` remains a read-compatible fallback. Scoped requests resolve the selected business once and reject ID-based access when the record belongs to another business.

**Reason:** Owner-authenticated routes previously accepted global record IDs, allowing cross-business reads and mutations. A nullable backfill preserves existing unassigned data for deliberate classification instead of silently assigning it.

**Rejected Alternatives:**
- Trusting client-side business filtering
- Treating `business_line` as an authorization boundary forever
- Making the new foreign key non-null before legacy rows are inventoried

**Status:** Accepted
**Date:** 2026-08-20

---

## ADR-012

**Title:** Bid opportunities require explicit ownership; legacy orphans are quarantined

**Decision:** `bid_opportunities.business_id` remains the canonical ownership field. New and synchronized rows must use an existing `businesses` row, scoped bid reads and mutations must match the requested business, and legacy rows with null ownership are marked `status="quarantined"` with `stage="no_bid"` rather than guessed into a business or deleted. The intentional all-business unified feed remains owner-only and excludes null-owned rows.

**Reason:** A legacy sync path assigned every null-owned bid to the asphalt business, which could misattribute records. Quarantine preserves recovery evidence while preventing unowned data from appearing in normal feeds. The existing table and unique `(notice_id, business_id)` index remain sufficient.

**Rejected Alternatives:**
- Assigning null-owned bids to the first, asphalt, or currently syncing business
- Deleting legacy orphan rows
- Creating a parallel quarantine table
- Making `business_id` non-null before legacy rows are inventoried and manually classified

**Status:** Accepted
**Date:** 2026-08-24

---

*Add new ADRs here as architectural decisions are made. Number sequentially (ADR-006, ADR-007, ...).*
*Format: Title | Decision | Reason | Rejected Alternatives | Status | Date*

## ADR-013

**Title:** Bid service-area eligibility is stored separately from capability scoring

**Decision:** Extend `bid_opportunities` with normalized place-of-performance, a `local|regional|outside_area|unknown` classification, and an explanation. Classification is computed by one shared geography classifier during synchronization and is independent of NAICS/capability scoring. The feed defaults to local and regional while retaining explicit access to outside-area and unknown records.

**Reason:** Service-area eligibility answers a different question from whether the work matches a capability. Keeping the dimensions separate makes the default feed explainable without changing ranking, historical records, awards intelligence, or business ownership.

**Rejected Alternatives:**
- Filtering or deleting opportunities during synchronization
- Reusing opportunity score as geographic eligibility
- Creating a parallel geography table

**Status:** Accepted
**Date:** 2026-08-24

---

## ADR-014

**Title:** Owner Withdrawals is the only user-facing owner-money workflow

**Decision:** Use “Owner Withdrawals” throughout normal UI and accept only new withdrawals in the existing `owner_capital_entries` ledger. Preserve historical positive contribution records internally, but do not expose contribution, capital, compensation, draw, or equity creation workflows.

**Reason:** A single plain-language concept prevents owner cash transfers from being mistaken for revenue, operating expenses, job costs, profit deductions, or tax deductions while preserving one authoritative audit ledger.

**Rejected Alternatives:**
- A new owner-withdrawal table or API
- Continuing separate owner-pay and equity-withdrawal dialogs
- Creating owner withdrawals as expense rows
- Deleting or rewriting historical contribution records

**Status:** Accepted
**Date:** 2026-08-29

---

## ADR-015

**Title:** Job readiness blockers are internal planning history, separate from customer checklist delays

**Decision:** `job_readiness_conditions` records business-scoped operational blockers and their create/clear audit identities. Customer-facing delay history remains in `job_checklist_status_log`; production scope continues to update the applied checklist records rather than creating another progress model.

**Reason:** Readiness is a scheduling concern that may not be appropriate for the customer portal. The existing checklist log represents customer-facing execution status, so combining them would expose or distort distinct operational facts.

**Rejected Alternatives:**
- Storing readiness blockers in customer-facing checklist delay logs
- Adding a second production-progress table
- Deleting cleared blockers

**Status:** Accepted
**Date:** 2026-08-30

---

## ADR-016

**Title:** Invoice communication history is an append-only delivery-attempt ledger

**Decision:** Record initial sends, resends, reminders, payment-link emails, and payment receipts in `invoice_communication_events`. Each attempt is created as `pending` and finalized as `accepted`, `failed`, or `unknown`; provider metadata and errors remain on the event. Existing invoice sent/reminder fields remain compatibility summaries, not the complete history. For browser Gmail sends, provider acceptance plus the returned Gmail message ID finalizes the prepared event and qualifies the invoice as SENT; this is provider acceptance, not confirmed inbox delivery. A secondary Gmail metadata read is optional audit/reconciliation evidence and must not block successful sending. When an interrupted send has no saved message ID, recovery remains a bounded Sent-folder search requiring exact delivery header, recipient, and subject matches. Manual status changes, SMTP sends, and payment-link creation do not qualify.

**Reason:** Invoice financials and lifecycle belong to `invoices`, while delivery history needs multiple recipients, providers, message IDs, attempts, and failures without changing revenue, payment, or job calculations. Gmail already returns the provider message ID when it accepts a send; making a second metadata-scoped request a mandatory lifecycle gate caused accepted messages to remain pending and invoices to remain Approved. A pending event still makes genuinely uncertain browser/provider outcomes visible instead of silently losing the audit trail.

**Rejected Alternatives:**
- Overloading `sentAt`, `sentMethod`, or `remindersSentAt` as the full history
- Writing delivery attempts to payment or revenue ledgers
- Describing provider acceptance as confirmed inbox delivery
- Requiring a second Gmail metadata read after every accepted send

**Status:** Accepted
**Date:** 2026-08-31
**Amended:** 2026-09-10 — Gmail provider acceptance plus its returned message ID supersedes the former mandatory metadata-verification threshold.

---

## ADR-017

**Title:** Every displayed Job Cost reduces the percentage split pool

**Decision:** The server-calculated allocation waterfall is revenue minus all displayed Job Costs, then Growth Reserve, then hourly/fixed labor. Saved mileage reimbursements and estimated job fuel included in Job Costs therefore reduce the split pool. All job cards, Job Financials, payment views, and close-job flows consume that server result. This supersedes ADR-011 only where it excluded job mileage reimbursement from the split pool.

**Reason:** Excluding a displayed Job Cost produced two contradictory values in one waterfall: Remaining reflected the cost while Split Pool silently restored it. A financial screen must be arithmetically traceable, and Remaining must equal Split Pool before percentage allocation.

**Rejected Alternatives:**
- Keeping a separate fuel/mileage-excluded pool
- Correcting only the displayed number
- Persisting a second split-pool snapshot

**Status:** Accepted
**Date:** 2026-09-03

---

## ADR-018

**Title:** Owner-paid job fuel is returned after tax-adjusted take-home**

**Decision:** Keep an included route-based fuel estimate or saved mileage reimbursement in Job Costs so it reduces job income and the shared percentage pool once. After the normal owner share and tax reserve are calculated, an owner-directed amount is shown as `Gas Cost Reimbursement` and added to `Total to You`. A saved reimbursement amount, recipient, and paid status override the automatic estimate. Automatic estimates do not create expense, mileage, payroll, or owner-withdrawal ledger rows.

**Reason:** The owner must see the business cost in the job waterfall while still receiving back the personal out-of-pocket gas amount after the first, tax-adjusted take-home amount. Hiding the payback inside the profit share makes the settlement impossible to understand.

**Rejected Alternatives:**
- Showing fuel only as a Job Cost with no owner payback
- Adding the reimbursement before the tax reserve
- Creating a duplicate expense or owner-withdrawal ledger entry for the payback

**Status:** Accepted
**Date:** 2026-09-03

---

## ADR-019

**Title:** Dashboard WTD uses the current Monday-start calendar week

**Decision:** The dashboard's `WTD` period begins on Monday of the current calendar week and ends on the report's current date. It is not a trailing seven-day window.

**Reason:** A trailing seven-day range can cross a month boundary and make WTD expenses exceed MTD expenses, which makes the period labels and business-health comparison misleading. The existing invoice, expense, payroll, and cash-basis sources remain unchanged.

**Rejected Alternatives:**
- Keeping the trailing seven-day range under the `WTD` label
- Creating a separate dashboard or financial ledger for week-to-date reporting
- Renaming the existing period to `Last 7 Days`

**Status:** Accepted
**Date:** 2026-09-04

---

## ADR-020

**Title:** Imported mileage drive identity uses provider timestamps

**Decision:** New MileIQ imports retain a normalized key derived from the exported start and end timestamps. PostgreSQL enforces uniqueness for active imported trips by business, provider source, and that key. Rows without a provider key retain the existing route-based compatibility check, and voided trips do not block a later re-import.

**Reason:** A corrected MileIQ export has a different file hash but repeats the same drives. File-level hashes cannot prevent trip duplication, while the prior date, miles, start, and stop comparison discarded drive times and could not distinguish legitimate same-day repeat routes. The provider timestamps remain stable when mileage, classification, or address text is corrected and allow the database to protect concurrent imports.

**Rejected Alternatives:**
- Treating a corrected export as an entirely new batch without trip-level protection
- Enforcing date, mileage, and route as a unique identity
- Voiding and replacing every prior import from the same month
- Relying only on an application-memory duplicate check

**Status:** Accepted
**Date:** 2026-09-05

---

## ADR-021

**Title:** General Contracting is the permanent default owner for job and invoice mutations

**Decision:** Mutation routes resolve ownership through the `businesses` record with stable slug `general_contracting`. A valid explicit selector takes precedence; without one, new or deterministically legacy ownership is General Contracting. Job-linked invoices inherit the linked job's canonical owner and reject an explicit conflicting selector.

**Reason:** Numeric business IDs vary by environment and workflow labels are not ownership. Resolving one canonical id/slug pair at mutation time prevents null ownership while retaining child DBA ownership, including Asphalt, without cross-business reassignment.

**Rejected Alternatives:**
- Treating workflow as an ownership selector
- Using a numeric General Contracting ID
- Writing a null owner when a selector is absent
- Bulk-normalizing ambiguous or explicitly DBA-owned historical records

**Status:** Accepted
**Date:** 2026-09-05

## ADR-022

**Title:** Production Intelligence separates operational history from knowledge learning

**Decision:** Keep Knowledge Center and Scheduling/Operations as separate systems connected through production facts. Scheduling owns actual daily presence and historical operational records; Knowledge Center owns reusable production definitions and owner-approved learning. Willard's initial production configuration is Interior Finish with VOG/Hybrid/Drywall variants, Siding, Plumbing, Skirting, and Custom. Service remains a separate future work type and is excluded from production learning.

**Reason:** A simple daily presence record provides useful calendar-span, actual-production-day, pause-day, and completed-job history without forcing detailed time tracking. Separating those facts from reusable knowledge prevents the Knowledge Center from becoming a calendar source of truth and prevents scheduling from becoming a second pricing, payroll, expense, or profit system.

**Rejected Alternatives:**
- Merging Knowledge Center and Scheduling into one subsystem
- Treating completed jobs as deleted from schedule history
- Making exact start/end labor sessions mandatory
- Creating top-level Finish Carpentry, Drywall, Electrical, HVAC, Inspection, or Cleanup components for Willard
- Mixing Service calls into production averages or baselines
- Creating a parallel production payroll, expense, or profit ledger

**Status:** Accepted
**Date:** 2026-09-10

## ADR-024

**Title:** Production baseline learning requires explicit global benchmark review

**Decision:** Keep `job_type_benchmarks.estimated_hours` as the only active benchmark source. Store proposed, approved, and rejected changes in `job_type_benchmark_revisions` with the observed production-day summary, sample job IDs, reviewer identity, and captured prior value. Reviews and approvals are available only in the all-business view. Willard must enter benchmark hours explicitly; the system never converts production days into hours.

**Reason:** Production observations are measured in days while the existing benchmark is measured in hours, and the codebase has no documented hours-per-day rule. Existing benchmarks are global, so a business-scoped sample must not silently change shared knowledge. A separate review history preserves evidence without turning observations into an operational or financial ledger.

**Approval safeguard:** Approval is transactional and rejects stale reviews when the current benchmark no longer matches the captured prior value. Rejection leaves the active benchmark unchanged, and only one pending review may exist for a model/benchmark pair.

**Rejected Alternatives:**
- Automatically converting observed days to hours
- Letting a business-scoped observation update the shared benchmark
- Replacing the benchmark table with a learned-value table
- Updating the benchmark without preserving the prior value and source jobs

**Status:** Accepted
**Date:** 2026-09-10

## ADR-023

**Title:** Persistent daily production presence is a Jobs-owned operational fact

**Decision:** Store one raw `job_daily_presence` row per job/date when presence is explicitly recorded. The row supports exactly `unrecorded`, `here`, and `not_here`; not-here reasons and notes are allowed only as operational detail, and every stored fact carries source and provenance. Missing rows and explicit `unrecorded` rows both remain distinct from `not_here`; neither is inferred as absence. Production timing is calculated live from presence rows and existing job dates. The existing `jobs.days_on_job` value may be exposed as an expected-duration input when present, but no financial or vehicle calculation may consume presence data.

**Reason:** Daily presence is a new raw operational fact that cannot be represented safely in daily narrative logs, labor-hour rows, checklists, or the jobs date span. A unique job/date row provides persistence and idempotent edits without creating a duplicate labor, payroll, schedule, or financial source of truth. Live timing derivation prevents stale calculated values.

**Rejected Alternatives:**
- Treating missing presence rows as `not_here`
- Using `daily_logs` as a presence ledger
- Using `job_sub_hours` or worker hours to infer presence
- Writing presence into checklist scheduling or status history
- Persisting derived timing values
- Creating payroll, expense, mileage, invoice, payment, or profit records from presence

**Status:** Accepted
**Date:** 2026-09-10

## ADR-025

**Title:** Custom production services require explicit business-scoped learning profiles

**Decision:** Keep custom production service names as display/catalog data only. A custom service can enter production observations only when its service ID is explicitly mapped to an active named profile owned by the same business. Store profiles and mappings separately from the service catalog, and include the resolved profile metadata in observation traceability. Unmapped custom services remain excluded.

**Reason:** Free-text service names are not stable production categories and the same name can mean different work in different businesses. An explicit mapping gives Willard a reviewable boundary for learning while preserving the existing observation engine and preventing cross-business leakage.

**Rejected Alternatives:**
- Inferring a profile from a custom service name
- Making custom service names global learning keys
- Allowing a mapping from one business to another business's profile
- Treating unmapped custom services as standard production components

**Status:** Accepted
**Date:** 2026-09-10

## ADR-026

**Title:** Job-specific production components are versioned operational snapshots

**Decision:** Extend Jobs with `job_production_components` as a versioned snapshot of selected MH Production work. Keep `jobs.mh_production_services` as the backward-compatible selection source and classify catalog rows centrally into only Interior Finish (VOG/Hybrid/Drywall), Siding, Plumbing, Skirting, or Custom. Service-only and travel-surcharge rows are excluded. Component status is independently mutable; expected labor, duration, crew, checklist/material, pricing, and Knowledge Center context are snapshots and never financial or learning ledgers.

**Reason:** The existing service catalog and Jobs JSONB selection must remain compatible, while Knowledge Center and operational UI need stable job-specific context that does not change when catalog or knowledge definitions change. Superseded snapshots preserve traceability without creating a parallel pricing, checklist, payroll, expense, mileage, invoice, profit, presence, or benchmark system.

**Rejected Alternatives:**
- Replacing `jobs.mh_production_services`
- Recomputing historical component identity from the live catalog
- Creating component-specific pricing, checklist, payroll, expense, profit, or learning tables
- Exposing prohibited legacy service names as top-level components

**Status:** Accepted
**Date:** 2026-09-11

## ADR-028

**Title:** Component work sessions are an operational evidence ledger

**Decision:** Add `job_component_work_sessions` as the Jobs-owned source for raw production work by job, approved component snapshot, work date, worker, decimal hours, and optional notes. Allow an assigned subcontractor or explicitly named outside worker. Permit corrections but not deletion; do not reuse payroll, expense, labor-learning, or daily-presence tables.

**Reason:** Component work needs traceable evidence at a finer grain than job/day presence, but it must remain operational until a later phase explicitly defines payroll, reporting, or learning consumers. Referencing the exact component snapshot preserves historical meaning when the current component is superseded.

**Rejected Alternatives:**
- Reusing `job_sub_hours`, which carries payroll, expense, and payment behavior
- Reusing `job_labor_entries`, which belongs to Knowledge Center summaries
- Treating daily presence as component work evidence
- Adding financial, payroll, profit, invoice, mileage, checklist, or learning side effects to a work-session write

**Status:** Accepted
**Date:** 2026-09-11

## ADR-027

**Title:** Job production snapshot sync serializes by job

**Decision:** Production component snapshot synchronization acquires a transaction-scoped PostgreSQL advisory lock keyed to the job before reading existing component rows. Version calculation and supersession happen after the lock; the existing unique `(job_id, component_instance_key, snapshot_version)` constraint remains the final database guard.

**Reason:** Concurrent catalog or job edits must not calculate the same next snapshot version from stale reads or leave more than one current row for a component instance. Job-scoped serialization preserves the existing append-only snapshot model and makes concurrent sync outcomes deterministic without adding another table or API.

**Rejected Alternatives:**
- Calculating versions from reads performed before the transaction
- Adding a second synchronization or snapshot table
- Removing the existing unique-version constraint
- Relying on UI request ordering for data integrity

**Status:** Accepted
**Date:** 2026-09-11
