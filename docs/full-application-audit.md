# Full-Application Audit Ledger

**Last updated:** 2026-11-06  
**Repository:** `christopherlwillard-debug/Business-Managment-Pro`  
**Audit branch:** `audit/website-studio-find-fix-2026-11-05`  
**Production boundary:** audit branch only; no production data, credentials, `master`, merge, or deployment changes.

## Branch and audit baseline

- `master` was at `135a42696556ef9df91417b3dfe0a87b06cb05ca` when this batch began.
- The original ledger baseline was 360 commits ahead and 0 behind; the recurring-expense fix moved it to 361 ahead. At the start of the client-isolation batch, branch head was `b607aaa5b4fae22eebc4e035e65fe40b4c0ec89b` (371 ahead, 0 behind). After the client batch, code head was `63d199758fc56ba752b92cbe097eba6a974ab70c` (388 ahead, 0 behind). `master` remained `135a42696556ef9df91417b3dfe0a87b06cb05ca`.
- No open pull request was present at the time of review.
- Existing audit material reviewed includes `ACCOUNTING_AUDIT.md`, `.agents/architecture/AUDIT_2026_08_05.md`, `.agents/architecture/ACCOUNTING_AUDIT_2026_08_05.md`, and `.agents/architecture/DEAD_CODE_AUDIT_2026_08_05.md`. No dedicated full-application findings ledger was present, so this file is the ongoing ledger.

## Prioritized findings

| ID | Severity | Subsystem / workflow | Evidence and root cause | Status | Fix commit | Residual risk |
|---|---|---|---|---|---|---|
| REC-001 | High | Expenses → recurring-template editing | The PUT handler read `parsedJobId` before its `const` declaration. The temporal-dead-zone error affected ordinary edits even when no job was supplied. The ordering was introduced with the input-validation change in commit `9337ca88`. | **Fixed**; route regression tests added, not executed | `72013b88a7d178847da9f65599a6085668b9ab73` | Typecheck and runtime execution remain pending. |
| REC-002 | High | Recurring-expense generation / accounting ledger | The worker inserted an expense and advanced the template in separate writes without a row lock or transaction. A restart, failed update, or multiple app replicas could create the same occurrence more than once. The worker also generated only one overdue occurrence per run, leaving missed periods to trickle in over successive days. | **Fixed** with per-template transaction, row lock, existing-occurrence check, and overdue catch-up; worker regression tests added, not executed | `72013b88a7d178847da9f65599a6085668b9ab73` | Existing historical duplicate expenses are not automatically removed. PostgreSQL integration validation is still required. |
| REC-003 | Medium | Recurring calendar schedules | Native local `setMonth` / `setFullYear` overflowed dates such as January 31 into March and caused month-end or leap-day schedules to drift. | **Fixed** with UTC date-only arithmetic and the original start-date day as the monthly/quarterly/yearly anchor; boundary tests added, not executed | `72013b88a7d178847da9f65599a6085668b9ab73` | Previously drifted stored `nextDueDate` values are not migrated; review existing templates for dates already shifted by the old calculation. |
| REC-004 | Medium | Recurring-expense end dates | The old worker could generate the current due occurrence even when that date was already later than the configured end date. | **Fixed**; generation is bounded by `endDate` and expired templates are deactivated without a late occurrence | `72013b88a7d178847da9f65599a6085668b9ab73` | Worker regression tests are added but not yet executed against PostgreSQL. |
| CLI-001 | High | CRM → client update, business-line reassignment, service-date update, and delete | `router.param` only checked a business when `requestedBusiness` returned a non-null scope. PUT/PATCH intentionally stripped the destination `businessLine` from the scope request, but did not replace it with the source owner; with no query selector the guard skipped. The handlers then updated/deleted by client ID alone. Several frontend callers also omitted the source business selector. | **Fixed**; source-owner selectors now flow from callers, mutations resolve the source business, verify the client belongs to it, and include a `mutationBusinessPredicate` in the final write. Route regression tests added, not executed | `e758f22`, `ae0af50`, `89b4e8a`, `63d1997` | Existing unassigned legacy clients without `businessId` or a valid `businessLine` remain uneditable until assigned. Full API/frontend runtime validation is pending. |
| CLI-002 | High | CRM → client deletion / manufactured-home pricing | `mfh_client_pricing` and `production_price_overrides` have `ON DELETE CASCADE` references to clients; the old DELETE path also explicitly deleted `client_billing_profiles`. Deleting a client could silently destroy its client-specific pricing and billing configuration. | **Fixed**; delete now locks the scoped client in a transaction and returns 409 while billing profiles or either client-pricing set exists. Link-counts and the delete dialog expose these dependencies. Regression test added, not executed | `a186068`, `4e56159`, `18ace5e`, `63d1997` | Users must transfer or remove saved billing/pricing settings before deletion; no transfer UI exists yet. Historical job/invoice/estimate associations are still detached by the existing delete design. |
| CLI-003 | High | CRM → client deletion / data retention | The client DELETE endpoint still permanently removes the `clients` row and nulls historical links rather than archiving it. This conflicts with Constitution Rule 19 (Delete = archive first) and risks losing the customer-to-history relationship even when no pricing dependencies exist. | **Blocked**; archive/restore lifecycle and schema migration have not been implemented | — | Client deletion remains destructive for linked operational/financial history. Next batch must implement an archive path or disable permanent deletion until one exists. |

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

## Client isolation and deletion batch (2026-11-06)

- Reviewed the latest branch head, the 17 commits since `b607aaa`, the branch-vs-master comparison, the existing findings ledger, `.agents/architecture/CONSTITUTION.md`, `.agents/memory/business-isolation.md`, `.agents/architecture/SYSTEM_REGISTRY.md`, and `docs/schema-api-contract-inventory.md` before changing code. No concurrent branch commits were observed during this batch; all 17 commits since the checkpoint are the client-scope/deletion work described here.
- Fixed client mutation boundaries in `artifacts/api-server/src/routes/clients.ts`: PUT, PATCH business-line, and DELETE now resolve the source owner, verify the existing client belongs to that owner, and constrain the final write by the same owner predicate. PUT/PATCH use dedicated `sourceBusinessId` / `sourceBusinessLine` fields so a destination `businessLine` cannot be mistaken for the source owner.
- Added shared source-owner serialization in `artifacts/contractor-app/src/lib/clientBusinessScope.ts`. Updated Clients, People & Properties, Address Book quick-edit, and Client Profile service-date callers to send source ownership. ID-based delete and link-count requests now include the source selector.
- Documented the source-owner fields in `lib/api-spec/openapi.yaml` and synchronized the generated API request types.
- Prevented silent cascade deletion of client billing profiles, MFH client pricing, and production price overrides. The delete path locks the scoped client in a transaction and refuses deletion with HTTP 409 while any of those settings remain. The link-count endpoint and Clients dialog now show these protected dependencies.
- Added `artifacts/api-server/src/routes/clients-business-scope.test.ts` for cross-business update/delete rejection, destination-vs-source reassignment, and pricing-preservation behavior; updated `mileage-surcharge.test.ts` fixtures for the newly scoped client update path.

### Validation and limitations for this batch

- Inspected the final branch diff against `b607aaa5b4fae22eebc4e035e65fe40b4c0ec89b`: 17 commits, 12 changed files, all confined to client routes/callers, API contract/types, and focused tests. No unrelated files were overwritten.
- Branch comparison: 388 commits ahead of `master` and 0 behind; `master` unchanged. No open pull request. The latest code commit had no status contexts, and no Actions runs were returned for the branch.
- Tests, typecheck, and build were **not executed**. This environment has GitHub file/commit access but no local repository checkout or package runtime. Added tests are therefore **found/fixed with regression coverage authored, not target-tested**; no pass is claimed.
- No migration, production data, credentials, merge, or deployment was changed.

### Remaining client risks

- `DELETE /api/clients/:id` still permanently deletes the client row. The current route detaches jobs, estimates, invoices, and prospects, and FK `SET NULL` relationships can detach route stops, Square payment mirrors, and other-income rows. This violates the repository's archive-first data-retention rule and is recorded as CLI-003; a proper archive/restore lifecycle is still required.
- Client-specific billing/pricing settings are protected from cascade loss, but users must transfer or remove them before deletion; there is no transfer UI.
- Client-profile route-stop reads and other linked child records still need a dedicated cross-business integrity review. The present batch only closes the ID-based client mutation gap and protects the identified cascade-owned settings.
