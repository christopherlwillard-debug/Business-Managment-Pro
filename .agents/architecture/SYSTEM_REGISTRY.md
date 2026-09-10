# BuildPro System Registry

**This file is READ-ONLY except through architectural review.**

It may only be updated when:
- A new core system is added
- A source of truth changes
- A database table is renamed
- An API route ownership changes
- An architecture review explicitly approves the modification

Do **not** modify this file as part of normal feature development.

Before implementing any financial, schema, or business logic feature — consult this registry to verify the authoritative source of truth for every concept you will touch.

---

## Owner Withdrawals

- **Table:** `owner_capital_entries`
- **Schema:** `lib/db/src/schema/owner-capital.ts`
- **API:** `artifacts/api-server/src/routes/owner-capital.ts`
- **UI:** Accounting, Dashboard, Jobs, and Job Payroll → Owner Withdrawals
- **Reports:** Yes — `artifacts/api-server/src/routes/reports.ts` (ownerCapitalEntriesTable)
- **Source of truth:** `owner_capital_entries`. Job-linked withdrawals carry a nullable `job_id`. Historical positive contribution rows remain preserved internally.
- **Rule:** New user-created owner transactions are withdrawals only, stored as canonical negative rows. No expense or parallel ledger may store them. (ADR-001, ADR-014)

---

## Authentication / Sessions

- **Tables:** `users`, `sessions`
- **Schema:** `lib/db/src/schema/auth.ts`
- **API:** `artifacts/api-server/src/routes/auth.ts`, `index.ts` authentication middleware
- **UI:** shared authenticated application shell and login flow
- **Reports:** None.
- **Source of truth:** `users` owns application identities; `sessions` owns active authenticated sessions.
- **Rule:** Authentication records are infrastructure, not business ownership or accounting records.

---

## Expenses

- **Table:** `expenses`
- **Schema:** `lib/db/src/schema/expenses.ts`
- **API:** `artifacts/api-server/src/routes/expenses.ts`
- **UI:** `artifacts/contractor-app/src/pages/Expenses.tsx`
- **Reports:** Yes — heavily used across P&L, tax, and job profit calculations
- **Source of truth:** `expenses`. All business operating costs (materials purchases, fuel, tools, supplies, etc.) live here. Subcontractor payroll and owner pay do NOT go here.
- **Rule:** Do not write payroll, owner draws, or capital transactions to this table.
- **Correction policy:** Posted expenses use `POST /:id/void` with required `void_reason`; DELETE is not permitted.

---

## Job Expense Allocations

- **Table:** `job_expense_allocations`
- **Schema:** `lib/db/src/schema/job-expense-allocations.ts`
- **API:** `artifacts/api-server/src/routes/jobs.ts`, `expenses.ts`
- **UI:** Jobs financial views and expense allocation controls
- **Reports:** Derived job-cost attribution only; the source expense remains the accounting ledger row.
- **Source of truth:** `expenses` owns the transaction; this table owns a business-scoped distribution of an existing expense across jobs.
- **Rule:** Never treat an allocation as a second expense or duplicate it in cash-basis reports.

---

## Mileage

- **Tables:** `mileage_logs`, `mileage_imports`
- **Schema:** `lib/db/src/schema/mileage.ts`
- **API:** `artifacts/api-server/src/routes/mileage.ts`
- **UI:** `artifacts/contractor-app/src/pages/Mileage.tsx`
- **Reports:** Yes — mileage deduction in tax reports (`mileageLogsTable`)
- **Source of truth:** `mileage_logs` for individual trips; `mileage_imports` tracks import batches. Imported trips create one expense per month via `expenses.mileage_import_id`. Deduction calculation is owned by the effective-date engine in `artifacts/api-server/src/lib/irs-rates.ts`; stored rate/deduction fields are snapshots.
- **Rule:** Do not store mileage costs directly in expenses as line items — use the mileage engine.
- **Import identity:** New provider imports retain a provider-specific drive key. Active imported trips are unique per business, source, and drive key; voided history remains re-importable.
- **Correction policy:** Mileage logs and generated expense rows are voided together; import rollback preserves source rows.
- **Recalculation policy:** `GET /imports/:id/recalculate/preview` is read-only; `POST /imports/:id/recalculate` requires `{ confirm: true }`.

## Job Mileage Reimbursement

- **Table:** `job_mileage_reimbursements`
- **Schema:** `lib/db/src/schema/job-mileage-reimbursements.ts`
- **API:** `artifacts/api-server/src/routes/jobs.ts` (`/:id/mileage-reimbursement`)
- **UI:** `artifacts/contractor-app/src/pages/Jobs.tsx` → Job Financials
- **Reports:** No — job-card operational deduction only
- **Source of truth:** `job_mileage_reimbursements` for the editable route-estimate reimbursement amount and recipient
- **Rule:** This table must never receive MileIQ imports, IRS mileage deductions, or company expense rows. When included in Job Costs, its amount reduces job profit and the percentage split pool once; an owner-directed amount is then shown as a separate reimbursement after the owner's tax-adjusted take-home.

### Tax assumptions

- **Owner:** `tax-estimate.ts` is the calculation engine; `settings.tax_assumptions` holds business overrides.
- **Tax ownership:** a business with `parentBusinessId` inherits the parent as its tax owner. Tax reports include the parent and DBA children.
- **Audit context:** Schedule C and estimated-tax responses include `assumptionsUsed` and the tax owner context.

### Derived financial values

- **Invoice totals:** line items are the source of truth; API formatting and accounting/tax report paths recompute subtotal, tax, and total and expose `calculationStatus`.
- **MFH knowledge records:** stored profit fields are historical learning snapshots. `/knowledge-record` also returns live source-derived calculations and identifies stale fields and snapshot time.

---

## Subcontractor Payroll

- **Tables:** `sub_payment_records` (ledger), `subcontractors` (profiles), `job_subcontractors` (job assignments), `job_sub_hours` (hourly time logs), `sub_advances` (advance payments)
- **Schemas:** `lib/db/src/schema/sub-payment-records.ts`, `subcontractors.ts`, `job-subcontractors.ts`, `job-sub-hours.ts`, `sub-advances.ts`
- **API:** `artifacts/api-server/src/routes/subcontractors.ts`, `artifacts/api-server/src/routes/jobs.ts`
- **UI:** `artifacts/contractor-app/src/pages/Subcontractors.tsx`, `artifacts/contractor-app/src/pages/JobPayroll.tsx`
- **Reports:** Indirect — job-subcontractor joins used in P&L and labor cost calculations
- **Source of truth:** `sub_payment_records` is the sole payroll ledger. Pay recorded here; advances in `sub_advances`. (ADR-002)
- **Rule:** Never write subcontractor pay to the `expenses` table. `sub_payment_records` is the authoritative payroll ledger.
- **Correction policy:** Posted payments use `is_reversal` plus `reversal_reason`; hard delete is not permitted.

---

## Invoices

- **Table:** `invoices`
- **Schema:** `lib/db/src/schema/invoices.ts`
- **API:** `artifacts/api-server/src/routes/invoices.ts`
- **UI:** `artifacts/contractor-app/src/pages/Invoices.tsx`
- **Reports:** Yes — revenue, collected, outstanding calculations in reports.ts
- **Source of truth:** `invoices` for invoice revenue, plus `other_income` for explicitly recorded non-invoice cash receipts. Each report must apply the source’s approved accounting treatment exactly once.
- **Communication history:** `invoice_communication_events` records append-only invoice delivery attempts and provider outcomes; it has no accounting or payment authority.
- **Rule:** Invoice revenue and non-invoice cash receipts must not be duplicated. Job profit includes only `other_income` rows explicitly linked to that job; unmatched rows remain aggregate/tax revenue only.
- **Communication rule:** Preserve `sentAt`, `sentMethod`, and `remindersSentAt` for compatibility, but use the communication event timeline for complete history. SENT and reminder eligibility require a verified Gmail invoice send with a provider message ID; manual status changes and payment-link creation cannot set SENT. Provider acceptance is not inbox delivery. Interrupted browser sends may recover the provider message ID only by matching the stored recipient, exact subject, bounded send time, SENT label, and BuildPro delivery header through Gmail metadata.

---

## Other Income

- **Table:** `other_income`
- **Schema:** `lib/db/src/schema/other-income.ts`
- **API:** `artifacts/api-server/src/routes/other-income.ts`; Square ingestion in `artifacts/api-server/src/routes/square-webhook.ts`
- **UI:** Accounting/other-income entry surfaces
- **Reports:** Aggregate revenue, accounting, P&L, tax, year-end, and monthly revenue reports
- **Source of truth:** `other_income` for non-invoice cash receipts. `business_id` is canonical ownership, with `business_line` as a legacy fallback; `job_id` is the only authority for job attribution.
- **Rule:** A row with `job_id` contributes to that job’s operational revenue/profit and aggregate revenue once. An unmatched row contributes to aggregate/tax revenue but never to a job’s profit.

---

## Estimates

- **Table:** `estimates`
- **Schema:** `lib/db/src/schema/estimates.ts`
- **API:** `artifacts/api-server/src/routes/estimates.ts`
- **UI:** `artifacts/contractor-app/src/pages/Estimates.tsx`
- **Reports:** Not directly used in reports
- **Source of truth:** `estimates`. Pre-sale pricing documents; do not affect revenue until converted to invoices.

---

## Materials / Inventory

- **Tables:** `materials` (catalog), `material_lists` (per-job lists), `material_list_items` (line items)
- **Schemas:** `lib/db/src/schema/materials.ts`, `lib/db/src/schema/material-lists.ts`
- **API:** `artifacts/api-server/src/routes/materials.ts`, `artifacts/api-server/src/routes/material-lists.ts`
- **UI:** `artifacts/contractor-app/src/pages/Materials.tsx`
- **Reports:** Not directly in reports.ts
- **Source of truth:** `materials` for the catalog; `material_list_items` for job-level material consumption.

---

## Jobs

- **Table:** `jobs`
- **Schema:** `lib/db/src/schema/jobs.ts`
- **API:** `artifacts/api-server/src/routes/jobs.ts`
- **UI:** `artifacts/contractor-app/src/pages/Jobs.tsx`
- **Reports:** Yes — central to all P&L, job profit, and labor calculations
- **Source of truth:** `jobs`. The central entity linking invoices, expenses, mileage, payroll, materials, and owner pay.
- **Active financial visibility:** unavailable worker, subcontractor, and Owner Pay balances remain `null` and include server-derived missing-input reasons; clients must not invent fallback amounts or explanations.
- **Planning:** `jobs.planning_state`, `priority`, `resource_demand`, and `queue_position` hold raw planning inputs. `job_readiness_conditions` owns immutable internal blocker history; active conditions are returned with job list/detail responses. Checklist section completion uses the existing applied checklist tables and status log.

## Production Intelligence / Daily Presence

- **Table:** `job_daily_presence`
- **Schema:** `lib/db/src/schema/job-daily-presence.ts`
- **API:** `artifacts/api-server/src/routes/job-presence.ts`
- **UI:** `artifacts/contractor-app/src/components/planner/JobPresencePanel.tsx` within Active Schedule and Schedule History
- **Reports:** None yet; the raw operational facts are available to future reporting and Knowledge Center consumers.
- **Source of truth:** `job_daily_presence` owns explicitly recorded per-job/per-day presence state, not-here reason, optional notes, source, and provenance. Timing concepts are calculated live from this table plus existing job dates and expected-duration input.
- **Rule:** `unrecorded`, `here`, and `not_here` remain distinct. Presence never creates or updates payroll, expenses, mileage, invoices, payments, profit, checklists, daily logs, or labor-hour rows.

---

## Clients / Customers

- **Tables:** `clients`, `client_billing_profiles`
- **Schema:** `lib/db/src/schema/clients.ts`
- **API:** `artifacts/api-server/src/routes/clients.ts`, `client-billing-profiles.ts`
- **UI:** `artifacts/contractor-app/src/pages/Clients.tsx`
- **Reports:** Yes — joined to jobs and invoices in reports
- **Source of truth:** `clients` owns the customer; `client_billing_profiles` owns payment-provider/billing metadata. One record per customer. Prospects live elsewhere (CRM/prospect system).

---

## Bank Transactions

- **Tables:** `bank_transactions`, `bank_import_batches`, `bank_transaction_invoice_links`, `bank_transaction_expense_links`
- **Schema:** `lib/db/src/schema/bank-reconciliation.ts`
- **API:** `artifacts/api-server/src/routes/plaid.ts`
- **UI:** `artifacts/contractor-app/src/pages/Banking.tsx`
- **Reports:** Not directly queried in reports.ts
- **Source of truth:** `bank_transactions`. Plaid-synced transaction feed. Reconciliation links connect bank rows to invoices and expenses.
- **Rule:** Bank transactions are informational and reconciliation anchors — they do not create expenses or income directly.

---

## Recurring Expenses

- **Table:** `recurring_expenses`
- **Schema:** `lib/db/src/schema/recurring-expenses.ts`
- **API:** `artifacts/api-server/src/routes/recurring-expenses.ts`
- **UI:** `artifacts/contractor-app/src/pages/Expenses.tsx`
- **Reports:** Yes — included in P&L and tax expense calculations
- **Source of truth:** `recurring_expenses`. Subscription and regular business costs that auto-generate expense entries.
- **Rule:** Recurring expenses generate rows in `expenses` — never create a parallel recurring ledger.

---

## Assets

- **Tables:** `assets`, `asset_business_use`
- **Schema:** `lib/db/src/schema/assets.ts`
- **API:** `artifacts/api-server/src/routes/assets.ts`
- **UI:** `artifacts/contractor-app/src/pages/Assets.tsx`
- **Reports:** Yes — depreciation and business-use calculations in reports
- **Source of truth:** `assets`. Capital equipment and vehicles tracked for depreciation and Section 179.

---

## Growth Reserve / Fund

- **Table:** `growth_fund_deployments`
- **Schema:** `lib/db/src/schema/growth-fund-deployments.ts`
- **API:** `artifacts/api-server/src/routes/reports.ts` (GET/POST/DELETE `/growth-fund-deployments`)
- **UI:** `artifacts/contractor-app/src/pages/Accounting.tsx`
- **Reports:** Yes — reserve balance and deployment calculations in reports.ts
- **Source of truth:** `growth_fund_deployments`. Tracks how the growth reserve has been spent. The reserve amount itself is calculated live from job profit × growth %.

---

## Businesses / Entity Types

- **Table:** `businesses`
- **Schema:** `lib/db/src/schema/businesses.ts`
- **API:** `artifacts/api-server/src/routes/businesses.ts`
- **UI:** `artifacts/contractor-app/src/pages/BusinessSelector.tsx`, `src/contexts/BusinessContext.tsx`
- **Reports:** Yes — multi-business filtering in reports

### Financial mutation ownership contract

- **Canonical owner:** Every financial create/update route resolves `businessId` through `business-scope.ts`; an omitted selector defaults by the stable `general_contracting` slug.
- **Inheritance:** Job-linked rows inherit the job's canonical owner and reject a conflicting explicit selector. Recurring-generated expenses inherit the recurring template owner. Portal and provider-import rows use their linked job/client owner or General Contracting.
- **Compatibility:** `businessLine` is retained as a read-only compatibility/fallback value for legacy rows. It never overrides a non-null `businessId`, and new writes populate both values.
- **Scope:** All Businesses is a read-only reporting scope. It is never an owner value for a mutation; update, void, rollback, receipt, reversal, and delete boundaries use the resolved owner predicate.
- **Covered ledgers:** expenses, mileage, other income, recurring expenses, subcontractor payments/advances/hours, owner capital, estimated tax payments, assets, growth fund deployments, bank-filed rows, portal rows, Square mirrors, and legacy payments.
- **Source of truth:** `businesses`. Supports parent/child structure (`parentBusinessId`) for shell companies and DBAs.

### Business ownership policy

- **Canonical ownership:** `business_id` on core records; `business_line` is a compatibility fallback for legacy rows.
- **Enforcement:** `artifacts/api-server/src/lib/business-scope.ts` resolves requested read scope and canonical mutation ownership. Mutation writes use a valid explicit selector or the stable `general_contracting` default; job-linked invoices inherit the job owner and reject conflicting explicit ownership. DBA ownership is preserved.
- **Migration:** `lib/db/migrations/0047_business_ownership_backfill.sql` backfills known slugs and emits an inventory of intentionally unassigned rows.

---

## Settings

- **Table:** `settings`
- **Schema:** `lib/db/src/schema/settings.ts`
- **API:** `artifacts/api-server/src/routes/settings.ts`
- **UI:** `artifacts/contractor-app/src/pages/Settings.tsx`
- **Reports:** Yes — reserve %, tax %, growth % read from settings
- **Source of truth:** `settings`. Global business configuration. Rates and percentages must come from here — never hardcoded (Rule 16).

---

## Vehicles

- **Table:** `vehicles`
- **Schema:** `lib/db/src/schema/vehicles.ts`
- **API:** `artifacts/api-server/src/routes/vehicles.ts`
- **UI:** `artifacts/contractor-app/src/pages/Settings.tsx` (vehicle management in settings)
- **Reports:** Not directly queried
- **Source of truth:** `vehicles`. Fleet list used for mileage tracking and fuel cost calculations.

---

## Sub Advances

- **Table:** `sub_advances`
- **Schema:** `lib/db/src/schema/sub-advances.ts`
- **API:** `artifacts/api-server/src/routes/jobs.ts`
- **UI:** `artifacts/contractor-app/src/pages/JobPayroll.tsx`
- **Reports:** Not directly queried
- **Source of truth:** `sub_advances`. Advances against future wages; deducted from net pay in `sub_payment_records`.
- **Rule:** Advances are not expenses. They live in `sub_advances` and are settled through payroll.

---

## Estimated Tax Payments

- **Table:** `estimated_tax_payments`
- **Schema:** `lib/db/src/schema/estimated-tax-payments.ts`
- **API:** `artifacts/api-server/src/routes/estimated-tax-payments.ts`
- **UI:** `artifacts/contractor-app/src/pages/accounting/TaxCalendarTab.tsx`
- **Reports:** Yes — used in tax reserve and estimated tax calculations
- **Source of truth:** `estimated_tax_payments`. Quarterly IRS/state payments recorded here.

---

## Vendor / 1099 Tracking

- **Tables:** `vendors`, `generated_1099s`, `subcontractors`
- **Schemas:** `lib/db/src/schema/vendors.ts`, `lib/db/src/schema/generated-1099s.ts`, `lib/db/src/schema/subcontractors.ts`
- **API:** `artifacts/api-server/src/routes/vendors.ts`, `artifacts/api-server/src/routes/form-1099s.ts`
- **UI:** `artifacts/contractor-app/src/pages/Subcontractors.tsx`, `Settings.tsx`
- **Reports:** Not directly queried in reports.ts
- **Source of truth:** `subcontractors` for worker profiles; `vendors` for non-payroll vendors; `generated_1099s` for filed forms.

---

## CRM / Prospects / Contacts

- **Tables:** `prospects`, `contacts`, `prospect_events`, `prospect_service_visits`, `inquiries`, `featured_clients`, `client_errors`
- **Schemas:** `lib/db/src/schema/prospects.ts`, `contacts.ts`, `prospect-events.ts`, `prospect-service-visits.ts`, `inquiries.ts`, `featured-clients.ts`, `client-errors.ts`
- **API:** `artifacts/api-server/src/routes/prospects.ts`, `contacts.ts`, `clients.ts`, `website.ts`
- **UI:** `artifacts/contractor-app/src/pages/Prospects.tsx`, `AddressBook.tsx`, `Clients.tsx`, `ProspectDrawer.tsx`
- **Reports:** Not a financial ledger; prospect pipeline and service-visit activity may feed dashboard views.
- **Source of truth:** `prospects` owns leads and pipeline state; `contacts` owns reusable people/contact methods; `clients` owns converted customers; event and visit tables own CRM history.
- **Rule:** Do not use `clients` as a prospect staging table or duplicate prospect activity in jobs. Conversion must preserve the prospect-to-client relationship.

## Communications

- **Tables:** `conversations`, `messages`
- **Schema:** `lib/db/src/schema/conversations.ts`, `messages.ts`
- **API:** `artifacts/api-server/src/routes/portal.ts`, `team.ts`, `website.ts`
- **UI:** customer portal and website communication surfaces; no separate accounting UI
- **Reports:** No direct financial impact.
- **Source of truth:** conversation/message records are the communication history; email/SMS/provider delivery state is external integration state.
- **Rule:** Messages are not authoritative customer, invoice, or payment records. Do not create financial ledger rows from a message without an explicit domain action.

## Compliance / Kentucky Filings / Registered Agent

- **Tables:** `compliance_items`, `ky_filing_settings`, `registered_agents`, `registered_agent_tasks`, `access_requests`
- **Schemas:** `lib/db/src/schema/compliance.ts`, `registered-agent.ts`, `access-requests.ts`
- **API:** `artifacts/api-server/src/routes/compliance-items.ts`, `ky-filing-settings.ts`, `registered-agent.ts`, `index.ts` access middleware
- **UI:** `Settings.tsx`, compliance and registered-agent panels
- **Reports:** Compliance status is operational; filing/payment records may be referenced by tax-calendar views but are not expense ledger rows unless explicitly recorded in `expenses`.
- **Source of truth:** compliance tables own obligations, filing configuration, agent details, and access workflow state.
- **Rule:** Compliance completion is not proof of payment. Keep filing status, uploaded documents, and accounting transactions separate.

## Daily Operations / Routing / Trips

- **Tables:** `daily_logs`, `route_stops`, `business_trips`, `quick_charges`, `job_type_benchmarks`
- **Schemas:** `lib/db/src/schema/daily-logs.ts`, `route-stops.ts`, `business-trips.ts`, `quick-charges.ts`, `job-type-benchmarks.ts`
- **API:** `artifacts/api-server/src/routes/daily-logs.ts`, `route-stops.ts`, `trips.ts`, `quick-charges.ts`
- **UI:** `DailyLogs.tsx`, `RoutePlanner.tsx`, `TripPacket.tsx`, `QuickCharge.tsx`
- **Reports:** Route and daily-log activity is operational. `business_trips` is a trip-context system; tax mileage deductions remain owned by `mileage_logs` and the IRS-rate engine.
- **Source of truth:** route stops own planned/visited routing; daily logs own field activity; business trips own trip packets/context; quick charges own small charge records until converted to the applicable invoice/payment flow; `job_type_benchmarks` owns operational estimating benchmarks.
- **Classification:** `business_trips` is compatibility/context-only relative to canonical mileage; it must not become a second mileage ledger.

## Square Payments / External Payment Mirrors

- **Tables:** `square_payments`, `other_income`, `invoices`, `payments`
- **Schemas:** `lib/db/src/schema/square-payments.ts`, `other-income.ts`, `invoices.ts`, `payments.ts`
- **API:** `artifacts/api-server/src/routes/square-webhook.ts`, `square-payments.ts`, `square-transactions.ts`, `square-invoice.ts`, `square-deposit.ts`, `payments.ts`
- **UI:** `SquareTransactions.tsx`, `Invoices.tsx`, `Accounting.tsx`
- **Reports:** `other_income` and paid `invoices` feed revenue reports; `square_payments` is a provider-history mirror and reconciliation source.
- **Source of truth:** invoices own invoice revenue; `other_income` owns explicitly recorded non-invoice cash receipts; Square tables own provider IDs/statuses and must reconcile to one of those records.
- **Classification:** `square_payments` is an external-provider mirror, not a third revenue ledger. `payments` is legacy/compatibility-only for 1099 lookup until its relationship to `sub_payment_records` is resolved.
- **Rule:** A Square webhook must be idempotent and must not create duplicate revenue when an invoice or other-income row already represents the receipt.

## MFH Production / Labor Learning

- **Tables:** `mfh_manufacturers`, `mfh_models`, `mfh_construction_types`, `mfh_pricing_guides`, `mfh_guide_items`, `mfh_guide_addons`, `mfh_client_pricing`, `job_knowledge_records`, `job_knowledge_record_versions`, `job_labor_entries`, `production_service_types`, `production_price_overrides`, `service_addon_prompts`
- **Schemas:** `lib/db/src/schema/mfh.ts`, `jobs.ts`
- **API:** `artifacts/api-server/src/routes/mfh.ts`, `mfh-labor.ts`, `production-service-types.ts`, `service-addon-prompts.ts`
- **UI:** `MfhKnowledgeBase.tsx`, `MfhPanel.tsx`, job pricing and labor panels
- **Reports:** MFH pricing and labor influence job estimates/profit; historical knowledge records are not the accounting ledger.
- **Source of truth:** guide/catalog tables own manufacturer pricing; job records and invoices/expenses own posted job financials; knowledge records own intentionally preserved learning snapshots and versions.
- **Rule:** Do not treat stored MFH gross/net profit as current accounting truth. Use live source-derived calculations and retain snapshot timestamps/drift metadata.

## Bids / Grants / Procurement Sources

- **Tables:** `bid_opportunities`, `bid_capability_profiles`, `bid_business_settings`, `bid_source_catalog`, `bid_source_connections`, `grant_opportunities`, `grant_source_catalog`, `grant_source_connections`
- **Schemas:** `lib/db/src/schema/bid-opportunities.ts`, `bid-profiles.ts`, `bid-sources.ts`, `grants.ts`
- **API:** `artifacts/api-server/src/routes/bids.ts`, `grants.ts`, `integrations.ts`
- **UI:** `BidOpportunities.tsx`, `bids/*`, `Grants.tsx`, `grants/*`
- **Reports:** Pipeline, qualification, and grant activity are operational; awards do not become revenue until an approved invoice/other-income transaction exists.
- **Source of truth:** opportunity tables own imported and scored opportunities; source catalog/connection tables own source configuration and sync status.
- **Rule:** External source data is a prospecting cache, not a contract or revenue ledger. Preserve source IDs and sync timestamps. AI deep-read evidence is stored inside the existing `ai_summary` JSON as sanitized, short-lived audit context; it does not create a parallel source record.

## Job Checklists / Field Evidence

- **Tables:** `job_checklists`, `job_checklist_sections`, `job_checklist_items`, `job_checklist_item_parts`, `job_checklist_item_photos`, `job_checklist_section_notes`, `job_checklist_status_log`, `job_start_photos`, `job_finished_photos`, `checklist_templates`, `checklist_template_sections`, `checklist_template_items`
- **Schemas:** `lib/db/src/schema/job-checklists.ts`
- **API:** `artifacts/api-server/src/routes/checklist-templates.ts`, `job-checklists.ts`
- **UI:** `ChecklistTemplates.tsx`, `JobChecklistPanel.tsx`, job detail pages
- **Reports:** Operational completion and evidence; checklist parts do not replace materials or expenses.
- **Source of truth:** templates own reusable definitions; job checklist tables own the applied job instance, status history, notes, parts, and photos.
- **Rule:** Copying a template creates a job-specific snapshot. Later template edits must not rewrite completed job evidence.

## Website / Marketing / Media

- **Tables:** `website_configs`, `marketing_content`, `website_form_submissions`, `website_media`, `website_media_folders`, `website_page_views`, `portfolio_photos`, `saved_sections`, `deposit_submissions`
- **Schemas:** `lib/db/src/schema/website.ts`, `portfolio-photos.ts`
- **API:** `artifacts/api-server/src/routes/website.ts`, `wix-integration.ts`, `storage.ts`
- **UI:** `website/*`, `PublicSite.tsx`
- **Reports:** Website analytics and form submissions are operational; a submitted inquiry belongs to CRM only after explicit conversion/linking.
- **Source of truth:** website tables own published configuration, content, media metadata, submissions, and analytics; `deposit_submissions` owns website deposit-request records; object storage owns file bytes.
- **Rule:** Public-site content is not a customer or invoice record. Preserve submission IDs when promoting inquiries into prospects.

## Investments

- **Tables:** `investments`, `investment_accounts`, `investment_transfers`, `investment_account_valuations`, `investment_tax_documents`
- **Schema:** `lib/db/src/schema/investments.ts`
- **API:** `artifacts/api-server/src/routes/investments.ts`
- **UI:** `Accounting.tsx` → `InvestmentsTab.tsx`, `InvestmentAccountDetail.tsx`
- **Reports:** Investment balances and valuations are separate from operating P&L; transfers must not be treated as revenue or expense without explicit classification.
- **Source of truth:** investment account, transfer, valuation, and tax-document tables own the investment subsystem.
- **Rule:** Investment classifications are not owner pay or operating expenses by default; preserve provider transaction references and correction history.

## Integrations / Equipment / Crew

- **Tables:** `integration_credentials`, `plaid_connections`, `equipment_inventory`, `equipment_opportunities`, `equipment_sources`, `crew_members`, `crew_certifications`, `dashboard_tasks`
- **Schemas:** `lib/db/src/schema/integration-credentials.ts`, `plaid-connections.ts`, `equipment.ts`, `crew.ts`, `dashboard-tasks.ts`
- **API:** `artifacts/api-server/src/routes/integrations.ts`, `plaid.ts`, `equipment.ts`, `crew.ts`, `dashboard-tasks.ts`
- **UI:** `IntegrationsPage.tsx`, `Banking.tsx`, `FindEquipment.tsx`, `MyEquipment.tsx`, `CrewManagement.tsx`, dashboard task widget
- **Reports:** Plaid transactions are reconciliation inputs only; equipment/crew/task data is operational unless explicitly linked to a ledger record.
- **Source of truth:** each subsystem owns its connection/configuration or operational records; provider APIs remain authoritative for external status.
- **Rule:** Integration caches and opportunity feeds must never silently become a second accounting ledger.

## Registry Review / Unresolved Ownership

- `payments` versus `sub_payment_records`: `sub_payment_records` is canonical payroll; `payments` remains compatibility-only for legacy 1099 reads. Retirement and backfill require a separate approved migration. Follow-up task #1991 tracks aligning 1099 totals.
- `record-owner-draw` and hourly sub auto-expense paths remain documented exceptions to the canonical owner-pay/payroll rules; do not add new callers. Their retirement is tracked separately rather than hidden in this registry.
- `business_trips` versus `mileage_logs`: trips provide context, while mileage owns deductions. Any future shared import must preserve that boundary.
- High-risk unresolved ledger work should be addressed through the existing project task queue before changing source-of-truth rules.

---

## Registry Validation

- **Repeatable check:** run `pnpm run system-registry:check`.
- **Guard:** the check extracts every `pgTable("...")` table from `lib/db/src/schema` and fails if its exact table name is absent from this registry.
- **Review rule:** a failing check requires an architecture-review update before the schema change is considered complete; the script verifies coverage, not ownership decisions.

---

*Last updated: 2026-09-10*
*To update this file, an architecture review must explicitly approve the change.*
