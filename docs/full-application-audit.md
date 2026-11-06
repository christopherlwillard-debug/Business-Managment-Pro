# Full-Application Audit Ledger

**Last updated:** 2026-11-06  
**Repository:** `christopherlwillard-debug/Business-Managment-Pro`  
**Audit branch:** `audit/website-studio-find-fix-2026-11-05`  
**Production boundary:** audit branch only; no production data, credentials, `master`, merge, or deployment changes.

## Branch and audit baseline

- `master` was at `135a42696556ef9df91417b3dfe0a87b06cb05ca` when this batch began.
- The audit branch was 360 commits ahead and 0 behind at the start of this batch; after the recurring-expense fix it is 361 ahead and 0 behind.
- No open pull request was present at the time of review.
- Existing audit material reviewed includes `ACCOUNTING_AUDIT.md`, `.agents/architecture/AUDIT_2026_08_05.md`, `.agents/architecture/ACCOUNTING_AUDIT_2026_08_05.md`, and `.agents/architecture/DEAD_CODE_AUDIT_2026_08_05.md`. No dedicated full-application findings ledger was present, so this file is the ongoing ledger.

## Prioritized findings

| ID | Severity | Subsystem / workflow | Evidence and root cause | Status | Fix commit | Residual risk |
|---|---|---|---|---|---|---|
| REC-001 | High | Expenses → recurring-template editing | The PUT handler read `parsedJobId` before its `const` declaration. The temporal-dead-zone error affected ordinary edits even when no job was supplied. The ordering was introduced with the input-validation change in commit `9337ca88`. | **Fixed**; route regression tests added, not executed | `72013b88a7d178847da9f65599a6085668b9ab73` | Typecheck and runtime execution remain pending. |
| REC-002 | High | Recurring-expense generation / accounting ledger | The worker inserted an expense and advanced the template in separate writes without a row lock or transaction. A restart, failed update, or multiple app replicas could create the same occurrence more than once. The worker also generated only one overdue occurrence per run, leaving missed periods to trickle in over successive days. | **Fixed** with per-template transaction, row lock, existing-occurrence check, and overdue catch-up; worker regression tests added, not executed | `72013b88a7d178847da9f65599a6085668b9ab73` | Existing historical duplicate expenses are not automatically removed. PostgreSQL integration validation is still required. |
| REC-003 | Medium | Recurring calendar schedules | Native local `setMonth` / `setFullYear` overflowed dates such as January 31 into March and caused month-end or leap-day schedules to drift. | **Fixed** with UTC date-only arithmetic and the original start-date day as the monthly/quarterly/yearly anchor; boundary tests added, not executed | `72013b88a7d178847da9f65599a6085668b9ab73` | Previously drifted stored `nextDueDate` values are not migrated; review existing templates for dates already shifted by the old calculation. |
| REC-004 | Medium | Recurring-expense end dates | The old worker could generate the current due occurrence even when that date was already later than the configured end date. | **Fixed**; generation is bounded by `endDate` and expired templates are deactivated without a late occurrence | `72013b88a7d178847da9f65599a6085668b9ab73` | Worker regression tests are added but not yet executed against PostgreSQL. |

## Work completed in this batch

- Corrected recurring-template PUT validation ordering and added request-level regression coverage for edits without `jobId`, valid job reassignment, and malformed job IDs.
- Made initial template creation and its first expense occurrence atomic.
- Reworked the scheduled worker to lock and re-read each template in a transaction, skip already-created template/date occurrences, catch up all overdue periods, respect end dates, and continue processing other templates when one template fails.
- Replaced month-overflow date arithmetic with anchored calendar arithmetic for monthly, quarterly, and yearly schedules.
- Added focused tests in:
  - `artifacts/api-server/src/routes/recurring-expenses.test.ts`
  - `artifacts/api-server/src/jobs/recurringExpenses.test.ts`

## Validation and limitations

- The code and regression tests were committed to the audit branch in `72013b88a7d178847da9f65599a6085668b9ab73`.
- GitHub reported no combined status checks for that commit at review time.
- Tests, API typecheck, and build were **not run**. This execution environment had no local repository checkout; a direct Git remote check failed because `github.com` could not be resolved. No test or runtime pass is claimed.
- No schema migration was needed. No production data was read or changed.

## Remaining audit coverage

The full-application audit remains open. Website Studio is one subsystem, not the entire scope. The next risk-based batches are:

1. Authentication/session handling, owner/team permissions, section guards, and business-data isolation across every API route.
2. Payments, invoices, subcontractor pay, expenses, financial reports, tax calculations, and reconciliation invariants.
3. Jobs, estimates, manufactured-home production/service, asphalt workflows, scheduling, checklists, and job closeout.
4. Uploads/media/storage, file imports/exports, Square/Plaid/Mapbox/email integrations, notifications, and background workers.
5. Frontend page/workflow coverage, mobile/responsive behavior, accessibility, search/analytics, performance, and operational reliability.

Every batch must trace confirmed defects through callers, schema, and tests; add focused regression coverage; and remain on this branch. Existing historical data anomalies and any item not validated in the target runtime must remain explicitly marked as residual risk.
