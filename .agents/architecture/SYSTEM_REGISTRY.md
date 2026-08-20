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

## Owner Pay

- **Table:** `owner_capital_entries`
- **Schema:** `lib/db/src/schema/owner-capital.ts`
- **API:** `artifacts/api-server/src/routes/owner-capital.ts`
- **UI:** `artifacts/contractor-app/src/pages/Accounting.tsx` → Owner Pay Dashboard
- **Reports:** Yes — `artifacts/api-server/src/routes/reports.ts` (ownerCapitalEntriesTable)
- **Source of truth:** `owner_capital_entries`. Job-linked payments carry a nullable `job_id`. The job Pay Breakdown tab filters by `job_id`; the Accounting page shows all entries.
- **Rule:** Every owner pay record lives here. No other table may store owner withdrawals. (ADR-001)

---

## Expenses

- **Table:** `expenses`
- **Schema:** `lib/db/src/schema/expenses.ts`
- **API:** `artifacts/api-server/src/routes/expenses.ts`
- **UI:** `artifacts/contractor-app/src/pages/Expenses.tsx`
- **Reports:** Yes — heavily used across P&L, tax, and job profit calculations
- **Source of truth:** `expenses`. All business operating costs (materials purchases, fuel, tools, supplies, etc.) live here. Subcontractor payroll and owner pay do NOT go here.
- **Rule:** Do not write payroll, owner draws, or capital transactions to this table.

---

## Mileage

- **Tables:** `mileage_logs`, `mileage_imports`
- **Schema:** `lib/db/src/schema/mileage.ts`
- **API:** `artifacts/api-server/src/routes/mileage.ts`
- **UI:** `artifacts/contractor-app/src/pages/Mileage.tsx`
- **Reports:** Yes — mileage deduction in tax reports (`mileageLogsTable`)
- **Source of truth:** `mileage_logs` for individual trips; `mileage_imports` tracks import batches. Imported trips create one expense per month via `expenses.mileage_import_id`.
- **Rule:** Do not store mileage costs directly in expenses as line items — use the mileage engine.

---

## Subcontractor Payroll

- **Tables:** `sub_payment_records` (ledger), `subcontractors` (profiles), `job_subcontractors` (job assignments), `job_sub_hours` (hourly time logs), `sub_advances` (advance payments)
- **Schemas:** `lib/db/src/schema/sub-payment-records.ts`, `subcontractors.ts`, `job-subcontractors.ts`, `job-sub-hours.ts`, `sub-advances.ts`
- **API:** `artifacts/api-server/src/routes/subcontractors.ts`, `artifacts/api-server/src/routes/jobs.ts`
- **UI:** `artifacts/contractor-app/src/pages/Subcontractors.tsx`, `artifacts/contractor-app/src/pages/JobPayroll.tsx`
- **Reports:** Indirect — job-subcontractor joins used in P&L and labor cost calculations
- **Source of truth:** `sub_payment_records` is the sole payroll ledger. Pay recorded here; advances in `sub_advances`. (ADR-002)
- **Rule:** Never write subcontractor pay to the `expenses` table. `sub_payment_records` is the authoritative payroll ledger.

---

## Invoices

- **Table:** `invoices`
- **Schema:** `lib/db/src/schema/invoices.ts`
- **API:** `artifacts/api-server/src/routes/invoices.ts`
- **UI:** `artifacts/contractor-app/src/pages/Invoices.tsx`
- **Reports:** Yes — revenue, collected, outstanding calculations in reports.ts
- **Source of truth:** `invoices`. All revenue originates here. Dashboard, P&L, and tax calculations all derive revenue from invoices.
- **Rule:** Revenue must always be calculated from invoices — never hardcoded or duplicated into another table.

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

---

## Clients / Customers

- **Table:** `clients`
- **Schema:** `lib/db/src/schema/clients.ts`
- **API:** `artifacts/api-server/src/routes/clients.ts`
- **UI:** `artifacts/contractor-app/src/pages/Clients.tsx`
- **Reports:** Yes — joined to jobs and invoices in reports
- **Source of truth:** `clients`. One record per customer. Prospects live elsewhere (CRM/prospect system).

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
- **Source of truth:** `businesses`. Supports parent/child structure (`parentBusinessId`) for shell companies and DBAs.

### Business ownership policy

- **Canonical ownership:** `business_id` on core records; `business_line` is a compatibility fallback for legacy rows.
- **Enforcement:** `artifacts/api-server/src/lib/business-scope.ts` resolves the requested business and scoped route parameters reject records from another business.
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

*Last updated: 2026-08-05*  
*To update this file, an architecture review must explicitly approve the change.*
