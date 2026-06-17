---
name: Compensation type & pay-worker
description: How job-level sub compensation types work, pay-worker idempotency, and close-gate behavior
---

## Compensation types on job_subcontractors
Three types stored in `compensation_type` column (default 'hourly'):
- `hourly` — rate in `hourly_rate`; cost = hours × rate (from job_sub_hours)
- `fixed` — flat amount in `fixed_amount`; no hours needed
- `allocation` — % of split pool in `allocation_pct`; dollar amount computed at display time from toSplit

## pay-worker endpoint atomic idempotency
Uses conditional UPDATE WHERE paymentStatus='unpaid' before inserting expense.
If 0 rows updated, another request already claimed it → return `{ok:true, alreadyPaid:true}`.
Expense category: 'Labor' for hourly/fixed; 'Subcontractor' for allocation.

**Why:** Race conditions can create duplicate expenses. The UPDATE is atomic; expense insert only happens if UPDATE won.

## owner-draw idempotency
Deduplicates by `jobId + category + date + description` before inserting.

## recomputeSubPaid() authoritative signals
1. `paymentStatus='paid'` → always paid (set by pay-worker endpoint)
2. `fixed` type: owed = amountOwed ?? fixedAmount (not computedOwed)
3. `allocation` type: can't compute owed server-side; uses `amountPaid > 0` as fallback
4. `hourly` type: owed = amountOwed ?? computedOwed

**Why:** computedOwed only sums job_sub_hours rows; fixed/allocation subs have 0 computedOwed.

## UI owedFor() helper pattern
Defined in JobFinancialsPanel scope — use `owedFor(p, toSplit)` everywhere owed is needed.
```typescript
function owedFor(p: SubPaymentRow, splitPool?: number): number {
  if (p.amountOwed != null) return p.amountOwed;
  if (p.compensationType === 'allocation') return splitPool != null ? splitPool * ((p.allocationPct ?? 0) / 100) : 0;
  if (p.compensationType === 'fixed') return p.fixedAmount ?? p.computedOwed;
  return p.computedOwed;
}
```

## Job close gate
`handleMarkCompleted` fetches sub-payments and uses `window.confirm` to warn if any have `paymentStatus !== 'paid'` before marking complete.

## Compensation at assignment time
Job edit form has a per-sub comp row after SubcontractorPicker. On save, calls PUT sub-payments for each sub with a rate set. Default rate in hours-entry form uses job-level `hourlyRate` from payments, not profile `payRate`.
