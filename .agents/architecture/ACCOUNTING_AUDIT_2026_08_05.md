# Accounting Audit Report
**Date:** 2026-08-05  
**Auditor:** Replit Agent (read-only, no code changes)  
**Governing Standard:** Architecture Constitution v1.0 (`.agents/architecture/CONSTITUTION.md`)  
**Scope:** All financial data flows — income, expenses, mileage, owner capital, subcontractor pay, taxes, growth reserve, and reporting aggregation.

---

## Executive Summary

The accounting layer contains **3 critical findings**, **5 high findings**, and **6 medium findings**. The most dangerous issues are: (1) estimated taxes shown in the UI never subtract actual payments made, giving the user a permanently overstated tax liability; (2) subcontractor 1099 YTD totals are assembled from three separate tables with no reconciliation guarantee, meaning 1099 figures can silently drift; and (3) the growth reserve percentage is hardcoded in four independent locations, none of which read the user-configurable setting.

---

## Critical Findings

### C-1 — Estimated Tax Payments Do Not Reduce Displayed Tax Liability
**Constitution Rules violated:** Rule 4 (One Calculation Engine), Rule 38 (Config Over Code)  
**File:** `artifacts/api-server/src/routes/reports.ts` (tax calculation section)

The `estimated_tax_payments` table exists and is queried, but its rows are used **only for display** (showing what has been paid to date). The computed tax liability displayed in the UI — federal, state, and OCC — is always the **gross estimate** regardless of how many quarterly payments have been made.

**Effect:** A user who has paid $8,000 in quarterly taxes still sees the full gross tax liability. There is no reduction, no "remaining owed" figure. Any business decision made from the tax dashboard is based on overstated liability.

**Hardcoded tax rates (also violating Rule 38):**
- SE tax base multiplier: `0.9235`
- SE tax rate: `0.153`
- Federal estimate: `0.22`
- KY state: `0.04`
- Owensboro OCC: `0.0139`

All five are literals in `reports.ts`. No setting exists for any of them. The OCC rate (city occupational tax) is particularly risky — it is jurisdiction-specific and can change by ordinance.

---

### C-2 — Subcontractor 1099 YTD Is a Triple-Ledger with No Reconciliation
**Constitution Rules violated:** Rule 8 (One Financial Ledger), Rule 1 (Single Source of Truth)  
**File:** `artifacts/api-server/src/routes/subcontractors.ts`, `computeYtd()` (lines 37–87)

`computeYtd()` sums **three independent sources** to produce the YTD total used for 1099 threshold checking:

1. `sub_payment_records` — the primary sub payment ledger (post-Task-#892)
2. `expenses` WHERE `category = 'Subcontractor'` AND `jobSubHoursId IS NULL` — legacy flat sub expenses that were not migrated
3. `payments` table — a third parallel ledger for certain payment flows

No reconciliation check exists. If a payment appears in two of the three sources (e.g., a legacy expense row that was not deleted when a `sub_payment_record` was created), it will be double-counted in the 1099 total. Conversely, if a payment exists in one source and a deletion cascades incorrectly, it disappears from the total silently.

**Effect:** 1099 amounts shown to the user and used for the $600/$2,000 threshold checks may be wrong. The IRS threshold conflict (see M-3) compounds this risk.

---

### C-3 — Growth Reserve Percentage Is Hardcoded in Four Independent Locations
**Constitution Rules violated:** Rule 38 (Config Over Code), Rule 4 (One Calculation Engine), Rule 42 (No Dead Settings)  
**Files:** `artifacts/api-server/src/routes/allocation.ts:13`, `artifacts/api-server/src/routes/reports.ts` (4 occurrences)

```
allocation.ts:13   → const GROWTH_RESERVE_PCT = 0.05
reports.ts:1427    → const GROWTH_PCT = 0.05
reports.ts:1513    → const GROWTH_PCT = 0.05
reports.ts:1677    → const GROWTH_PCT = 0.05
reports.ts:1844    → const GROWTH_PCT = 0.05
```

`settings.growthReservePct` exists in the database schema and is editable in the Settings UI. It has **zero effect** on any financial calculation. The four hardcoded constants are used in four different calculation contexts:
- Reserve summary: applies growth to `afterSubs` (revenue minus sub labor)
- Job-card allocation pool: via `computeAllocationSplitPool`
- Dashboard growth reserve display
- Year-end report growth reserve

Each context uses 5% silently. The user believes changing the setting changes the reserve; it does not.

---

## High Findings

### H-1 — `other_income` Is an Unregistered Parallel Revenue Source
**Constitution Rules violated:** Rule 8 (One Financial Ledger), Rule 1 (Single Source of Truth)  
**Files:** `artifacts/api-server/src/routes/reports.ts` (lines 92–93, 399–401, 1140–1143), Square webhook handler

`other_income` rows are included in revenue in: the dashboard, accounting P&L, year-end report, tax calculations, and monthly chart — all five contexts. It is **not** included in per-job profit (`GET /api/jobs/:id/profit`). This asymmetry means:
- Total reported revenue ≠ sum of job revenues + other income (job profit is missing the other_income component)
- Square webhook creates `other_income` rows for unrecognized payments and website deposits; it attempts to match existing invoices first, but race conditions or manual entries can still produce double-counted rows

`other_income` is not registered in `SYSTEM_REGISTRY.md`. No audit trail exists for its rows beyond a hard-delete pattern.

---

### H-2 — Client Controls `countsTowardJobProfit` Classification
**Constitution Rules violated:** Rule 35 (No Hidden Business Logic), Rule 16 (Validate at the Boundary)  
**File:** `artifacts/api-server/src/routes/expenses.ts:213`

`POST /expenses` accepts `countsTowardJobProfit` directly from the client payload. The server does **not** override or validate it against the expense category. The classification that determines whether an expense appears in job profit or the audit-trail bucket is entirely client-decided.

**Effect:** A bug or tampering in the frontend can silently reclassify expenses, altering job profit figures without any server-side guard. The `isTravelCategory()` logic that should enforce this classification lives in `Expenses.tsx` (a React component), not in the API route.

---

### H-3 — Mileage Deduction Uses Stored Rates, Not Live Recalculation
**Constitution Rules violated:** Rule 9 (No Stored Calculations), Rule 1 (Single Source of Truth)  
**File:** `artifacts/api-server/src/routes/mileage.ts`

Two parallel mileage paths exist:

| Path | Rate source | Stored value |
|---|---|---|
| Manual log | `settings.mileageRate` at log time | `mileage_logs.deductionAmount` |
| Import batch | `getIrsRateForDate()` from hardcoded table | `mileage_logs.deductionAmount` (monthly) |

Reports sum the stored `deductionAmount`. If a manual log was created when the IRS rate was $0.655 and the rate later changes to $0.67, the stored deduction is permanently wrong. There is no recalculation path.

The IRS rate table itself (`mileage.ts:26–36`) is hardcoded — it will become incorrect when IRS publishes new rates and the code is not updated.

---

### H-4 — Hard Delete on All Financial Records
**Constitution Rules violated:** Rule 40 (Immutable Records)  
**Files:** `expenses.ts:391`, `invoices.ts` (draft path), `owner-capital.ts:118`, `other_income` (implicit)

All financial records support hard delete:
- `expenses` — unconditional hard delete at line 391
- `invoices` — draft invoices hard-deleted; non-draft go through status transitions (`cancelled` is the closest to a void, but no correction record is created)
- `owner_capital_entries` — hard delete at line 118
- `other_income` — no soft-delete pattern

**Effect:** Deleting an expense that was already included in a tax estimate or P&L snapshot leaves no audit trail. A cancelled invoice creates no correcting entry. There is no way to reconstruct the financial state as of a historical date if records have been deleted.

---

### H-5 — Meal Expense 50% Split Is Hardcoded
**Constitution Rules violated:** Rule 38 (Config Over Code)  
**File:** `artifacts/api-server/src/routes/expenses.ts:185–186`

The IRS meal deductibility split is hardcoded as `0.5` (50%). The deductible amount is computed as `amount * 0.5` at save time and stored. The rate is not configurable and is not referenced from any setting. If the IRS rate changes (it has changed in the past — e.g., 100% during COVID relief years), all existing stored meal deductions will be wrong and there is no recalculation path.

---

## Medium Findings

### M-1 — `estimated_tax_payments` Table Has No Effect on Tax Estimates
*(Supporting detail for C-1)*  
The table is queried in `reports.ts` and its rows are surfaced in the UI as "payments made." The computed estimate (`estimatedTax`) is never reduced by the sum of `estimated_tax_payments.amount`. The UI shows "Estimated Tax" and "Payments Made" as separate rows with no "Remaining Owed" derived field.

---

### M-2 — Square Webhook Double-Count Risk
**Constitution Rules violated:** Rule 8 (One Financial Ledger)  
**File:** Square webhook handler

The Square webhook attempts to match incoming payments against existing invoices before creating an `other_income` row. However, if a payment arrives before the invoice is created (race condition), or if the match fails on an edge case (partial payment, currency rounding), the revenue is recorded twice: once as an `other_income` row and once when the invoice is later marked paid. No reconciliation job exists to detect duplicates after the fact.

---

### M-3 — 1099 Threshold Conflict: $2,000 vs. $600
**Constitution Rules violated:** Rule 1 (Single Source of Truth), Rule 38 (Config Over Code)  
**Files:** `artifacts/api-server/src/routes/form-1099s.ts` (hardcodes `THRESHOLD = 2000`), `artifacts/api-server/src/routes/reports.ts` (defaults to 600)

Two routes apply different 1099 thresholds:
- `form-1099s.ts`: uses $2,000 as the cutoff
- `reports.ts`: uses $600 (the IRS statutory threshold)

A subcontractor paid $1,500 will appear on the 1099 form list but not in the reports threshold warning, or vice versa, depending on which screen the user consults. Neither threshold is configurable.

---

### M-4 — Profit Calculation Asymmetry: `other_income` Excluded from Job Profit
**Constitution Rules violated:** Rule 4 (One Calculation Engine)  
**File:** `artifacts/api-server/src/routes/jobs.ts` (profit endpoint)

`GET /api/jobs/:id/profit` does not include any `other_income` rows associated with a job. The dashboard and P&L report do include `other_income` in total revenue. This means:
- `sum(job.profit)` across all jobs ≠ `totalRevenue - totalExpenses` from the P&L
- The gap equals the total of all `other_income` rows

---

### M-5 — Owner Capital Legacy Seed on First Access
**Constitution Rules violated:** Rule 9 (No Stored Calculations), Rule 40 (Immutable Records)  
**File:** `artifacts/api-server/src/routes/owner-capital.ts`

On the first `GET /owner-capital` request that has no `jobId` filter and finds an empty ledger, the route auto-migrates from `settings.calculatorDefaults.ownerPersonalInvestment`. This seed runs silently with no user notification, no confirmation step, and no record that the migration occurred. If a user intentionally starts with an empty ledger, the seed will populate it with stale data.

---

### M-6 — Mileage Import Creates One Expense Per Month Per Batch
**Constitution Rules violated:** Rule 8 (One Financial Ledger)  
**File:** `artifacts/api-server/src/routes/mileage.ts` (`recalcImportExpenses()`)

Import-path mileage creates one `expenses` row per calendar month via `mileage_import_id`, while manual-path mileage creates one `expenses` row per trip via `expenseId`. The two paths produce structurally different expense records for what is economically the same deduction type. The P&L and expense list merge them without indicating which path produced the row. This makes per-trip audit reconstruction impossible for import-path mileage.

---

## Summary Table

| ID | Severity | Rule(s) | One-Line Description |
|----|----------|---------|---------------------|
| C-1 | Critical | 4, 38 | Estimated tax payments never reduce displayed liability |
| C-2 | Critical | 8, 1 | Sub 1099 YTD assembled from 3 tables with no reconciliation |
| C-3 | Critical | 38, 4, 42 | Growth reserve % hardcoded in 5 places; setting has no effect |
| H-1 | High | 8, 1 | `other_income` is an unregistered parallel revenue source |
| H-2 | High | 35, 16 | Client controls `countsTowardJobProfit`; server does not validate |
| H-3 | High | 9, 1 | Mileage deduction stored at save-time rate; not recalculated |
| H-4 | High | 40 | Hard delete on all financial records; no void/correction pattern |
| H-5 | High | 38 | Meal 50% split hardcoded; not recalculated if IRS rate changes |
| M-1 | Medium | — | `estimated_tax_payments` table rows not subtracted from tax estimate |
| M-2 | Medium | 8 | Square webhook can double-count revenue on race conditions |
| M-3 | Medium | 1, 38 | 1099 threshold: $2,000 in form route vs. $600 in reports route |
| M-4 | Medium | 4 | `other_income` excluded from job profit, included in P&L — asymmetric |
| M-5 | Medium | 9, 40 | Owner capital auto-seeds silently from stale setting on first access |
| M-6 | Medium | 8 | Import mileage (1 expense/month) vs. manual (1 expense/trip) — mixed ledger |

---

## Top Remediation Priorities

1. **C-1 (tax payments)** — Show "Remaining Owed" by subtracting `sum(estimated_tax_payments.amount)` from computed liability. This is a UI-level calculation change, not a schema change. Highest user-visible impact.

2. **C-2 (triple-ledger sub YTD)** — Consolidate `computeYtd()` to read from `sub_payment_records` only (the authoritative ledger post-Task-#892). Audit whether any legacy `expenses` or `payments` rows still exist that have not been migrated; if yes, run a one-time migration and delete the dual-read paths.

3. **H-2 (client-controlled classification)** — Move `isTravelCategory()` and the `countsTowardJobProfit` override logic from `Expenses.tsx` into the `POST /expenses` route so the server enforces classification regardless of client payload.

---

*This report is read-only. No code was changed during the audit. All line numbers reflect the codebase state as of 2026-08-05.*
