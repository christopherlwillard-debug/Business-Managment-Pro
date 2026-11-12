---
name: Compensation type & pay-worker
description: Job-level sub compensation types, atomic pay-worker, hard job-close gate
---

## Compensation types on job_subcontractors
- `hourly` — rate in `hourly_rate`; cost = hours × rate from job_sub_hours
- `fixed` — flat amount in `fixed_amount`; no hours needed
- `allocation` — % of split pool in `allocation_pct`; dollar amount computed at display time

## pay-worker endpoint fully atomic idempotency
Uses `db.transaction()` wrapping the conditional UPDATE + expense INSERT.
Conditional UPDATE: `WHERE paymentStatus='unpaid'` — if 0 rows, already paid, abort TX.
Expense category: 'Labor' for hourly/fixed; 'Subcontractor' for allocation.

**Why:** If expense insert fails after status update, accounting would be permanently desynced. A transaction ensures both succeed or both roll back.

## owner-draw idempotency
Job-linked owner pay is written only to `owner_capital_entries` as a negative
withdrawal and deduplicates by `jobId + date` before inserting. It must never
be written to `expenses`.

## recomputeSubPaid() authoritative signals
1. `paymentStatus='paid'` → always paid (set by pay-worker within its transaction)
2. `fixed` type: owed = amountOwed ?? fixedAmount (computedOwed is always 0 for fixed)
3. `allocation` type: pool amount unknown server-side; uses `amountPaid > 0` as fallback
4. `hourly` type: owed = amountOwed ?? computedOwed

## UI owedFor() helper pattern
Defined in JobFinancialsPanel scope; use `owedFor(p, toSplit)` everywhere owed is needed.
JobPayBreakdownPanel inlines the same pattern for its Sub Payment Records.

## Job close gate (hard block, not bypass)
`handleMarkCompleted` uses `toast` to HARD-BLOCK completion if:
1. Any sub has `paymentStatus !== 'paid'`
2. An invoice exists with `status !== 'paid'`
Uses `invoiceSummaryMap.get(job.id)` from component scope.

Archive/close also remains blocked while any subcontractor balance is outstanding. A paid customer invoice does not mean James, Dewayne, or another subcontractor has been paid; only the subcontractor payment ledger can confirm settlement. An amount that cannot be calculated is unresolved, not zero, so the job must stay open until it is known.

The server gate must cover both `completed` and `closed` status transitions: a completion flow can bypass an archive-only check. Never offer a “keep outstanding” completion path or mark a subcontractor paid from the close dialog; record actual payments through Job Payroll.

**Why:** The user explicitly said that a job with any remaining balance must stay open because the subcontractor has not been paid, and approved keeping jobs open until unknown amounts are resolved.

**How to apply:** Enforce this through the shared server-side outstanding-sub-payment check for both completion and closure; do not bypass it or infer subcontractor settlement from invoice status. Record payment only when it was actually made.

## Subcontractor payables overview
The user approved an Accounting rollup grouped by subcontractor, with expandable job-level balances. Payments remain per job and are recorded through the existing Job Payroll flow; do not add another ledger or combine jobs into one payment.

**Why:** The user needs a scalable per-person view of amounts owed while continuing to review and pay each job separately.

**How to apply:** Use stable subcontractor IDs for grouping, derive amounts from the existing payroll sources, and link each job row to its existing payroll screen.

## Compensation at assignment time
Job form shows SubcontractorPicker + per-sub comp defaults section for BOTH new AND edit jobs.
After save: comp defaults applied via PUT sub-payments using `editJob.id` or `newJob.id`.
Default hourly rate in hours-entry form uses job-level `hourlyRate` (not profile `payRate`).

**Why:** Comp type is a per-job-per-sub deal, not a sub profile attribute.
