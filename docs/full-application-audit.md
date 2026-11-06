# Full-Application Audit Ledger

**Last updated:** 2026-11-06  
**Repository:** `christopherlwillard-debug/Business-Managment-Pro`  
**Audit branch:** `audit/website-studio-find-fix-2026-11-05`  
**Production boundary:** audit branch only; no production data, credentials, `master`, merge, or deployment changes.

## Branch and audit baseline

- `master` was at `135a42696556ef9df91417b3dfe0a87b06cb05ca` when this batch began.
- The original ledger baseline was 360 commits ahead and 0 behind; the recurring-expense fix moved it to 361 ahead. At the start of the client-isolation batch, branch head was `b607aaa5b4fae22eebc4e035e65fe40b4c0ec89b` (371 ahead, 0 behind). The archive-safety code batch ended at `24e920e57caab5200187160a63fa05c5c966b161` (394 ahead, 0 behind); subsequent commits in this file only update the audit ledger. `master` remained `135a42696556ef9df91417b3dfe0a87b06cb05ca`.
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
| CLI-002 | High | CRM → client deletion / manufactured-home pricing | `mfh_client_pricing` and `production_price_overrides` have `ON DELETE CASCADE` references to clients; the old DELETE path also explicitly deleted `client_billing_profiles`. Deleting a client could silently destroy its client-specific pricing and billing configuration. | **Fixed**; a scoped row lock and dependency check protect billing profiles and both pricing tables; the endpoint now also blocks all permanent deletes until archive/restore exists. Link-counts and the Clients dialog expose protected dependencies. Regression test added, not executed | `a186068`, `4e56159`, `18ace5e`, `a362189` | No transfer UI exists; billing/pricing settings must be transferred or removed as part of a future archive workflow. |
| CLI-003 | High | CRM → client deletion / data retention | The original client DELETE endpoint permanently removed the `clients` row and detached historical links instead of archiving it, contrary to Constitution Rule 19. | **Blocked**; as an interim safeguard, DELETE returns 409 without changing data for every client and destructive UI actions are disabled. Archive schema and restore workflow remain unimplemented | `a362189`, `fc8b428`, `29a4489`, `669475c`, `24e920e` | Clients cannot yet be archived or removed from active lists. Historical relationships lost through earlier deletes cannot be reconstructed automatically. |
| RTE-001 | Medium | Route Planner → create/update linked stop | The RoutePlanner edit caller sends partial payloads (including `jobId`) without `clientId`. The API validated only when both IDs were present in the request body, so changing only the job or only the client skipped the cross-reference check. Separate foreign keys on `route_stops.client_id` and `route_stops.job_id` do not enforce that the job belongs to the linked client. | **Fixed**; create validates referenced jobs and partial updates merge omitted link values from the existing row before checking the effective pair; six focused route tests authored, not executed | `a3c17be9588c03e0df27241bd683c672938ee2c0`, `f7dff0a1485547dd9528de4a8c8d87f633ec6218` | Historical mismatched pairs have not been inventoried or repaired. Prospect/client relationship integrity and target-runtime validation remain open. |

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

- Reviewed the latest branch head, the 22 code commits since `b607aaa`, the branch-vs-master comparison, the existing findings ledger, `.agents/architecture/CONSTITUTION.md`, `.agents/memory/business-isolation.md`, `.agents/architecture/SYSTEM_REGISTRY.md`, and `docs/schema-api-contract-inventory.md` before changing code. No concurrent branch commits were observed during this batch; all 22 code commits since the checkpoint are the client-scope/deletion work described here.
- Fixed client mutation boundaries in `artifacts/api-server/src/routes/clients.ts`: PUT, PATCH business-line, and DELETE now resolve the source owner, verify the existing client belongs to that owner, and constrain the final write by the same owner predicate. PUT/PATCH use dedicated `sourceBusinessId` / `sourceBusinessLine` fields so a destination `businessLine` cannot be mistaken for the source owner.
- Added shared source-owner serialization in `artifacts/contractor-app/src/lib/clientBusinessScope.ts`. Updated Clients, People & Properties, Address Book quick-edit, and Client Profile service-date callers to send source ownership. ID-based delete and link-count requests now include the source selector.
- Documented the source-owner fields in `lib/api-spec/openapi.yaml` and synchronized the generated API request types.
- Prevented silent cascade deletion of client billing profiles, MFH client pricing, and production price overrides. The delete path locks the scoped client in a transaction and refuses deletion with HTTP 409 while any of those settings remain. It also blocks all permanent client deletion until archive/restore support exists. The link-count endpoint and Clients dialog show the protected dependencies.
- Added `artifacts/api-server/src/routes/clients-business-scope.test.ts` for cross-business update/delete rejection, destination-vs-source reassignment, pricing-preservation, and archive-required behavior; updated `mileage-surcharge.test.ts` fixtures for the newly scoped client update path.

### Validation and limitations for this batch

- Inspected the final branch diff against `b607aaa5b4fae22eebc4e035e65fe40b4c0ec89b`: 22 code commits across 12 code files plus the audit-ledger updates, confined to client routes/callers, API contract/types, and focused tests. No unrelated files were overwritten.
- At the archive-safety code-batch head, the branch was 394 commits ahead of `master` and 0 behind; `master` unchanged. Subsequent commits only update this audit ledger. No open pull request. The latest code commit had no status contexts, and no Actions runs were returned for the branch.
- Tests, typecheck, and build were **not executed**. This environment has GitHub file/commit access but no local repository checkout or package runtime. Added tests are therefore **found/fixed with regression coverage authored, not target-tested**; no pass is claimed.
- No migration, production data, credentials, merge, or deployment was changed.

### Remaining client risks

- `DELETE /api/clients/:id` now returns HTTP 409 before detaching any child record or deleting the client. This is an interim data-preservation guard for CLI-003; a proper archive/restore lifecycle and UI are still required. Previously deleted client relationships are not reconstructed.
- Client-specific billing/pricing settings are protected from cascade loss and remain intact while deletion is disabled; no transfer UI exists for the future archive workflow.
- Client-profile route-stop reads and other linked child records still need a dedicated cross-business integrity review. The present batch only closes the ID-based client mutation gap and protects the identified cascade-owned settings.

## Route Planner relationship-integrity batch (2026-11-06)

- Pre-run review confirmed branch head `f304a9f6ea87581e67155948b8f9f080454b9e1c`, no concurrent commits since the previous checkpoint, and `master` at `135a42696556ef9df91417b3dfe0a87b06cb05ca`. Reviewed this ledger, `.agents/architecture/CONSTITUTION.md`, `SYSTEM_REGISTRY.md`, `DECISIONS.md`, `CHANGELOG.md`, the route-stop schema, clients/prospects/jobs schemas, the route-stop API, RoutePlanner callers, and client-profile projections before changing code.
- Confirmed root cause: the RoutePlanner edit workflow sends partial updates. The API checked `jobId` against `clientId` only when both were present in the request body, rather than resolving the omitted relationship from the stored route stop. The database has independent foreign keys, so it permits a route stop whose job and client disagree.
- Updated `artifacts/api-server/src/routes/route-stops.ts`: job references are checked on create; updates that change either relationship load the current row, derive the effective job/client pair, and reject missing jobs or mismatched pairs before writing. Job-only stops and unrelated field edits remain supported. No schema, ledger, or ownership model changed.
- Added `artifacts/api-server/src/routes/route-stops.test.ts` with six focused cases: mismatched create rejection, valid job-only create, partial job reassignment rejection, partial client reassignment rejection, valid partial reassignment, and unrelated title edit on a legacy mismatched row.
- Updated `.agents/architecture/CHANGELOG.md` to record the completed fix.

### Validation and limitations for this batch

- Inspected the final diff from `f304a9f6ea87581e67155948b8f9f080454b9e1c`: exactly three commits and three files (route implementation, focused test file, architecture changelog). No concurrent commits or unrelated file changes were present.
- Before this ledger update, the branch was 403 commits ahead of `master` and 0 behind; the merge base remained `135a42696556ef9df91417b3dfe0a87b06cb05ca`. No open pull requests were returned.
- GitHub returned no Actions workflow runs and no combined status contexts for the prior checkpoint commit. This environment has no local checkout of the repository and no package runtime; the six tests, API typecheck, and build were **not executed**. No test pass is claimed.
- No production data, credentials, `master`, merge, or deployment was changed.

### Residual risks and next work

- Existing route-stop rows with a mismatched job/client pair were not queried or repaired; production data was intentionally untouched.
- `prospectId` combined with `clientId` is a separate relationship that still needs validation against `prospects.client_id`.
- Continue with invoice/payment lifecycle and subcontractor payroll reconciliation, then return to route-stop scheduling atomicity and broader route-planner behavior. Runtime validation remains a prerequisite for marking this batch target-tested or fully validated.
