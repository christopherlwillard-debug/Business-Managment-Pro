# Subcontractor Payables Rollup

**Status:** User-approved design; implementation not started  
**Owner:** Subcontractor Payroll  
**Date:** 2026-11-11

## Problem

As job volume increases, the owner needs a reliable way to see how much is owed to each subcontractor, including which jobs make up that balance. The current Accounting view lists individual unpaid job/subcontractor rows, while Job Payroll is scoped to one job at a time. Allocation amounts can also be unavailable when the shared job-profit calculation is unavailable.

The Jobs page must not close a job while subcontractor pay remains outstanding. An unknown amount is unresolved, not zero.

## Approved decisions

- Use an Accounting rollup grouped by subcontractor, with expandable per-job details.
- Keep payments separate by job; the owner does not normally combine multiple jobs into one payment.
- Continue using the existing hourly, fixed, and allocation calculations.
- Allocation balances remain live under the existing split-pool calculation until paid; this feature does not freeze them.
- Record payment only through the existing per-job payroll flow and ledger.
- Never automatically send or record a payment.
- Keep jobs open when a positive balance remains or an amount is unknown.
- Do not add a new table or a parallel payroll ledger.

## Architecture review

1. **Existing systems:** Subcontractor Payroll owns compensation agreements and payment records. Accounting presents outstanding obligations. Jobs owns completed/closed state.
2. **Existing tables:** `job_subcontractors` stores per-job compensation agreements and cached payment status; `sub_payment_records` is the authoritative payment ledger; `job_sub_hours` supplies hourly work; `jobs` and `invoices` supply job and customer-invoice state.
3. **Existing APIs:** `GET /api/reports/accounting` supplies Accounting data; `GET /api/jobs/:id/outstanding-sub-payments` and `GET /api/jobs/outstanding-sub-balances` supply job-level settlement checks; `PUT /api/jobs/:id` updates job status.
4. **Existing UI:** `Accounting` → `OverviewTab` displays unpaid rows; `JobPayroll` records an individual job’s payment; `Jobs.tsx` displays and closes jobs.
5. **Existing calculations:** `computeSubOwed` resolves hourly, fixed, and allocation amounts. `computeAllocationSplitPool(s)` uses the canonical split-pool calculation for allocation pay.
6. **Reports:** Accounting’s report response and job-profit/closed-job reporting consume the same payroll source records. No new payroll report or profit formula is required.
7. **Source of truth:** Per-job compensation comes from `job_subcontractors` plus the shared calculation engine; posted subcontractor payments come only from `sub_payment_records`.
8. **Duplicate-system risk:** Grouping must use `subcontractorId`, not names. Do not create another ledger, persisted aggregate, or React-side version of the pay calculation.
9. **Extension decision:** Extend the existing Accounting response and UI, and reuse the settlement evaluator for close checks. No new table is needed.
10. **Recommendation:** Add a server-derived subcontractor rollup to Accounting, preserve job-level payment entry, and make closure eligibility fail closed for unknown balances.

## User experience

### Accounting payables section

- Group outstanding entries by stable subcontractor ID.
- Show each person’s amount due and number of affected jobs.
- Expand a person to see job title, compensation type, remaining amount, and whether the row is unpaid, partially paid, or unavailable.
- Link each job row to that job’s existing Job Payroll screen. Payment remains a per-job action.
- Preserve active business/business-line scope and include all currently outstanding jobs regardless of the Accounting report’s selected year.
- Refresh or invalidate Accounting data after a payment is recorded so returning from Job Payroll shows the new balance.

### Unknown amounts

- Include rows whose amount cannot currently be calculated; do not omit them or treat them as $0.
- If any row in a person’s group is unknown, label the group total as incomplete (for example, known amount plus the count of unavailable job amounts).
- Explain that the amount must be resolved in the job’s payroll/profit inputs before payment or closure.
- If the shared evaluator cannot verify settlement, keep the job open and show an explanatory reason rather than silently presenting a complete total.

## Settlement and close behavior

- A job remains open if any subcontractor has a positive remaining balance.
- A job also remains open if any subcontractor balance is unknown or the settlement check cannot complete.
- Customer invoice payment alone does not settle subcontractor payroll.
- Enforce closure in the server-side `PUT /api/jobs/:id` path when `status` is set to `closed`; do not rely only on a hidden client-side button.
- Use the same ledger-aware settlement evaluator for Accounting display and close eligibility, so the total shown and the close decision cannot disagree.
- Keep the existing completed-job and paid-invoice requirements; this change does not weaken them.

## Data and calculation contract

The API should return per-job remaining balances and grouped person totals derived on the server. Each row should carry a stable `subcontractorId`, `jobId`, compensation type, and one of:

- A known nonnegative remaining amount.
- An explicit unavailable/unknown amount with a reason suitable for the owner.

If all amounts in a group are known, the group total is their sum. If any amount is unknown, the UI must not present the known subtotal as the complete amount owed.

Keep the existing Accounting response fields compatible where possible. Add the grouped response additively and retain the old job-level rows for existing consumers. No calculated balance is persisted.

## Scope boundaries

In scope:

- Per-person outstanding totals with per-job details in Accounting.
- Explicit display of unknown balances.
- Shared, fail-closed settlement eligibility for job closure.
- Tests for grouping, partial payments, unknown balances, scope filtering, and close rejection.

Out of scope:

- Automated money movement, scheduled payments, or reminders.
- Combining one payment across multiple jobs.
- Changing hourly, fixed, or allocation compensation rules.
- Freezing allocation amounts before payment.
- Editing, moving, or correcting existing payroll records.
- Changing job profit, tax, invoice, or payroll ledger calculations.

## Failure behavior

- If the Accounting data request fails, show an error/retry state; do not show a stale or zero total as current.
- If a balance calculation is unavailable, show the row as unresolved and keep closure blocked.
- If payment recording fails, retain the prior balance and surface the failure; do not mark paid optimistically.
- If the close eligibility check fails, do not close the job.

## Acceptance criteria

1. A subcontractor with unpaid balances across multiple jobs sees one grouped total and an expandable list of the contributing jobs.
2. Partial payments reduce only the balance for the job where the payment was recorded.
3. Unknown balances are visible, make the total explicitly incomplete, and block job closure.
4. A paid customer invoice does not hide unpaid subcontractor balances or make a job closeable.
5. The server rejects a close request while a balance is positive, unknown, or unverifiable.
6. After an existing per-job payment is recorded, the Accounting rollup refreshes from the authoritative ledger.
7. No new table, duplicate payment record, or second payroll calculation is introduced.

## Validation plan

- API tests: grouped totals by subcontractor ID; multiple jobs; unpaid and partially paid entries; unknown amounts; business-line filtering; API close rejection for positive, unknown, and unverifiable balances.
- Frontend tests: group expansion, incomplete-total messaging, navigation to Job Payroll, loading/error states, and refresh after returning from a payment.
- Existing payroll, job-profit, Accounting, and close-job regression checks must continue to pass.
- Confirm the signed-in Accounting view and job-close behavior in the running app without recording or moving real payments.
