---
name: Compensation type & pay-worker
description: How job-level sub compensation types work and how the pay-worker and owner-draw endpoints behave
---

## Compensation types on job_subcontractors
Three types stored in `compensation_type` column (default 'hourly'):
- `hourly` — rate stored in `hourly_rate`; cost = hours × rate (from job_sub_hours)
- `fixed` — flat amount in `fixed_amount`; no hours needed
- `allocation` — % of split pool in `allocation_pct`; dollar amount computed at display time

## pay-worker endpoint (POST /api/jobs/:id/pay-worker/:subId)
- Idempotent: returns `{ok: true, alreadyPaid: true}` if paymentStatus already 'paid'
- Expense category: `'Labor'` for hourly/fixed; `'Subcontractor'` for allocation
- Sets `paymentStatus='paid'`, `paidAt=today`, `amountPaid=amount`

## owner-draw endpoint (POST /api/jobs/:id/record-owner-draw)
- Idempotent: deduplicates by jobId + category + date + description
- Expense category: `'Owner Draw'` (already excluded from business expenses in reports)

## recomputeSubPaid() — compensation-type-aware
- `paymentStatus='paid'` is the authoritative signal (set by pay-worker)
- `fixed` type: owed = amountOwed ?? fixedAmount (not computedOwed)
- `allocation` type: pool amount unknown server-side; uses `paid > 0` as fallback
- `hourly` type: owed = amountOwed ?? computedOwed (hours × rate)

**Why:** computedOwed only sums job_sub_hours rows; fixed/allocation subs may never have hours logged, so computedOwed=0 causing false "allPaid=true".

## UI owedFor() helper (JobFinancialsPanel scope)
```typescript
function owedFor(p: SubPaymentRow, splitPool?: number): number {
  if (p.amountOwed != null) return p.amountOwed;
  if (p.compensationType === 'allocation') return splitPool != null ? splitPool * ((p.allocationPct ?? 0) / 100) : 0;
  if (p.compensationType === 'fixed') return p.fixedAmount ?? p.computedOwed;
  return p.computedOwed;
}
```
Used for all owed calculations in JobFinancialsPanel. JobPayBreakdownPanel inlines the same pattern.
