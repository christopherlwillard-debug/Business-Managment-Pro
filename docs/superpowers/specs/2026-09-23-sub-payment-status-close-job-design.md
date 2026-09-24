# Subcontractor Payment Status and Close-Job Eligibility Repair

## Problem

After a subcontractor payment is recorded, the payment history surface can show
the sub as paid while Job Financials and the Jobs close gate still show an
outstanding balance. This prevents a job with a paid invoice and fully paid
subs from being closed.

## Diagnosis

The owning system is Jobs/Payroll. The authoritative payroll ledger is
`sub_payment_records`; `job_subcontractors.payment_status` and
`jobs.sub_paid` are derived/cache fields.

The relevant path is:

1. Jobs records payment through
   `POST /api/jobs/:id/pay-worker/:subId`.
2. The route inserts `sub_payment_records`, updates the job assignment, and
   calls `recomputeSubPaid`.
3. Job Financials reads `GET /api/jobs/:id/sub-payments`, whose `amountPaid`
   is ledger-derived but whose displayed status still comes from the cached
   `job_subcontractors.payment_status`.
4. The Jobs list close eligibility reads
   `GET /api/jobs/outstanding-sub-balances?jobIds=...`.
5. That batch route filters only cached `payment_status IN ('unpaid','partial')`
   and does not consult `sub_payment_records`.

The single-job `GET /api/jobs/:id/outstanding-sub-payments` route already
contains ledger-aware outstanding-balance logic, including allocation owed
amounts, fixed owed amounts, hourly hours, advances, and legacy repairs. The
batch route does not reuse it. This is the confirmed source-of-truth mismatch.

## Architecture impact

| Area | Existing source / owner |
|---|---|
| Payroll ledger | `sub_payment_records`, owned by Jobs/Payroll |
| Job assignment cache | `job_subcontractors` |
| Job aggregate cache | `jobs.sub_paid` |
| Primary API | `artifacts/api-server/src/routes/jobs.ts` |
| Primary UI | `artifacts/contractor-app/src/pages/Jobs.tsx` |
| Reports | Existing report and profit engines continue reading their current approved sources |

No new tables, ledgers, payment workflows, or calculations are introduced.

## Approved design

Extract the existing ledger-aware outstanding-subcontractor evaluation into one
server-side helper. Use that helper for both:

- `GET /:id/outstanding-sub-payments`
- `GET /outstanding-sub-balances?jobIds=...`

The batch endpoint will return `true` only when the shared evaluator finds an
actual unpaid balance. The evaluator remains ledger-first and may repair stale
derived fields as the existing single-job route does.

The UI continues to use the existing endpoints and refresh paths. A successful
payment refreshes the job data and the batch outstanding status, allowing the
paid-invoice job to expose Close Job without a separate client-side payment
state.

## Invariants

- A payment record remains the only payroll ledger row.
- Cached payment status cannot override a fully covered ledger balance.
- A reversal remains included in the ledger calculation rules already used by
  the existing evaluator.
- Allocation owed amounts continue to use the canonical job split pool.
- Jobs with any real outstanding sub balance remain blocked from closing.
- Paid invoice status remains a separate close requirement.
- Multi-business ownership and existing authorization behavior are unchanged.

## Validation

- Add a regression test where `job_subcontractors.payment_status` is stale
  (`partial`/`unpaid`) but the ledger fully covers the obligation; both the
  single-job and batch endpoints must report settled.
- Keep coverage for genuinely unpaid fixed/allocation and hourly workers.
- Run API typecheck and focused Jobs route tests.
- Run contractor-app typecheck, tests, and production build.
- Verify the running Jobs workflow starts cleanly after the change.