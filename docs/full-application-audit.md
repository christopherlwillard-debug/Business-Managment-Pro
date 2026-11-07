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
| SQR-001 | High | Square integration → public webhook ingress | `app.ts` mounted `/api/webhooks/square` before `express.json`; the route then dereferenced `req.body.type`, so the webhook received no parsed body and returned 500. | **Fixed**; JSON parsing now precedes the public webhook mount and exact raw bytes are captured for HMAC validation | `d573f931d97d4585f7e5eed4bec3c59d75884f96`, `1c37634bc5f1d054bad21f371196db082edbee50` | No live Square callback was exercised; target-runtime delivery still needs verification. |
| SQR-002 | High | Square integration → webhook authenticity | The public webhook is intentionally mounted before `authMiddleware`, but the handler skipped verification if either the signature key or header was absent. Once parsing is active, an unsigned callback could forge payment-completed events and mutate invoice/receipt state. The old verifier also compared signatures with ordinary string equality and the handler re-serialized JSON instead of using the exact signed bytes. | **Fixed**; require configured key and signature in every environment, reject absent raw body, verify exact captured bytes, and compare HMAC buffers with `timingSafeEqual`; four focused tests authored, not executed | `8280e33a280b385284f3d42953c6855b150125b5`, `4120224fb988796072f870ef70cd241abce95c70`, `8c48fa56491b89648fbbea7974898322a344fd42`, `ff46a616b473502d926edd499e8d347316fa3463`, `f6ab82f36f148edfe591554b9908fe9782f3d9fe` | Square secret/header configuration and signed delivery must be confirmed in Development before production rollout; no credentials were changed. |
| SQR-003 | High | Square integration → payment idempotency / revenue posting | Earlier code committed the unique `square_payments.square_payment_id` claim separately from invoice/other-income posting. Current `master` wraps the full `handleSquarePayment` mutation path in one `db.transaction`, including the payment claim and downstream invoice, prospect, estimate, quick-charge, or `other_income` writes. | **Implemented in current master; source-inspected after PR #1 merge; failure-injection and PostgreSQL validation pending** | Current source: `artifacts/api-server/src/routes/square-webhook.ts` | Transaction rollback on a forced downstream write failure has not been demonstrated by an executed test or target PostgreSQL run. Keep the fix classified as code-present, not runtime-verified. |
| SQR-004 | High | Square integration → Tap-to-Pay invoice matching | Current `master` uses `calculateSquareInvoicePayment` with integer cents and applies the same amount-aware allocation to explicit invoice-reference and fallback invoice matches. Underpayments remain `partiallyPaid`; an invoice becomes `paid` only when accumulated allocation reaches its total. | **Implemented in current master; helper regression cases are present; runtime and report-reconciliation validation pending** | Current source: `artifacts/api-server/src/routes/square-webhook.ts`; tests: `artifacts/api-server/src/routes/square-webhook.test.ts` | The invoice `amountPaid` remains an aggregate snapshot, not a complete customer receipt/refund ledger across all payment methods. Overpayment excess remains visible in `square_payments` for reconciliation; verify all cash-basis report surfaces before treating end-to-end accounting as complete. |

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

## Square webhook security and payment-reliability batch (2026-11-06)

- Pre-run review confirmed the previous branch head `303c5cfa66678e9d689df9723a37a64fbe6b6a62`, no concurrent commits since the previous checkpoint, and `master` at `135a42696556ef9df91417b3dfe0a87b06cb05ca`. Reviewed the Square section of `SYSTEM_REGISTRY.md`, `DECISIONS.md`, the architecture changelog, `app.ts`, the public webhook route, the HMAC helper, Square/invoice/other-income schemas, invoice payment routes, and the existing invoice regression tests.
- Confirmed the webhook was mounted before `express.json` and before authentication by design. Since the route had no local parser, `req.body` was undefined and the handler returned 500 when reading the event type.
- Confirmed the public callback skipped HMAC verification when the key or signature header was missing. The previous verifier also used `JSON.stringify(req.body)`, which does not preserve the exact signed request bytes.
- Fixed the ingress and signature boundary:
  - `app.ts` now parses JSON before mounting the public Square webhook and stores the exact raw body only for that webhook path.
  - `square-webhook.ts` rejects missing signature keys (503), missing signatures (401), missing raw body (400), and invalid signatures (400) in all environments.
  - `square.ts` compares HMAC buffers with `timingSafeEqual`.
  - Added `artifacts/api-server/src/routes/square-webhook.test.ts` with four focused tests for missing header, invalid signature, exact raw-body verification, and missing-key fail-closed behavior.
- Updated `.agents/architecture/CHANGELOG.md`. No schema, payment ledger, or provider credential was changed.

### Additional Square findings discovered for the next batch

- The idempotency claim in `square_payments` is not transactionally coupled to the invoice/other-income write in two ingestion paths. A failure after the unique claim commits makes retries skip the missing canonical revenue write.
- The unmatched Tap-to-Pay path marks the oldest open invoice paid regardless of whether the payment amount covers the invoice total or existing partial balance. This can prematurely close an invoice. These are recorded as SQR-003 and SQR-004 and remain **found**, not fixed.

### Validation and limitations for this batch

- Inspected the code diffs and test file after the commits. The batch changes only `app.ts`, `square-webhook.ts`, `square.ts`, the new webhook test, the architecture changelog, and this audit ledger.
- Before this ledger update, the branch was 412 commits ahead of `master` and 0 behind, with merge base `135a42696556ef9df91417b3dfe0a87b06cb05ca`. No open pull requests were returned.
- No GitHub Actions workflow runs or combined status contexts were returned for the code checkpoint. There is no local repository checkout or package runtime in this execution environment; the four webhook tests, TypeScript checks, and builds were **not executed**. No test pass is claimed.
- No production data, credentials, `master`, merge, or deployment was changed.

### Next priority

- Fix SQR-003 with a transaction that couples the unique Square payment claim to the canonical invoice or `other_income` mutation.
- Fix SQR-004 with amount-aware invoice allocation and regression tests, after tracing how partial receipts are represented in dashboard, P&L, tax, and year-end cash-basis reports.


## Square payment diagnosis — 2026-11-06

**Repair gate:** Diagnosis only. No payment/accounting behavior was changed in this batch. Constitution Rule 55 requires explicit approval for financial-ledger and accounting-logic repairs. The existing architecture memory `.agents/memory/accounting-repair-guardrails.md` also documents that the invoice `amountPaid` field is an aggregate snapshot and cannot represent multiple receipts, refunds, or event dates. A partial-payment repair must therefore be designed against the established source-of-truth constraints before implementation.

| ID | Severity | Subsystem / workflow | Evidence and root cause | Status | Fix commit | Residual risk |
|---|---|---|---|---|---|---|
| SQR-003 | High | Square webhook → payment ingestion / revenue posting | The current `handleSquarePayment` implementation encloses the provider-payment uniqueness claim and related canonical invoice/other-income/deposit mutations in one `db.transaction`, so a failed downstream write should roll back the claim with the mutation. | **Implemented in current master; source-inspected; database failure-injection validation pending** | `artifacts/api-server/src/routes/square-webhook.ts` | No executed test has demonstrated rollback after a forced downstream failure. Confirm all supported Square reference-ID paths and PostgreSQL transaction behavior before closing operational validation. |
| SQR-004 | High | Square Tap-to-Pay → invoice matching | The current fallback path calls `calculateSquareInvoicePayment` with the invoice total, aggregate amount already paid, and incoming payment cents; it writes `partiallyPaid` until the allocated balance reaches the invoice total. | **Implemented in current master; helper cases authored; route/database and report validation pending** | `artifacts/api-server/src/routes/square-webhook.ts`; `artifacts/api-server/src/routes/square-webhook.test.ts` | The aggregate invoice snapshot still cannot represent all payment/refund events across every payment method. Verify report surfaces and payment-date attribution before declaring end-to-end accounting complete. |
| SQR-005 | High | Square invoice payment-link webhook → invoice lifecycle | The current explicit `inv_<id>` reference path locks the invoice, records the unique Square payment mirror, and applies the same integer-cent partial-payment allocation used by the fallback path. | **Implemented in current master; helper cases authored; explicit-reference route and report validation pending** | `artifacts/api-server/src/routes/square-webhook.ts`; `artifacts/api-server/src/routes/square-webhook.test.ts` | Route-level tests do not yet exercise the full database transaction and invoice update. The invoice aggregate is not a universal receipt/refund event ledger; verify reconciliation across cash-basis report surfaces. |
| SQR-006 | Medium | Square payment mirror → invoice/client reconciliation | The current generic Tap-to-Pay path persists the resolved `clientId` and, when an invoice is matched, its `invoiceId` and `invoiceNumber` in the Square payment mirror. | **Implemented in current master; source-inspected; route/database reconciliation tests pending** | `artifacts/api-server/src/routes/square-webhook.ts` | Unmatched or ambiguous payments intentionally retain null client/invoice attribution. Verify the resulting mirror against payment-history and cash-basis report surfaces; no runtime validation is claimed. |

### Evidence inspected

- `artifacts/api-server/src/routes/square-webhook.ts`: `handleSquarePayment` explicit `inv_` branch; website-deposit insert-before-other-income sequence; generic Tap-to-Pay claim-before-invoice-match sequence; unconditional invoice-paid update.
- `lib/db/src/schema/invoices.ts`: invoice `total`, aggregate `amountPaid`, `squarePaidAt`, and `stripePaidAt` fields.
- `lib/db/src/schema/square-payments.ts`: unique `squarePaymentId`, `invoiceId`, `invoiceNumber`, and `clientId` relationship fields.
- `artifacts/api-server/src/routes/square-webhook.test.ts`: existing tests cover signature ingress only; no tests cover payment-claim rollback, amount allocation, explicit invoice reference handling, or mirror relationship persistence.
- `.agents/memory/accounting-repair-guardrails.md`: explicitly warns that the invoice aggregate cannot prove multiple receipts, refunds, or event dates and requires source-record-first accounting design.

### Repair impact review

- **Tables:** `square_payments`, `invoices`, `other_income`; potentially an existing canonical payment-event table only if architecture review confirms one.
- **APIs:** `POST /api/square-webhook`; invoice/payment read paths; reconciliation endpoints.
- **Pages:** Invoices, Square Transactions, Accounting, Banking/reconciliation.
- **Reports:** Dashboard, P&L, cash-basis revenue, Schedule C, tax/year-end reports, reserve calculations.
- **Accounting:** Direct impact on receipt amount, invoice balance, payment date, idempotency, and revenue recognition.
- **Permissions:** Public signed webhook boundary; no user-session authorization change proposed.
- **Multi-business:** Must preserve business ownership from invoice/client and website configuration; never fall back to an unrelated business for a matched invoice.
- **Tax calculations:** Cash-basis receipt timing and amount may change; must be tested across all affected report surfaces.
- **Inventory:** No direct effect identified.

### Next repair scope

The smallest safe next repair is **SQR-003: make each existing Square ingestion path atomic with its canonical accounting write**, without changing allocation rules or adding a new ledger. Before implementation, confirm transaction support in the route's test harness and inspect the remaining Square reference paths. SQR-004/005/006 remain separate financial repairs and require their own explicit approval and source-of-truth design.


## Square payment reliability implementation — 2026-11-06

**Approval and architecture review:** The user authorized fixes to the four previously named Square findings (SQR-003 through SQR-006). The required ten-point review consulted the system registry, decisions, changelog, existing routes, schemas, UI projections, invoice calculations, cash-revenue helper, and tax/report consumers. The implementation reuses `invoices`, `other_income`, and `square_payments`; it adds no table, migration, report calculation, or new source of truth.

- **SQR-003 — implemented:** `handleSquarePayment` now performs its database reads and writes through one Drizzle transaction. The unique Square payment claim and the related invoice or `other_income` write now commit or roll back together. Website-deposit submission/prospect updates are included in that same transaction. The explicit invoice-reference path now also claims the provider payment inside the transaction.
- **SQR-004 — implemented in the existing aggregate model:** generic Tap-to-Pay matching now locks the selected invoice row, adds the received amount to the existing `amountPaid` aggregate using integer cents, and sets the canonical `partiallyPaid` status until the balance is covered. The row lock serializes concurrent receipts and prevents lost aggregate updates. It no longer marks every matched invoice paid regardless of receipt amount.
- **SQR-005 — implemented in the existing aggregate model:** explicit `inv_<id>` Square references now use the same amount-aware allocation under an invoice row lock and persist the Square payment mirror row. Cancelled invoices are not updated; already-paid invoices are not incremented again by a later distinct Square payment.
- **SQR-006 — implemented:** Square mirror rows now retain the matched `clientId`, `invoiceId`, and `invoiceNumber` for both generic invoice matching and explicit invoice references. Invoice business ownership is used for the mirror row when an invoice is matched.
- **SQR-007 — discovered and implemented in this batch:** `quick_<id>`, `prospect_<id>`, and `estimate_<id>` reference paths previously had no unique Square payment claim. Re-delivery could append duplicate prospect deposit events. Each now claims the provider payment in `square_payments` inside the same transaction before updating its target record. Prospect and estimate business/client ownership is copied from the referenced record; legacy quick charges use the existing General Contracting fallback because that table has no business ownership column.
- **INV-PAY-001 — discovered and fixed alongside this batch:** Plaid's invoice-receipt path wrote the noncanonical status `partial`, while the invoice lifecycle, generated status type, UI filters, job summaries, and Plaid invoice matching all use `partiallyPaid`. The route now uses an exported status helper and regression tests cover partial and fully paid states. Square uses the same canonical `partiallyPaid` vocabulary.
- Invoice allocation is capped at the invoice total. The full provider amount remains visible in `square_payments`; any overage is not treated as additional invoice revenue and requires reconciliation.
- Added regression coverage for partial receipts, completion after a prior partial receipt, successive receipts using cents, overpayment capping, and invalid amounts. Existing signature-ingress tests remain in place.

### Residual accounting boundary

The existing `amountPaid` and provider timestamp fields remain aggregate/snapshot fields. They still cannot allocate each receipt, refund, or reversal to its actual tax year across Square, Stripe, manual receipts, and bank reconciliation. This batch deliberately does not change cash-basis reports or create a customer-payment event ledger. Overpayment excess is visible in the Square mirror but has no separate unapplied-credit workflow yet. Those remain separate architecture work, not silently solved by these route changes.

### Validation

- Reviewed the updated route and test source after the commits.
- Added five focused Square invoice-allocation assertions, a completed-payment missing-ID ingress test, and two Plaid canonical-status assertions; **tests, TypeScript checks, and builds were not executed** because this session has no repository checkout/package runtime.
- GitHub Actions returned no workflow runs and the commit had no combined status checks at the time of inspection. No test pass is claimed.
- The audit branch remains separate from `master`; no merge, deployment, credentials, or production data were changed.


## Route Planner reliability and storage-boundary review — 2026-11-06

**Branch checkpoint:** `master` remained at `135a42696556ef9df91417b3dfe0a87b06cb05ca`. The audit branch was 440 commits ahead and 0 behind; no open pull request was present. The latest reviewed code includes the Square/Plaid invoice fixes recorded above plus this Route Planner batch. No production data or credentials were accessed or changed.

### Findings and repair status

| ID | Severity | Subsystem / workflow | Evidence and root cause | Status | Fix commits | Residual risk |
|---|---|---|---|---|---|---|
| RTE-002 | Medium | Route Planner → split daily stops into crew blocks | `POST /route-stops/split-blocks` updated rows with independent `Promise.all` writes. A failure midway could leave one day with mixed old/new block assignments. The handler also accepted non-integer values; `NaN` could reach integer columns and fail after some sibling writes had already committed. | **Fixed in code; five focused regression cases authored, not target-tested** | `4ae5af56`, `fbd1447b`, `87e53c05`, `0cd524ca`, `ad470241` | The mocked test verifies the transaction boundary and request validation, but actual PostgreSQL rollback behavior has not been exercised. |
| RTE-003 | Medium | Route Planner → repair missing geocodes | `POST /route-stops/fix-geocoding` selected only rows with null latitude. A row with latitude present and longitude null was never retried, even though the map and route calculations require both coordinates. | **Fixed in code; focused regression case authored, not target-tested** | `b2ba39d9`, `5fa4efa5` | Existing partially geocoded rows are not bulk-repaired; the owner must run the existing repair action. |
| RTE-004 | Medium | Route Planner → active-business visibility and linked jobs | `route_stops` has no canonical `business_id`; its API is owner-only but does not accept/apply a business selector. The page still fetches every route stop and builds the day list without filtering by active business. Its linked-job lookup previously returned any job from `allJobs`, bypassing the active-business filter already used by the client-based fallback. | **Partially fixed; linked-job display now respects active business; full stop scoping remains gated under Rule 55** | `9489a561`, `0f1d9a43`, `df66bc52` | Directly linked job details from another business are no longer displayed in the selected business view. Route stops themselves remain shared until the owner/assignment policy is explicitly decided; no schema or record assignment was changed. |
| STO-001 | Medium | Object Storage → presigned upload capability | `POST /storage/uploads/request-url` is mounted after global authentication/approval checks but has no owner or section edit guard. It creates a generic `/uploads/{uuid}` object path whose download policy defaults to owner-only. The request's declared size/type are returned as metadata and are not bound to the signed PUT URL. | **Partially fixed; non-owner URL minting is blocked; actual size/type enforcement remains unresolved** | `58e599f7`, `d45bd4a7` | Generic uploads now require the owner, matching the existing default object-download policy. The signed URL still does not enforce the supplied size/content type. No current application-page caller was found; do not claim the metadata limits the actual GCS upload. |
| SQR-008 | Medium | Square Tap-to-Pay → automatic invoice matching | The generic fallback resolved clients by provider ID/email/name and selected open invoices by clientId alone; ambiguous client matches also selected an arbitrary row. | **Fixed in code; focused business-condition and ambiguous-identity tests authored, not executed** | `1541bf49`, `bb500fe8`, `dbfc3941`, `f5b75250`, `0b894685`, `25399639` | Invoice candidates must match the client's resolved canonical businessId; legacy invoices with null businessId are eligible only when businessLine matches. Ambiguous client matches are not assigned to an arbitrary client or business; their receipt is retained without invoice/client attribution. No production payment records were changed. |

### Route Planner code changes

- Made the entire daily block assignment one database transaction; row updates now execute sequentially inside it so a failed update rolls back the whole day's split.
- Validate the date format and require an integer block size from 1 through 1000 before opening the transaction.
- Treat a missing request body as a normal validation error instead of a server error.
- Geocoding repair now selects rows where either latitude or longitude is null.
- Added five cases to `artifacts/api-server/src/routes/route-stops.test.ts`: invalid block size, malformed date, empty request, all-row transactional split, and a row with only longitude missing.

### Architecture and validation boundaries

- Re-read the system registry, business-isolation memory, route-stop schema, route-stop router, RoutePlanner page, route registration, storage route, object-storage service, auth middleware, and section/owner guards before recording the findings.
- Route Planner is mounted behind `requireOwner`; RTE-004 is a business-view/record-assignment consistency issue, not an unauthenticated exposure.
- Storage's generic presigned-upload endpoint is distinct from the guarded server-side upload routes used by receipts, asset receipts, compliance files, and website media. No caller was found for the generic generated endpoint; intended access policy remains unconfirmed.
- Five focused Route Planner tests were added/updated. **No tests, TypeScript checks, builds, or PostgreSQL integration checks were executed**: this environment has GitHub file/commit access but no local repository checkout or package runtime. No test pass is claimed.
- No architecture registry, schema, production data, credentials, `master`, merge, or deployment was changed.

### Next risk-based batches

1. Resolve RTE-004 and STO-001 authorization/ownership policy before changing their contracts.
2. Trace SQR-008 against multi-business client/invoice fixtures; preserve the existing cash-basis limitation for partial receipts and event-year attribution.
3. Continue authentication/section-permission coverage across all API mounts, then audit estimate/job/checklist, subcontractor payroll, manufactured-home, asphalt, Plaid, imports/exports, and background-worker workflows.


## Payroll history and authentication reliability review — 2026-11-06

### Findings

| ID | Severity | Subsystem / workflow | Evidence and root cause | Status | Fix commit | Residual risk |
|---|---|---|---|---|---|---|
| SUB-PAY-001 | High | Subcontractors → payment-history year/date filters and CSV | The old loader summed all active ledger events while filtering by one job-level date. | **Fixed in code; event-period regression tests authored, not executed** | 076fbebc, e31f5a82, ab1af3d6 | Ledger totals and displayed effective dates are now calculated from canonical payment_date events inside the selected year/date range. Legacy cached totals remain only for jobs with no canonical ledger rows. PostgreSQL/runtime validation remains pending. |
| SUB-PAY-002 | High | Subcontractors → reversed payment history | The old history loader treated an all-reversed ledger as if no ledger existed and fell back to stale cached paid amount/status. | **Fixed in code; reversal regression tests authored, not executed** | 1dc3529f, e31f5a82, ab1af3d6 | Any canonical ledger row now suppresses cached fallback; reversed rows are excluded from the sum, event date, and displayed paid status. Legacy fallback remains for jobs with no ledger rows. No historical data was rewritten. |
| AUTH-001 | Medium | Authentication → OIDC access-token refresh | refreshIfExpired previously caught every discovery/token-refresh error and returned null; authMiddleware then deleted the persisted session. Transient outages were treated like revoked refresh tokens. Concurrent requests could also race rotating refresh tokens. | **Fixed in code; eight focused regression cases authored, not target-tested** | `33cd8976`, `f3ca7a58`, `9582f886`, `b38d3b6c` | Cross-process rotation is handled by re-reading the persisted session after invalid_grant; distributed locking is not introduced. Retryable failures leave the user unauthenticated for that request while preserving the session for a later retry. |

### Evidence traced

- Subcontractor payment-history loader and filters in artifacts/api-server/src/routes/subcontractors.ts.
- Canonical pay-worker insert in artifacts/api-server/src/routes/jobs.ts: event paymentDate, plus cached amountPaid, paidAt, and lastPaidAt.
- Reversal route in artifacts/api-server/src/routes/expenses.ts: marks the original ledger row reversed; it does not clear the job assignment's cached paid amount.
- Existing payment-history tests cover CSV escaping and pure date filtering, but not event-date aggregation or the all-records-reversed fallback.
- OIDC refresh and session deletion in artifacts/api-server/src/middlewares/authMiddleware.ts; eight dedicated auth-middleware refresh regression cases were added in this pass.
- .agents/memory/sub-pay-dual-rates.md and .agents/memory/sub-payment-ledger.md confirm that sub_payment_records is the canonical payroll event ledger and that the pay-worker route stores net amount plus applied advanceAmount; those invariants were preserved.

### Scope decision

SUB-PAY-001 and SUB-PAY-002 affect payroll reporting and payment-history totals. They are recorded, not changed, because the architecture constitution requires explicit approval before altering financial calculations. AUTH-001 has since been repaired with explicit invalid_grant classification, retryable failure handling, and per-session refresh coordination.

### Validation

- Source paths and callers were traced; no production payroll rows, session records, or provider credentials were accessed.
- No tests, TypeScript checks, or runtime authentication exercises were run in this environment. No validation pass is claimed.
- The audit branch remains isolated from master; no merge, deployment, or production data change was made.

### Authentication repair details

- `openid-client` is pinned at `6.8.2`; its `ResponseBodyError` exposes the OAuth response's `error` code. Only an explicit `invalid_grant` is treated as a definitive rejected refresh token. Discovery errors, network errors, provider errors such as `server_error`, and session-store failures are treated as retryable.
- A retryable refresh failure does **not** authenticate the current request with an expired access token, but it also does not delete the session or clear the cookie. A later request can retry after the provider/session store recovers.
- An expired session without a refresh token, or one receiving a definitive `invalid_grant`, is still cleared.
- Added per-session in-process single-flight refresh so simultaneous requests share one token refresh. If a separate server process wins a rotating refresh-token race, the losing process reloads the session and detects a changed refresh token or later expiry—even if the access token string is unchanged—before deciding whether to clear the session.
- Expiry timestamp `0` is now treated as expired rather than as a missing expiry value.
- Added eight middleware regression cases: transient network failure, temporary OAuth server error, definitive invalid_grant, cross-process token rotation, successful token persistence, concurrent same-session refresh, zero expiry, and missing refresh token.
- No session schema, cookie policy, OIDC provider settings, or authorization rules were changed.

**Validation:** The eight tests were authored and source-reviewed. Tests, TypeScript checks, builds, and live OIDC exercises were not run because this session has no local package runtime. No runtime pass is claimed.


## Generic object upload authorization correction — 2026-11-06

- The generic presigned-upload route is mounted after global authentication/approval checks but has no owner/section edit guard. It signs an object under the generic `uploads/{uuid}` prefix, while the existing object-download policy defaults unknown paths to owner-only.
- Restricted URL creation to the owner, aligning upload authorization with the current default download policy and preventing approved non-owner accounts from minting uploads they cannot subsequently access.
- Added two focused tests: approved non-owner is rejected before URL signing; owner can still obtain the signed URL.
- **The supplied size and content-type remain advisory metadata only.** The Replit sidecar signing contract currently signs only bucket, object, method, and expiry; it does not bind a maximum byte count or content type. That part remains open rather than pretending the metadata is enforcement.
- **Tests and TypeScript checks were not executed** in this environment; regression tests are authored only.

## Route Planner active-business linked-job display correction — 2026-11-06

- The direct `jobId` lookup in Route Planner bypassed the active-business filter used by its client-based fallback. It could therefore show a General Contracting job's details in the Asphalt view.
- The lookup now uses the active business slug before returning linked job details. No route-stop record is hidden, reassigned, or migrated; the unresolved shared-stop ownership policy remains open.
- Added four focused utility tests for same-business, other-business, no-business-selected, and missing-job cases.
- **Tests and TypeScript checks were not executed** in this environment; this is a code change with regression tests authored, not target-tested.

## Route Planner map rendering correctness — 2026-11-06

### Finding

| ID | Severity | Subsystem / workflow | Evidence and root cause | Status | Fix commits | Residual risk |
|---|---|---|---|---|---|---|
| RTE-005 | Medium | Route Planner → map pins, initial map center, route optimization, and geocode refresh | The page used truthiness checks (`lat && lng`) in map fitting, initial center selection, and geocoded-stop counts. Valid coordinates containing zero were discarded. `MapFitter` also depended only on the number of geocoded stops, so changing a stop's coordinates without changing that count left the map centered on stale bounds. A separate missing-pin indicator checked latitude only and missed rows with longitude missing. | **Fixed in code; four focused helper regression tests authored, not target-tested** | `52c69ab0`, `a4e62a05`, `a9d2a765`, `cb6d4669`, `a882d717` | UI rendering and Leaflet behavior still need browser validation; no runtime or build check was available. |

### Repair details

- Added shared coordinate validation that accepts valid zero coordinates, rejects null/non-finite/out-of-range coordinates, and provides a stable key based on stop IDs and coordinates.
- Map fitting now refits when actual coordinates change even if the number of mapped stops remains unchanged.
- Initial map center and route-optimization geocoded-stop counts now use the same coordinate validation.
- Map fitting receives the full stop list and filters internally, rather than receiving a list already filtered by truthiness.
- Missing-pin detection now catches either latitude or longitude being null.
- Added four regression cases covering zero coordinates, invalid coordinates, same-count coordinate changes, and stable keys.

### Branch and validation

- Rechecked the existing audit branch before editing; six commits had landed since the prior checkpoint, and their Route Planner code/tests and ledger changes were preserved.
- Re-read Rule 55, the system registry, Route Planner API/schema/UI, and the current audit ledger before this single-system UI repair.
- No business ownership, record assignment, schema, or financial behavior changed.
- **No tests, TypeScript checks, builds, or browser tests were executed** because this session has GitHub repository access but no local package runtime. Tests are authored only; no pass is claimed.
- The branch remains separate from `master`; no merge, deployment, or production data change was made.

### Outstanding higher-priority findings

- `RTE-004`: Route Planner's shared stop records and active-business UI selection need an explicit ownership policy before repair.
- `STO-001`: Generic presigned uploads need a confirmed authorization and actual object-size/content-type enforcement policy.
- `SQR-008`, `SUB-PAY-001`, and `SUB-PAY-002`: repair code and focused regression coverage have been added; execution and target-runtime validation remain pending.
- `AUTH-001`: OIDC transient-refresh logout and refresh-token concurrency defect is fixed in code; runtime validation remains pending.


## Financial history and Square ownership repair — 2026-11-06

- SQR-008: The generic Square fallback now limits candidate invoices to the client's resolved canonical business. Canonical businessId matches are preferred; legacy rows without businessId are eligible only when businessLine matches the client. The Square mirror inherits the resolved business, and unmatched payments continue to be recorded as Other Income under the client's business. Added focused business-condition and unique/ambiguous client-match tests.
- SUB-PAY-001: Payment history now filters both the ledger sum and displayed effective date by canonical sub_payment_records.payment_date for the requested year or date range. The job start date is no longer substituted when canonical ledger rows exist but no active payment falls in the selected period. Added regression coverage for cross-year events and date-window filters (`076fbebc`, `66bbb4c0`, `ab1af3d6`).
- SUB-PAY-002: Any canonical ledger row now prevents fallback to the legacy cached job_subcontractors.amount_paid, including when every ledger row is reversed. Reversed entries contribute neither to the sum nor the event date; a zero active ledger amount displays as unpaid. Existing job payment status is otherwise preserved across date-filtered views. Legacy cached values are used only when no canonical ledger rows exist. Added regression coverage for all-reversed history (`1dc3529f`, `e31f5a82`, `6599db4b`, `ab1af3d6`).
- These changes preserve the canonical ledger and do not rewrite payment records, cached historical rows, or production data.
- Validation limitation: tests, typecheck, build, accounting gate, and PostgreSQL integration checks have not been executed in this environment. The focused regression tests are authored only; no pass is claimed. The branch remains isolated from master.

- Added `.github/workflows/audit-validation.yml` to run API tests, contractor-app tests, and typecheck/production builds on audit-branch pushes and PRs (`d5a549d9`). The connector has not returned a workflow run for this branch yet, so CI execution is not confirmed.


## Post-merge source reconciliation — 2026-11-07

### Scope and evidence

This is a source/documentation reconciliation after full-application PR #1 and bidding-system PR #2 were merged to `master`. It does not change financial calculations, ownership, schema, production data, credentials, or deployment.

- Re-read `artifacts/api-server/src/routes/square-webhook.ts`, its focused test file, `artifacts/api-server/src/routes/route-stops.ts`, `lib/db/src/schema/route-stops.ts`, `artifacts/api-server/src/routes/storage.ts`, `artifacts/api-server/src/lib/objectStorage.ts`, and the accounting/business-isolation architecture memories.
- SQR-003 is no longer accurately described as unfixed in source: `handleSquarePayment` encloses the unique Square payment claim and its related invoice/other-income/deposit mutations in one database transaction. This source inspection does not prove rollback behavior under a real database failure.
- SQR-004 is no longer accurately described as unfixed in source: explicit invoice references and fallback invoice matches use integer-cent allocation; partial receipts leave invoices `partiallyPaid`. The helper has unit cases in `square-webhook.test.ts`, but tests were not executed in this environment.
- The existing invoice `amountPaid` remains an aggregate snapshot. The Square payment mirror captures Square provider payment events, but it does not establish a unified customer receipt/refund ledger for every manual and provider payment path. Cash-basis report reconciliation remains required.
- RTE-004 remains open: `route_stops` has no `business_id`; the API GET returns route stops without active-business filtering. The linked-job business check prevents cross-business job detail leakage, but it does not assign or scope the stop itself. A canonical stop ownership/assignment policy is still required before schema or record-assignment changes.
- STO-001 remains partially fixed: generic upload URL minting is owner-only and metadata validation rejects unsupported declared sizes/types. The Replit sidecar signing request still binds only bucket, object, method, and expiry; the declared size/content type are not enforced by the signed PUT URL. No caller was found for the generic endpoint in this inspection.

### Repair gates and validation

- Constitution Rule 55 requires a complete diagnosis and explicit approval before changing financial/accounting logic, business ownership/record assignment, schema/source-of-truth tables, or existing behavior. This reconciliation is diagnosis/documentation only; no such implementation was performed.
- No GitHub Actions run was returned for either merge commit by the available commit-run lookup. No local package runtime or target PostgreSQL environment was available. No test, typecheck, build, rollback, or browser pass is claimed.
- Next safe work: add executable failure-injection coverage for the Square transaction and complete cash-basis report/source reconciliation only after the required accounting approval; obtain an explicit Route Planner stop-ownership policy before changing its schema/API; decide whether the generic upload route should remain owner-only or be replaced by an authenticated server-side upload flow that enforces byte size and content type.


## Follow-up architecture diagnosis — Route Planner and generic uploads — 2026-11-07

### RTE-004 — confirmed shared route-stop ownership gap

**User-visible impact:** Route Planner can display and mutate the same stop collection while the user switches between business views. This is not a public/unauthenticated exposure: the Route Planner API is mounted behind owner authorization. It is a business-context and data-assignment consistency defect.

**Source evidence:**
- `lib/db/src/schema/route-stops.ts` defines `route_stops` without a canonical `business_id` or `business_line` ownership column.
- `artifacts/api-server/src/routes/route-stops.ts` GET builds date-only predicates and returns all matching stops; it does not filter by active business.
- POST accepts a `businessLine` request property but does not persist it in `route_stops`.
- PUT also accepts `businessLine` for linked-job validation, but does not persist or scope the stop by it.
- Reorder, split-blocks, clear-blocks, fix-geocoding, update, and delete mutations operate on stop IDs/dates without business ownership predicates.
- `artifacts/contractor-app/src/pages/RoutePlanner.tsx` sends the active business slug on create/edit, but its stop query key and API call remain global: `["/api/route-stops"]` and `GET /route-stops`.
- Linked-job display filtering is already in place, but it does not scope the stop record itself.

**Confirmed vs. unresolved:** Shared visibility and unscoped stop mutations are confirmed from source. The intended ownership policy is not known: stops may be global route-planning objects, business-owned records, or records assigned through linked client/job/prospect ownership. Existing rows have no authoritative owner field, so a migration that guesses ownership could misassign records.

**Repair gate:** Rule 55 explicit approval is required before changing business ownership, record assignment, schema, or mutation behavior. Do not implement a guessed business-line filter or migration. Required owner decision: should every stop belong to exactly one business, be global across businesses, or support explicit multi-business assignment? If owned, define how existing unlinked stops are assigned.

### STO-001 — confirmed generic signed-upload contract limitation

**User-visible impact:** The generic upload URL endpoint validates declared filename, size (up to 25 MB), and content type, but the actual direct-to-storage PUT is not bound to the declared size or content type.

**Source evidence:**
- `artifacts/api-server/src/routes/storage.ts` validates metadata, then calls `getObjectEntityUploadURL()` without passing the validated size/content type.
- `artifacts/api-server/src/lib/objectStorage.ts` signs the generic upload URL with bucket, object, method, and expiry only.
- The route currently requires owner access and no application-page caller was found in the inspected Route Planner/storage references. Separate server-side upload paths exist for receipts, asset receipts, compliance, and website media.

**Confirmed vs. unresolved:** The declared metadata is not cryptographically or server-side enforced by this generic URL flow. The practical exposure is constrained by owner-only URL minting and a 15-minute signed URL. No non-owner access defect is claimed. It remains unclear whether the unused generic endpoint should be removed, retained as owner-only, or replaced with a server-side upload proxy that enforces byte count and MIME/content sniffing.

**Repair gate:** No implementation performed. Decide whether the generic endpoint has an intended product caller before changing/removing behavior. If retained, design enforcement at the storage boundary, not by trusting client-declared metadata.

### Additional confirmed preservation constraint — CLI-003

The client DELETE route currently returns HTTP 409 for all clients after its scoped dependency checks; it does not delete or archive a client. This preserves records but leaves no supported archive/restore lifecycle. Treat this as a known product gap, not a broken delete that should be re-enabled. Archive/restore requires its own design for child records, pricing, billing profiles, audit history, and restoration behavior.

### Validation boundary

This is a source-only diagnosis. No schema, business assignment, financial logic, storage behavior, production data, credentials, or deployment was changed. No tests or runtime validation are claimed.


## Subcontractor advance report-parity diagnosis (2026-11-07)

- Reviewed current `master` after PR #4, including `artifacts/api-server/src/routes/reports.ts`, `artifacts/api-server/src/routes/tax-reports.ts`, `artifacts/api-server/src/routes/subcontractors.ts`, the subcontractor payment reversal route in `artifacts/api-server/src/routes/expenses.ts`, and the subcontractor YTD regression tests.
- Confirmed a report-calculation inconsistency for fixed/allocation subcontractor payment rows: the Accounting report and `computeYtd` calculate the payment total as `amount + COALESCE(advance_amount, 0)`, while Schedule C Line 11 currently sums only `amount` from `sub_payment_records`. The Schedule C query otherwise filters by payment date, excludes reversed rows, limits compensation type to fixed/allocation, and applies the selected business predicate.
- This means records with a nonzero `advanceAmount` can produce different contract-labor totals in Accounting / subcontractor YTD versus Schedule C. The current source comments describe advances as amounts deducted from net pay, and YTD includes them in total paid; however, the exact intended tax basis and whether `amount` is net or gross must be confirmed against the pay-worker write path and owner/accountant policy before changing the calculation.
- Reversal behavior was also inspected: the existing reversal endpoint marks the original row `isReversal=true` with a required reason, and report/YTD queries exclude reversed rows. No duplicate reversal row is created by that endpoint.

| ID | Severity | Subsystem / workflow | Evidence and root cause | Status | Residual risk |
|---|---|---|---|---|---|
| TAX-001 | High | Subcontractor payments → Accounting / 1099 YTD / Schedule C parity | Accounting and `computeYtd` include `amount + advanceAmount`; Schedule C Line 11 includes only `amount`. Payment records with advances may therefore be reported differently across surfaces. | **Confirmed source-level inconsistency; diagnosis only** | Verify pay-worker amount semantics and tax treatment with the owner/accountant. Then add a shared calculation helper and regression fixtures for normal, advance, reversed, hourly, and business-scoped records. No tax or payment behavior changed. |

### Validation boundary

- Source inspection only; no database records, tax filings, payment history, credentials, or production settings were read or changed.
- No tests were executed in the target runtime. This is a documentation-only finding, not a claim that the financial calculation is fixed.
- No schema, accounting, tax, ownership, or production behavior was changed.


## Dashboard business-breakdown canonical ownership diagnosis (2026-11-07)

### RPT-002 — confirmed legacy-slug-only attribution in dashboard business breakdown

**User-visible impact:** Dashboard per-business revenue, expense, subcontractor-cost, and active-job breakdowns can omit or misattribute records when their canonical `businessId` is correct but the compatibility `businessLine` value is null or stale. The selected-business KPI queries already use canonical ownership; the all-business breakdown is calculated separately and still groups by the legacy slug.

**Source evidence on current `master`:**
- `artifacts/api-server/src/routes/reports.ts` selects complete invoice, expense, other-income, job, and subcontractor payment rows, including canonical `businessId` where available.
- The `reportBusinessWhere` helper in the same file explicitly prefers canonical `businessId` and uses `businessLine` only for rows whose canonical owner is null.
- In the dashboard breakdown block, `rawInvoices.filter(i => i.businessLine === bl)`, `rawOtherIncome.filter(o => o.businessLine === bl)`, `rawExpenses.filter(e => e.businessLine === bl ...)`, and `rawActiveJobs.filter(j => j.businessLine === bl)` assign rows using only the legacy slug.
- The same block groups fixed/allocation subcontractor payments in `subPayByBl` using `r.businessLine ?? "unattributed"`, despite selecting `r.businessId` in the query.
- The resulting values feed `byBusinessLine` totals for revenue, expenses, operational net profit, and active jobs. This is separate from the already-canonical selected-business KPI query path.
- The frontend's Expenses page uses canonical `businessId` first and only falls back to `businessLine` for legacy rows, consistent with the architecture memory and system registry.

**Confirmed vs. unresolved:** The source-level attribution inconsistency is confirmed. Whether existing production records currently have null or stale slugs is not known; no production data was queried. This diagnosis does not claim a measured dollar impact.

**Smallest proposed repair:** Use one shared canonical ownership predicate for each dashboard breakdown group: match a non-null `businessId` to the business ID; use the slug only when `businessId` is null. Apply the same rule to invoices, other income, expenses, jobs, and fixed/allocation subcontractor payments. Preserve the existing all-business view and unattributed bucket semantics, with explicit regression fixtures for (1) matching ID + matching slug, (2) matching ID + null slug, (3) matching ID + stale slug, (4) null ID + matching legacy slug, and (5) null ID + unknown slug.

**Repair gate:** Rule 55 requires explicit approval because this changes financial report attribution and business scope. No implementation performed. Before code changes, confirm whether you approve correcting dashboard breakdown attribution to follow canonical `businessId` with legacy-slug fallback only for null-owned rows.

### Validation boundary

- Source inspection only; no production records or financial totals were accessed or changed.
- No application code, schema, tax calculation, payroll, business ownership, credentials, or deployment was changed.
- No runtime test or UI validation is claimed. Regression tests and the full validation workflow are required after approval.
