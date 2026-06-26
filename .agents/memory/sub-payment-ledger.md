---
name: Sub Payment Ledger
description: Architecture of sub_payment_records table, its relationship to expenses, and portal/job P&L read paths
---

# Sub Payment Ledger Architecture

## Rule
`sub_payment_records` is the canonical ledger for all payments made to subcontractors via pay-worker. Portal income-report and tax-report read from this table, not from `expenses`.

**Why:** pay-worker was inserting into `expenses` causing double-counting in P&L (expenses table is also used for job costs). Phase 1 creates a dedicated ledger with dual-write; Phase 2 removes the expense insert.

**How to apply:**
- Pay-worker (jobs.ts) inserts ONLY into `subPaymentRecordsTable` (Phase 2 complete — no more expense dual-write)
- Portal `/income-report` reads `subPaymentRecordsTable` (source="ledger") + `paymentsTable` (source="payment") — NOT expenses
- Portal `/tax-report` qualifyingIncome = paymentsTable sum + subPaymentRecordsTable sum
- DDL applied directly via psql (drizzle push needs interactive TTY)
- Schema at `lib/db/src/schema/sub-payment-records.ts`, exported from `lib/db/src/schema/index.ts`
- Key columns: job_id (NOT NULL), subcontractor_id (NOT NULL), amount, payment_date (TEXT YYYY-MM-DD), idempotencyKey (UNIQUE nullable), agreedOwedSnapshot, createdFrom DEFAULT 'pay-worker', isReversal (boolean)

## Job P&L Profit Endpoints (FIXED)
Both `GET /api/jobs/:id/profit` and `GET /api/jobs/profit-summary` now include sub_payment_records
in the `subLaborCost` calculation:
- **Hourly subs**: cost = sum(job_sub_hours.hours × rateSnapshot) — unchanged
- **Fixed/Allocation subs**: cost = sum(sub_payment_records.amount WHERE NOT isReversal AND compensationType != 'hourly')
  - Falls back to flat Subcontractor expenses for legacy data pre-Phase 2
- `subLaborCost` = hoursLaborCost + nonHoursCost
- `netProfit` = collected - jobExpenses - subLaborCost (batch endpoint now includes subLaborCost)

## Note on Expenses Page
The Expenses page reads only from `expensesTable`. Sub payments via pay-worker (post-Phase 2) do NOT appear
in the Expenses list — only in sub_payment_records. If the user needs to see sub payments on the Expenses
page, that would require either restoring the dual-write (risk of double-count) or querying sub_payment_records
separately in the Expenses page.
