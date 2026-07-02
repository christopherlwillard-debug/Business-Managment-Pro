---
name: P&L double-count root cause
description: The profit-loss report sums both expensesTable (Subcontractor category) AND job_subcontractors.amount_paid — two separate paths that can both count the same sub labor cost.
---

`GET /api/reports/profit-loss` folds BOTH sources into `contractLabor`:
1. All expenses from `expensesTable` where category maps to contractLabor
2. `job_subcontractors.amount_paid` where `paid_date` is in the report year

`computeYtd()` (sub portal YTD, 1099 alerts) also sums both: expensesTable + paymentsTable + job_subcontractors.amount_paid.

**Why this matters:** If someone logs sub hours AND separately marks the sub as paid on the job card (setting amount_paid), both paths count the same dollar — double count. Similarly if they manually add a Subcontractor expense AND the amount_paid is set.

**The fix applied:** Auto-create expense from hours so users never need to manually add it. The `job_subcontractors.amount_paid` path still exists for flat-rate subs marked paid on the job card — don't remove it without ensuring flat-rate flows have their own expense creation.

**Job-level P&L and allocation subs (July 2026):** The job profit routes (`/:id/profit` and `/profit-summary`) group `sub_payment_records` by `job_subcontractors.compensationType`. `subLaborCost` must stay hourly + fixed ONLY — Pay Breakdown consumes it via `hourlyWorkers = max(subLaborCost, hourlyFixedCost)` and treats allocation subs as a profit split, not labor. Allocation payouts are returned as a separate `allocPaid` field and subtracted from `netProfit` (shown as "Split Payouts" in the UI).
**Why:** Merging allocation payments into subLaborCost would corrupt Pay Breakdown's split math, which the user explicitly wants unchanged. Keeping them separate fixes netProfit without touching split semantics.
**How to apply:** Any new consumer of job profit data must decide: labor-style costs → subLaborCost; %-split payouts → allocPaid. Never fold allocPaid into subLaborCost. The legacy fallback (unlinked 'Subcontractor' expenses when sprFixed=0) only covers pre-ledger jobs — verified in prod those have zero SPR rows, so no double count.
