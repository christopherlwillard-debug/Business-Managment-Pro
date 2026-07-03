---
name: Travel audit-trail flag
description: countsTowardJobProfit=false links expense to job for tax records without reducing job profit; covers categories, auto-default logic, UI toggle, and tax mapping.
---

# Travel audit-trail expense flag

## The rule
`expenses.counts_toward_job_profit` (boolean, NOT NULL DEFAULT true) controls whether a job-linked expense counts against job P&L.

- `true` (default) — normal expense: reduces jobExpenses and netProfit
- `false` — audit-trail only: appears in `auditTrailTotal` on the profit response, not in `jobExpenses` or `netProfit`

**Why:** Contractors need to document business travel for IRS purposes by linking it to a specific job (client, location, purpose) but the travel cost is personal/overhead and must not reduce the quoted job profit.

**How to apply:**
- Any new expense form with a job selector should show the "Tax audit trail only" toggle when jobId is set and category ≠ "Owner Draw"
- Travel categories auto-default the toggle to `false` when a job is selected: Travel/Lodging, Meals, Parking/Tolls, Fuel/Travel
- `jobs.ts` single-job profit: loop routes `countsTowardJobProfit === false` rows to `auditTrailTotal` instead of `jobExpenses`; `auditTrailTotal` is included in the response but NOT subtracted from netProfit
- `jobs.ts` batch profit-summary: skip `countsTowardJobProfit === false` rows entirely (no per-job audit total in the batch path — not needed for job card display)

## Tax mapping (tax-reports.ts)
- Travel/Lodging → `travelLodging` → Sch C Line 24a (100% deductible)
- Meals → `mealsDeductible` → Sch C Line 24b (50% deductible; the 0.5 multiplier is applied in the accumulation loop so the stored amount is already the deductible portion)
- Parking/Tolls → `carTruck` → Sch C Line 9 (same as Fuel/Travel)

## UI pattern
- Badge "Audit Trail" (blue) on expense list rows where countsTowardJobProfit === false
- Jobs financials panel: "Travel & Audit Docs" blue card appears when auditTrailTotal > 0, with label "Linked for tax records — not deducted from profit"
- Notes field relabeled "Business purpose" with IRS-guidance placeholder for travel categories
