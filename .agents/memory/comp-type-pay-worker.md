---
name: Compensation type & pay-worker
description: How job-level sub compensation types work and how the pay-worker endpoint behaves
---

## Compensation types on job_subcontractors
Three types stored in `compensation_type` column (default 'hourly'):
- `hourly` — rate stored in `hourly_rate`; cost = hours × rate (from job_sub_hours)
- `fixed` — flat amount in `fixed_amount`; no hours needed
- `allocation` — % of split pool in `allocation_pct`; amount computed at display time

## Pay breakdown waterfall
- `hourlyFixedSubs` (hourly + fixed) deducted BEFORE split pool as "Hourly Workers"
- `pctSubs` (allocation) come FROM the split pool, shown by name with their %
- `ownerPct` = 100% - sum(allocationPct) when pct workers present; else slider value
- Warning shown when allocationPct totals ≠ 100%

## pay-worker endpoint (POST /api/jobs/:id/pay-worker/:subId)
- Idempotent: returns `{ok: true, alreadyPaid: true}` if already paid
- Fixed type: uses `fixedAmount` from DB
- Allocation type: requires `amount` in request body (caller computes from split pool)
- Hourly type: uses `amountOwed` from DB, or body `amount` as fallback
- Creates expense with category `'Subcontractor'` (all types)
- Sets `paymentStatus='paid'`, `paidAt=today`, `amountPaid=amount`

## Owner draw
- Uses expense category `'Owner Draw'` (NOT ownerCapitalEntriesTable)
- Reports already exclude 'Owner Draw' expenses from businessExpenses
- Endpoint: POST /api/jobs/:id/record-owner-draw with `{ amount, description }`

## UI displayOwed for fixed subs
In JobSubHoursPanel payments tab, `displayOwed` falls back to `fixedAmount` for fixed type
subs when there's no manual amountOwed and no hours tracked.
`isPaid` checks `paymentStatus === 'paid'` (from pay-worker) OR balance <= 0.01.

**Why:** Fixed and allocation subs don't have sub-hours entries, so computedOwed = 0.
Without this fallback, the Mark Paid button wouldn't appear for fixed subs.
