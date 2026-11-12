# Job Ownership Reassignment Guard

## Problem

`PUT /api/jobs/:id` can change the owning business of an existing job. The route
currently rejects the change when any invoice is linked, but other job-linked
financial and cost-source records can remain attributed to the previous
business. This can make job access, cost attribution, payroll, and reports
disagree about the job's owner.

The user approved blocking ownership changes whenever any linked financial or
cost-source row exists. Production data and configuration remain out of scope.

## Architecture Review

1. **Existing systems:** `jobs.business_id` is the canonical job owner, with
   `business_line` retained for legacy compatibility. The existing job update
   route already checks linked invoices before a reassignment.
2. **Existing tables:** The guard covers the following direct job links:

   | Table | Job link | Status/history handling |
   |---|---|---|
   | `invoices` | `job_id` | Any row blocks, including drafts and voided invoices; this preserves the existing guard. |
   | `other_income` | `job_id` | Any row blocks, including voided rows. |
   | `expenses` | `job_id` | Any row blocks, including voided rows and rows also linked to sub-hours. |
   | `job_expense_allocations` | `job_id` | Any row blocks; allocation rows have no active/void status. |
   | `job_subcontractors` | `job_id` | Any assignment blocks because its compensation type and rates are cost inputs; it has no active/void status. |
   | `job_sub_hours` | `job_id` | Any row blocks because it is a payroll-hour source; it has no active/void status. |
   | `sub_payment_records` | `job_id` | Any row blocks, including reversal rows. |
   | `sub_advances` | `job_id` | Any row blocks, whether applied or unapplied. |
   | `mileage_logs` | `job_id` | Any row blocks, including voided trips. |
   | `job_mileage_reimbursements` | `job_id` | Any row blocks, including owed and paid states. |
   | `owner_capital_entries` | `job_id` | Any row blocks, including voided history. |
   | `recurring_expenses` | `job_id` | Any row blocks, including inactive recurring records. |

   Estimates, material lists, business trips, daily logs, route stops,
   checklists, readiness conditions, and production records are not posted
   financial/cost-source rows and do not independently block reassignment. If
   one of those records has generated a protected source row (for example, an
   expense generated from a material list), that source row blocks it.
3. **Existing APIs:** The owning mutation is `PUT /api/jobs/:id` in
   `artifacts/api-server/src/routes/jobs.ts`. The linked source records remain
   owned by their current ledger APIs; this design does not change those APIs.
4. **Existing UI:** The Jobs page edit form selects a business and sends the
   selected `businessId`. No new UI is required for the guard.
5. **Existing calculations:** `job-profit-loader.ts` and
   `calculateJobProfit` derive job costs and revenue from linked source rows.
   Payroll, mileage, allocation, and report paths also consume those sources.
6. **Existing reports:** Job profit, P&L, Accounting, tax, and payroll views
   depend on the linked records and their existing business attribution.
7. **Source of truth:** The `jobs` row owns job business assignment. Each
   financial table remains the source of truth for its own transaction and
   business attribution. Posted financial records are immutable.
8. **Duplicate implementations:** No new table, ledger, API, or calculation
   engine is needed.
9. **Extension point:** Extend the existing reassignment guard in the Jobs API
   route and add route-level tests in
   `artifacts/api-server/src/routes/jobs-business-scope.test.ts`.
10. **Recommendation:** Reject a business change when any linked financial or
    cost-source row exists. Include voided and reversed rows so the job cannot
    be detached from historical ledger attribution. Do not update or move any
    child financial records.

## Approved Behavior

- A request that keeps the current canonical owner continues through normal
  job validation and update behavior.
- A request that changes the canonical owner is rejected with HTTP 409 if any
  row exists in one of the protected tables listed above, regardless of
  active/inactive, applied/unapplied, owed/paid, voided, or reversed state.
- The rejection happens before the job update; the request must not mutate the
  job or any linked source record.
- A reassignment with no linked protected rows remains eligible, subject to the
  route's existing business-access and client/property authorization checks.
- Existing invoice protection remains covered by the unified guard.
- Non-financial planning and operational rows do not block reassignment unless
  they have produced a protected financial/cost-source row.

## API and Error Handling

Return HTTP 409 with a stable, plain-language conflict message explaining that
the job's business cannot be changed while financial or cost records are
linked. Do not expose record contents in the response. Keep validation errors
for invalid or inaccessible business IDs unchanged.

## Data Flow

1. Read the job's current canonical ownership.
2. Resolve and authorize the explicitly requested owner.
3. If ownership changes, check for any protected linked rows.
4. Return 409 before constructing or applying job updates when a row exists.
5. Otherwise continue through existing job/client/property validation and
   persist the job's new business owner. Never rewrite child records.

## Testing

- Table-driven route tests verify that each protected table's direct `job_id`
  link causes a 409 on ownership change.
- Status variants are covered as applicable: draft/voided invoices; active and
  voided expenses, other income, and mileage; reversal and non-reversal
  payments; applied and unapplied advances; owed and paid reimbursements;
  active and inactive recurring expenses; owner-capital rows with and without
  void metadata.
- A safe-case matrix verifies an ownership change with no protected rows, a
  same-owner edit with protected rows, and a reassignment with planning-only
  rows.
- Verify a rejected request does not call the job update operation and leaves
  linked rows untouched.
- Retain coverage for the existing invoice guard and owner authorization.

## Scope and Risks

- No schema, UI, ledger, report, or production changes are part of this work.
- Blocking voided/reversed history is intentionally conservative and may
  prevent reassignment after a correction; this preserves immutable history and
  avoids cross-business attribution drift.
- This guard checks for rows that exist when the update request evaluates the
  reassignment. Serializing all concurrent financial-row creation paths with
  reassignment would require broader cross-route coordination and is not
  included in this focused change.
