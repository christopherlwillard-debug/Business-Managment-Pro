# Subcontractor Payables Rollup — Implementation Plan

**Source spec:** `docs/superpowers/specs/2026-11-11-subcontractor-payables-rollup-design.md`

**Status:** Plan only; no implementation started

## Goal

Show subcontractor balances in Accounting as per-person totals with job-level details, while ensuring the server will not close a job with a positive, unknown, or unverifiable subcontractor balance.

## Scope and guardrails

- Use `sub_payment_records` as the authoritative payment ledger and the existing shared compensation calculations.
- Group by `subcontractorId`, not display name. Keep payments per job through the existing Job Payroll flow.
- Keep allocation amounts live under the existing calculation until paid.
- Make unknown amounts visible and blocking; never interpret missing data or a failed check as zero.
- Do not add a table, duplicate ledger, payment automation, or production data repair.
- Preserve existing legacy allocation settlement behavior so an already-confirmed payment is not re-opened.
- Keep the existing Accounting business scope and all-time outstanding-balance behavior.

## Work sequence

### 1. Create one settlement evaluator for display and closure

Files:
- `artifacts/api-server/src/lib/subcontractorPayables.ts` (new shared helper)
- `artifacts/api-server/src/routes/jobs.ts`
- `artifacts/api-server/src/routes/reports.ts`
- Focused API tests for settlement and Accounting reporting

Work:
- Extract the settlement decision from `getOutstandingSubPaymentsForJob` into a side-effect-free shared evaluator. It must reuse `computeSubOwed` and the canonical allocation split-pool functions.
- Base paid totals on `sub_payment_records`, including advances and excluding reversals, while preserving existing trusted legacy-payment handling.
- Return a row for each relevant subcontractor/job with a known remaining balance or an explicit unknown state and one canonical owner-readable reason.
- Keep any existing background repair of cached payment fields separate from the shared evaluator; calling the Accounting report must not introduce new write side effects.
- Support a batch of scoped job IDs for Accounting so the all-job report does not issue one set of queries per job.
- Update `getOutstandingSubPaymentsForJob` and the Accounting report to use this evaluator so their displayed balances and close decisions agree.

Exit criteria:
- Known balances match the current shared compensation rules and authoritative ledger.
- Unknown allocation or hourly amounts remain represented as unknown, rather than being dropped or converted to zero.
- Existing legacy paid-allocation behavior is preserved.

### 2. Enforce the settlement rule in the server close path

Files:
- `artifacts/api-server/src/routes/jobs.ts`
- `artifacts/api-server/src/routes/jobs-business-scope.test.ts` or a focused close/payables route test
- `artifacts/api-server/scripts/` close-job verification as needed

Work:
- Before `PUT /api/jobs/:id` writes `status: "closed"` or `closedAt`, call the shared settlement evaluator for that scoped job.
- Reject closure with a structured conflict response if any balance is positive, unknown, or the evaluator cannot verify settlement. Include the same canonical unknown reason used by Accounting.
- Ensure a rejected request makes no job-status or `closedAt` change.
- Keep the existing completed-job, customer-invoice, permission, and business-scope behavior intact.
- Return unknown rows from the existing outstanding-balance endpoints so the Jobs UI can explain why closure is blocked.

Exit criteria:
- Direct API close requests cannot bypass the subcontractor settlement rule.
- A job closes only after every subcontractor amount is known and settled.

### 3. Add the Accounting per-person rollup and clear job blockers

Files:
- `artifacts/api-server/src/routes/reports.ts`
- `artifacts/contractor-app/src/pages/accounting/OverviewTab.tsx`
- `artifacts/contractor-app/src/pages/Jobs.tsx`
- `artifacts/contractor-app/src/pages/JobPayroll.tsx` only if query invalidation needs adjustment
- Focused UI tests for the rollup and close-blocked state

Work:
- Extend the Accounting response additively with grouped payables keyed by subcontractor ID and job rows containing job ID/title, compensation type, remaining amount or unknown reason, and payment status.
- Include known subtotal, unresolved count, and a completeness indicator for each person. Do not label a partial known subtotal as the complete amount owed.
- Preserve legacy response fields for existing consumers; ensure unknown rows are not filtered out.
- Replace the flat Accounting table with person groups, expandable job details, and a link from each job row to its existing Job Payroll screen.
- Show a useful loading/error state instead of a stale or zero total when the request fails.
- On the Jobs page, display a clear reason when closing is blocked by unpaid or unknown subcontractor pay; handle the server conflict without optimistic closure.
- Ensure an existing per-job payment causes the Accounting balance to refresh when the owner returns to the rollup.

Exit criteria:
- The owner can see each person’s known total, unresolved count, and the jobs that make up the balance.
- Each job’s payment remains a separate action in Job Payroll.
- The same unavailable reason is shown in Accounting and when a close is rejected.

### 4. Verify financial and UI behavior

Run:
- `pnpm --filter @workspace/api-server test`
- `pnpm --filter @workspace/api-server run typecheck`
- `pnpm --filter @workspace/contractor-app run typecheck`
- `pnpm --filter @workspace/api-server run verify:close-job`
- `pnpm run job-profit-contract:check`
- `pnpm --filter @workspace/contractor-app run check:profit-client`

Required scenarios:
- Multiple jobs group under the same stable subcontractor ID, with subtotals matching the job rows.
- A partial payment changes only the job where it was recorded and updates the person’s rollup.
- Unknown allocation and hourly balances remain visible and mark totals incomplete.
- Positive, unknown, and unverifiable balances reject a server close without changing job state.
- Fully settled balances allow closure when the existing job and invoice conditions are met.
- Business filtering, existing ledger/reversal behavior, legacy paid allocations, report failure handling, and job-profit contract checks remain correct.
- Confirm the signed-in Accounting and Jobs UI in the running app without recording a real payment or closing a real job.

## Completion boundary

This plan does not include editing historical payroll records, asserting that an unrecorded payment occurred, moving money, closing the currently disputed jobs, changing compensation amounts, running production migrations, or publishing.

Do not begin implementation until the user approves this plan.
