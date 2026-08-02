# BuildPro Accounting Engine Audit

**Audit Date:** 2026-08-02  
**Auditor:** Automated Code Review  
**Scope:** All financial calculation routes in `artifacts/api-server/src/routes/` and supporting libs  
**Accounting Model:** Cash-basis sole proprietorship (income recognized when invoice is paid; expenses recognized when recorded)

---

## 1. Financial Route Inventory

| Route | File | Tables Read | Output |
|-------|------|-------------|--------|
| `GET /api/reports/dashboard` | reports.ts | invoices, expenses, mileage_logs, other_income, jobs, businesses, job_subcontractors, job_sub_hours, owner_capital_entries | Dashboard KPI cards, byBusinessLine breakdown, monthly chart |
| `GET /api/reports/accounting` | reports.ts | invoices, expenses, mileage_logs, subcontractors, settings, other_income, businesses | Year-level accounting summary, city breakdown, estimated taxes |
| `GET /api/reports/profit-loss` | reports.ts | invoices, expenses, mileage_logs, other_income, jobs, job_subcontractors, owner_capital_entries, assets, settings | P&L statement with depreciation |
| `GET /api/reports/year-end` | reports.ts | All financial tables | Accountant-ready year-end report |
| `GET /api/tax-reports/schedule-c` | tax-reports.ts | invoices, expenses, mileage_logs, other_income, payments | Schedule C filing prep |
| `GET /api/estimated-tax-payments` | estimated-tax-payments.ts | invoices, expenses, mileage_logs, other_income | Quarterly tax estimates |
| `GET /api/jobs/:id/profit` | jobs.ts | invoices, expenses, job_sub_hours, sub_payment_records, job_subcontractors | Per-job profit card |
| `GET /api/jobs/profit-summary` | jobs.ts | invoices, expenses, job_sub_hours, sub_payment_records, job_subcontractors | Batch job profit |
| `GET /api/subcontractors` (computeYtd) | subcontractors.ts | sub_payment_records, expenses, payments | YTD sub pay / 1099 threshold |
| `GET /api/owner-capital` | owner-capital.ts | owner_capital_entries, settings | Capital contribution ledger |
| `GET /api/investments/accounts/summary` | investments.ts | investment_accounts, investment_transfers, investment_account_valuations | Investment portfolio |
| `GET /api/plaid/transactions` | plaid.ts | bank_transactions, expenses | Bank reconciliation view |
| `GET /api/dashboard/today` | dashboard.ts | compliance_items, route_stops, prospects, invoices | Operational dashboard |
| `GET /api/dashboard/recent-activity` | dashboard.ts | expenses, invoices, sub_payment_records | Activity feed |
| `GET /api/mileage` | mileage.ts | mileage_logs, expenses, settings | Mileage log |
| `GET /api/recurring-expenses` | recurring-expenses.ts | recurring_expenses, expenses | Recurring template status |
| `GET /api/other-income` | other-income.ts | other_income | Other income list |
| `GET /api/payments` | payments.ts | payments | Legacy direct payments |

---

## 2. Transaction Flow Chains

### 2a. Invoice Payment
1. Invoice created → `invoices_table` (`status="draft"`)
2. Draft → Approved → `status="approved"` (invoice number assigned)
3. Approved → Sent → `status="sent"` (or "overdue")
4. Payment received → `status="paid"`, `amount_paid` updated
5. Appears in: `/api/reports/dashboard` (paid only), `/api/reports/accounting` (paidRevenue), `/api/reports/profit-loss` (paid only), `/api/tax-reports/schedule-c` (**all statuses** — see Bug #1), `/api/estimated-tax-payments` computeTaxData (paid only)

### 2b. Expense Creation
1. Expense created → `expenses_table`
2. If `category="Subcontractor"` and `jobId`+`subcontractorId` set → `syncJobSubPayment()` updates `job_subcontractors.amount_paid`
3. If `jobSubHoursId IS NOT NULL` → auto-linked sub-hour expense (excluded from expense list view and from most calcs via `isNull(jobSubHoursId)` filter)
4. If `category="mileage"` → excluded from net profit calcs; deduction sourced from `mileage_logs.deductionAmount` instead
5. If `excludeFromNetProfit=true` → excluded from net profit (dashboard, accounting)
6. If `countsTowardJobProfit=false` → excluded from job profit, sent to `auditTrailTotal`
7. Reconciliation: `reconcileExpense()` attempts to match to bank transaction (fire-and-forget)

### 2c. Sub Pay-Worker (fixed/allocation subs)
1. POST to pay-worker endpoint → `sub_payment_records` table (only — no longer writes to `expenses`, since Task #892)
2. `job_subcontractors.amount_paid` updated, `payment_status` set to "paid"/"overpaid"
3. `jobs.sub_paid` recomputed via `recomputeSubPaid()`
4. Appears in: `/api/jobs/:id/profit` (via sprRows query on sub_payment_records), `computeYtd` (sub_payment_records branch)
5. **Does NOT appear in:** `/api/reports/profit-loss` contractLabor (which reads expenses only), `/api/tax-reports/schedule-c` contractLabor (which reads expenses + payments table, not sub_payment_records)

### 2d. Hourly Sub Hours
1. POST to `/api/jobs/:jobId/sub-hours` → `job_sub_hours` row
2. `upsertLinkedExpense()` creates/updates `expenses` row with `jobSubHoursId` set, `category="Subcontractor"`
3. `recomputeSubPaid()` + `recomputeSubPaymentStatus()` fire
4. Appears in: `/api/jobs/:id/profit` (hoursLaborCost via job_sub_hours), P&L contractLabor via linked expense, `computeYtd` (expenses branch)
5. `isNull(jobSubHoursId)` filter ensures these auto-expenses don't double-count in reports when job_sub_hours is separately summed

### 2e. Owner Draw
1. Recorded as expense with `category="Owner Draw"` (or "Owner Compensation" / "Owner Withdrawal")
2. NEVER reduces taxable profit in: `/api/reports/dashboard`, `/api/reports/accounting`, `/api/reports/profit-loss`, `/api/tax-reports/schedule-c`
3. Excluded via: `OWNER_PAY_CATS = ["Owner Draw", "Owner Compensation", "Owner Withdrawal"]` filter applied before profit calc
4. Appears in owner equity calc (`undrawnBalance = netProfit - ownerDrawTotal`) but does not flow into P&L or Schedule C deductions
5. **BUG**: `/api/estimated-tax-payments` `computeTaxData()` does NOT exclude owner draws — they reduce `totalExpenses` and therefore increase apparent netProfit (inverted: owner draws reduce netProfit when they shouldn't — see Bug #2)

### 2f. Owner Capital Contribution
1. Recorded in `owner_capital_entries` table (separate from expenses)
2. Never appears in income or expense totals
3. Only surfaced in: owner equity display (`ownerContributionsTotal` in P&L ownerActivity section), `/api/reports/dashboard` (fetched separately to show capital ledger)
4. **Confirmed clean**: capital contributions are fully isolated from P&L

### 2g. Mileage Log
1. Manual log: `mileage_logs` row + auto-created `expenses` row (`category="mileage"`) with amount = miles × rate
2. Imported log: `mileage_logs` row + monthly aggregate expense via `recalcImportExpenses()` (`category="mileage"`)
3. Deduction source: all reports use `mileage_logs.deductionAmount` (stored on the log)
4. Category="mileage" expenses exist purely as an audit trail/ledger; they are excluded from net profit via `filter(e => e.category !== "mileage")` in every profit calculation
5. **Confirmed clean**: no double-counting between mileage_logs and mileage-category expenses in profit calcs

### 2h. Bank Transfer / Investment Transfer
1. Bank transactions sync from Plaid → `bank_transactions` table (`status="unmatched"`)
2. Matched to expense → `status="matched"`, `matched_expense_id` set
3. Filed as investment → `status="investment_transfer"`, linked to `investment_transfers` table
4. Bank transactions are NEVER read by any P&L, tax, or profit calculation — they only appear in the banking reconciliation view
5. Investment transfers flow to `investment_transfers` table → `computeAccountSummary()` → investment portfolio only
6. **Confirmed clean**: transfers never inflate P&L income or expenses

### 2i. Recurring Expense
1. Template stored in `recurring_expenses` table
2. When fired (at creation if start ≤ today, or by cron): creates a normal `expenses` row with `recurring_expense_id` set
3. Subsequent behavior identical to any other expense
4. **Confirmed clean**: no special accounting treatment needed

---

## 3. Double-Counting Audit

### 3a. Sub Labor — Hourly
**Verdict: CLEAN (guarded by jobSubHoursId filter)**

When hours are logged, both a `job_sub_hours` row AND a linked `expenses` row (with `jobSubHoursId` set) are created. Calculations choose one:
- Job profit card: reads `job_sub_hours` directly for `hoursLaborCost`, and filters expenses to `isNull(jobSubHoursId)` — no double count
- P&L contractLabor: reads expenses only, with `ne(category, "mileage")` but no explicit `isNull(jobSubHoursId)` filter in the P&L query — **however** all hourly sub costs ARE already captured via linked expenses, so they appear exactly once
- computeYtd: reads expenses with `isNull(jobSubHoursId)` to exclude auto-linked rows, then reads sub_payment_records separately — no double count

### 3b. Sub Labor — Fixed / Allocation
**Verdict: INCONSISTENCY (fixed/allocation subs undercounted in P&L and Schedule C)**

Post-Task #892 pay-worker writes to `sub_payment_records` only:
- Job profit card: reads `sub_payment_records` for fixed/allocation costs ✓
- computeYtd / 1099 compliance: reads `sub_payment_records` ✓
- P&L contractLabor (`/reports/profit-loss`): reads expenses only — **misses** any fixed/allocation sub payment made via pay-worker after Task #892
- Schedule C contractLabor (`/tax-reports/schedule-c`): reads expenses + `payments` table — **misses** sub_payment_records

This means P&L and Schedule C understate contract labor costs for fixed/allocation subs. See Bug #3.

### 3c. Owner Draws and P&L
**Verdict: CLEAN**

Owner draws appear in `expenses` with `category="Owner Draw"` etc. Every profit calculation explicitly excludes them via the `OWNER_PAY_CATS` filter. They are tracked separately in `ownerDrawTotal` for equity display.

### 3d. Capital Contributions and Revenue
**Verdict: CLEAN**

Owner capital entries in `owner_capital_entries` are never joined into any revenue or expense query. They are only fetched for the owner equity section.

### 3e. Investment Transfers and P&L
**Verdict: CLEAN**

Investment transfers are stored in `investment_transfers` and reflected as `status="investment_transfer"` on bank transactions. No route reads investment transfers as income or expenses.

### 3f. Other Income
**Verdict: CLEAN**

Other income in `other_income_table` is consistently fetched and added to income across dashboard, accounting, P&L, Schedule C, and estimated tax. No double-counting path exists.

---

## 4. Duplicate Calculation Audit

### 4a. Net Profit — 4 Independent Calculations

| Location | Formula | Source |
|----------|---------|--------|
| `/reports/dashboard` | `invoiceRevenue(paid) + otherIncome - (expenses excl. owner draws excl. mileage) - mileageDeduction` | KPI cards |
| `/reports/accounting` | `paidRevenue(invoices+other) - (expenses excl. owner draws excl. mileage) - mileageDeduction - depreciation` | Year accounting summary |
| `/reports/profit-loss` | `grossRevenue(paid) - COGS - operatingExpenses - mileageDeduction - depreciation` | P&L statement |
| `/estimated-tax-payments` computeTaxData | `paidRevenue + otherIncome - expenses(excl. mileage) - mileageDeduction` | Tax estimates |

**Assessment:** The four formulas are largely consistent. Confirmed divergences:
1. `/reports/accounting` and `/reports/profit-loss` deduct depreciation; dashboard and estimated-tax-payments do not. This is **intentional** — the dashboard is a quick operational view; estimated taxes using pre-depreciation profit is a known simplification.
2. `/estimated-tax-payments` does not exclude owner draws (Bug #2).
3. `/reports/dashboard` monthly chart does not exclude owner draws from expenses (Bug #4).

### 4b. Owner Draws — Consistent Exclusion
All main profit routes (dashboard KPI, accounting, P&L) exclude owner draws before computing profit. Exception: `computeTaxData` in estimated-tax-payments.ts.

### 4c. Subcontractor YTD (computeYtd) vs Job Profit (:id/profit)
- `computeYtd`: aggregates from 3 tables (sub_payment_records + expenses(Subcontractor,no-hours-link) + payments) — designed for 1099 threshold tracking
- `jobs/:id/profit`: reads sub_payment_records for fixed/allocation, reads job_sub_hours for hourly costs
- These serve different purposes (lifetime payments vs. this-job costs) and are correctly implemented independently

### 4d. Mileage Deduction — Two Source References
- All reports read `mileage_logs.deductionAmount` (stored, pre-computed per-log)
- `mileage.ts` summary endpoint independently computes `businessMiles * rate` for the summary card
- These can diverge if the settings rate was changed after logs were created (stored deductionAmount uses rate-at-creation-time, summary card uses current rate)
- **Assessment:** Minor display-only inconsistency; stored deductionAmount is correct for tax purposes

---

## 5. Owner Accounting Audit

### Owner Capital (money invested into the business)
- **Table:** `owner_capital_entries`
- **Source:** POST `/api/owner-capital` — stores date, amount, description
- **Positive entries** = contributions into business; **negative entries** = return of capital
- **Computation:** fetched directly; no formula applied
- **Isolation:** never joined to expenses, invoices, or P&L

### Owner Pay / Draws (money paid out)
- **Table:** `expenses` with `category ∈ ["Owner Draw", "Owner Compensation", "Owner Withdrawal"]`
- **Excluded from:** all P&L deductions, Schedule C, tax estimates (except Bug #2)
- **Tracked separately as:** `ownerDrawTotal` in dashboard and accounting summary
- **Isolation:** clearly separated in every financial formula

### Owner Equity (capital + retained profit)
- **Computed as:** `ownerContributionsTotal + retainedNetProfit - ownerDrawTotal`
- **Components:** `owner_capital_entries` (contributions), `netProfit` from P&L, `ownerDrawTotal` from expenses
- **Note:** the P&L `ownerActivity` section returns these separately; the frontend computes equity

### Cross-contamination Check
**CLEAN.** Owner capital entries never appear as income. Owner draws never reduce taxable net profit in P&L or Schedule C. Equity components (contributions + profit - draws) each have a distinct data source.

---

## 6. Banking Audit

### Bank Transfers Excluded from P&L
**CONFIRMED CLEAN.**

Bank transactions from Plaid live in `bank_transactions` table. No financial report (dashboard, P&L, Schedule C, accounting, estimated taxes) reads from `bank_transactions`. The banking reconciliation view (`GET /api/plaid/transactions`) only reads bank transactions for display — it never writes to income or expense tables.

### Bank Transaction Statuses
- `unmatched`: pending reconciliation — not counted anywhere in P&L
- `matched`: linked to an expense or invoice — the underlying expense/invoice appears in P&L (as it always would), the bank_transaction link is audit trail only
- `investment_transfer`: linked to investment_transfers — investment amounts never flow to P&L
- `transfer` (implicit): bank-to-bank transfers can be manually classified; no auto-categorization into income

### Balance Display
Cash balance is from `plaid_connections.cached_balance_current` (Plaid API, 30-day cache). This is a real-time balance read, not derived from transactions — it cannot inflate P&L.

---

## 7. Job Profit Audit

### Formula (jobs.ts `:id/profit`)
```
netProfit = collected - jobExpenses - subLaborCost - allocPaid
where:
  collected       = sum(invoices.total where status='paid')
  jobExpenses     = sum(expenses.amount where jobId=X, no-hours-link, category≠'Owner Draw',
                        category≠'Subcontractor', countsTowardJobProfit≠false)
  hoursLaborCost  = sum(job_sub_hours.hours × rateSnapshot)
  sprFixedCost    = sum(sub_payment_records.amount where compensationType='fixed') [new ledger]
  fallback        = flatSubCost if no hours and no SPR records (legacy Subcontractor expenses)
  accruedBonus    = sum(job_subcontractors.accrued_bonus)
  subLaborCost    = hoursLaborCost + max(sprFixedCost, fallback) + accruedBonus
  allocPaid       = sum(sub_payment_records.amount where compensationType='allocation')
  auditTrailTotal = sum(expenses where countsTowardJobProfit=false) [excluded from profit]
```

### Component Verification
- **Materials/overhead job expenses**: enter `jobExpenses` once (via expenses.jobId filter)
- **Hourly sub labor**: enters `hoursLaborCost` via job_sub_hours; linked expense is category="Subcontractor" and is moved to `flatSubCost` bucket, then zeroed out by `nonHoursCost = sprFixedCost > 0 ? sprFixedCost : (hoursLaborCost > 0 ? 0 : flatSubCost)` — prevents double-count ✓
- **Fixed sub labor**: enters `sprFixedCost` from sub_payment_records ✓
- **Allocation sub labor**: enters `allocPaid` from sub_payment_records ✓
- **Bonuses**: accrued bonuses added to subLaborCost ✓
- **Travel/audit expenses (countsTowardJobProfit=false)**: diverted to `auditTrailTotal`, excluded from profit formula ✓

**Verdict: Job profit formula is CLEAN for per-job view.**

---

## 8. Tax Report Reconciliation

### Schedule C vs P&L

| Line | Schedule C Source | P&L Source | Match? |
|------|------------------|-----------|--------|
| Gross Receipts (Line 1) | `sum(invoices.total)` **ALL statuses** | `sum(invoices.total where status='paid')` | **NO — BUG #1** |
| Other Income | `sum(other_income.amount)` | `sum(other_income.amount)` | ✓ |
| Contract Labor (Line 11) | expenses(Subcontractor) + payments table | expenses(Subcontractor) | Diverges (payments table) |
| Mileage (Line 9) | `sum(mileage_logs.deductionAmount)` + Fuel/Travel expenses | `sum(mileage_logs.deductionAmount)` | Diverges (Fuel/Travel added in Sched C) |
| All other expenses | expenses by category | expenses by category | ✓ |

### Estimated Tax vs P&L Net Profit

`computeTaxData` formula:
```
netProfit = (paidRevenue + otherIncome) - totalExpenses(no mileage) - mileageDeduction
```

P&L formula:
```
netProfit = grossRevenue(paid) + otherIncome - COGS - operatingExpenses - mileageDeduction - depreciation
```

Divergences:
1. `computeTaxData` does not deduct depreciation (conservative — estimates tax on higher profit)
2. `computeTaxData` does not exclude owner draws from totalExpenses **(Bug #2)**

---

## 9. Dashboard Card Sourcing

| Card | Source Route | Consistent with Reports? |
|------|-------------|--------------------------|
| Revenue | `/api/reports/dashboard` | Same invoices + other_income query as P&L ✓ |
| Expenses | `/api/reports/dashboard` | Same expenses query as P&L ✓ |
| Net Profit | `/api/reports/dashboard` | Same formula as P&L (minus depreciation, intentional) ✓ |
| Outstanding Invoices | `/api/reports/dashboard` | status="sent" filter, same as P&L ✓ |
| Overdue Invoices | `/api/dashboard/today` | status="overdue" filter ✓ |
| Tax Reserve (estimated taxes) | `/api/reports/accounting` | Derived from same netProfit formula ✓ |
| Monthly Revenue Chart | `/api/reports/dashboard` (monthlyRevenue loop) | Expenses NOT filtered to exclude owner draws **(Bug #4)** |
| Subcontractor Owed/Paid | `/api/reports/dashboard` | job_subcontractors query, consistent with job profit ✓ |

---

## 10. Confirmed Bugs

---

### BUG #1 — Schedule C Gross Receipts Includes All Invoice Statuses (HIGH SEVERITY)
**File:** `artifacts/api-server/src/routes/tax-reports.ts`, line ~163  
**Description:** The Schedule C gross receipts query has no status filter. It sums `invoicesTable.total` for all invoices (draft, sent, overdue, cancelled, paid). On a cash basis, only paid invoices should count.  
**Impact:** Schedule C overstates gross income by the amount of unpaid and cancelled invoices, potentially leading to over-payment of taxes.  
**Fix:** Add `eq(invoicesTable.status, "paid")` to the WHERE clause.

---

### BUG #2 — Estimated Tax `computeTaxData` Includes Owner Draws in Expenses (MEDIUM SEVERITY)
**File:** `artifacts/api-server/src/routes/estimated-tax-payments.ts`, line ~105  
**Description:** `computeTaxData` does not exclude owner draws (category="Owner Draw", "Owner Compensation", "Owner Withdrawal") from `totalExpenses`. Owner draws are equity distributions, not deductible business expenses. Every other net profit calculation excludes them.  
**Impact:** If the owner has taken draws, estimated taxes are computed on a lower-than-correct net profit → estimated quarterly payments are understated.  
**Fix:** Add owner draw category exclusion before reducing totalExpenses.

---

### BUG #3 — P&L and Schedule C Miss Fixed/Allocation Sub Payments (MEDIUM SEVERITY)
**File:** `artifacts/api-server/src/routes/reports.ts` (profit-loss), `artifacts/api-server/src/routes/tax-reports.ts` (schedule-c)  
**Description:** Post-Task #892, pay-worker records fixed and allocation sub payments to `sub_payment_records` only, not to `expenses`. The P&L reads only `expenses` for contractLabor; Schedule C reads `expenses + paymentsTable` (not sub_payment_records). The per-job profit card correctly reads sub_payment_records, but the aggregate P&L and Schedule C do not.  
**Impact:** P&L and Schedule C understate contract labor costs for any fixed/allocation sub payments made via the current pay-worker workflow.  
**Fix (recommended approach):** The P&L profit-loss route should also sum `sub_payment_records` (non-reversal, fixed/allocation compensation type) and add to contractLabor. Similarly for Schedule C. See the note in the P&L code about this being intentional for hourly subs (which auto-create expenses) — that guard still applies; only fixed/allocation SPR records need to be added.

---

### BUG #4 — Monthly Revenue Chart Expenses Include Owner Draws (LOW SEVERITY)
**File:** `artifacts/api-server/src/routes/reports.ts`, monthly revenue loop (~line 234)  
**Description:** The monthly chart loop computes `mo_expenses = monthlyExp.filter(e => e.category !== "mileage")`. Owner draw categories are not excluded, so the monthly expense bars (and derived profit) are inflated by owner draws.  
**Impact:** Monthly chart shows lower profit than the P&L for the same period. Display-only issue.  
**Fix:** Add owner draw exclusion to the monthly expense filter.

---

## 11. Duplicate Logic Catalog

| Logic | Locations | Status |
|-------|-----------|--------|
| Net profit formula | dashboard, accounting, profit-loss, estimated-tax | **Intentional duplication** — each endpoint serves a different caller with slightly different scope (depreciation, period range, business line filter). Consolidating into a shared helper would be beneficial but is not causing current bugs. |
| Owner draw exclusion filter | dashboard, accounting, profit-loss, schedule-c | **Inconsistency** — estimated-tax-payments is missing it (Bug #2) |
| Mileage rate lookup | irs-rates.ts, mileage.ts (inline array) | **Duplication** — `mileage.ts` has its own `getIrsRateForDate()` function duplicating `irs-rates.ts`. The inline array in mileage.ts includes 2026 but not all years. Risk: rates could diverge. Recommend consolidating to use `getIrsMileageRate()` from irs-rates.ts. |
| Invoice status "paid" filter | dashboard, accounting, profit-loss, estimated-tax | **Correct in all except Schedule C** (Bug #1) |
| Business line WHERE builder | dashboard, accounting, profit-loss, year-end, schedule-c | **Intentional duplication** — each route builds `blWhere` locally because the Drizzle ORM pattern requires a closure over the column reference |

---

## 12. Fixes Implemented

The following confirmed bugs are fixed in this commit:

- **Bug #1**: Schedule C status filter added
- **Bug #2**: Estimated tax owner draw exclusion added  
- **Bug #4**: Monthly chart owner draw exclusion added

**Bug #3** (P&L/Schedule C missing sub_payment_records) is documented here but deferred to a follow-up task because the correct fix requires careful query design to avoid re-introducing double-counting for the hourly sub case, and should be validated end-to-end before shipping.

---

## 13. Recommendations (Not Yet Implemented)

1. **Consolidate mileage rate source**: Remove inline rate array from `mileage.ts` and use `getIrsMileageRate()` from `irs-rates.ts`
2. **Fix Bug #3**: Add `sub_payment_records` (fixed/allocation, non-reversal) to P&L contractLabor and Schedule C Line 11 totals
3. **Shared `computeNetProfit` helper**: A single server-side function that accepts a period + business line and returns netProfit, mileageDeduction, ownerDrawTotal, and otherIncome would eliminate the four independent implementations and prevent future drift
4. **Allocation split pool cash basis**: `allocation.ts` uses all invoices regardless of status. If cash-basis consistency is required, filter to paid invoices
5. **Schedule C sub payment sources**: Schedule C currently adds from `paymentsTable` separately from expense-category Subcontractor rows. The `paymentsTable` is a legacy/manual payment flow. Consider whether any payments exist in both places; if so, deduplicate or document the allowed overlap
