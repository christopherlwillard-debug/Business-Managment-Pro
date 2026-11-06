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
| SQR-003 | High | Square integration → payment idempotency / revenue posting | Website-deposit and unmatched Tap-to-Pay paths commit the unique `square_payments.square_payment_id` claim before separately inserting `other_income` or updating an invoice. If the second write fails after the claim commits, Square retries are treated as duplicates and the revenue/invoice update is permanently skipped. | **Found**; transaction boundary and retry-safe posting not yet fixed | — | Needs one transaction for the idempotency claim plus the canonical invoice/other-income write, with failure-injection regression tests. |
| SQR-004 | High | Square integration → Tap-to-Pay invoice matching | The unmatched-payment path selects the oldest open invoice for a matched client and sets `status: "paid"` without comparing `amountMoney` with the invoice total or existing `amountPaid`. A partial card payment can therefore close the full invoice. | **Found**; amount-aware partial-payment allocation not yet fixed | — | Audit cash-basis reporting and payment-date attribution for partial receipts before changing invoice accounting; no payment history ledger currently records each manual partial payment. |

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
| SQR-003 | High | Square webhook → payment ingestion / revenue posting | In the unreferenced Tap-to-Pay path and website-deposit path, `square_payments` is inserted with `ON CONFLICT DO NOTHING` and committed before the corresponding `other_income` insert or invoice update. A later database failure leaves the unique provider payment claimed; a retry then exits on the conflict and never completes the canonical accounting write. | **Found; repair diagnosis complete, implementation gated** | — | Provider mirror and accounting ledger can diverge after partial failure. Requires one transaction coupling the unique claim and canonical write; verify transaction isolation and all reference-ID paths. |
| SQR-004 | High | Square Tap-to-Pay → invoice matching | The generic unmatched-reference path selects the oldest open invoice for a matched client, then unconditionally sets `status: "paid"` without comparing `amountMoney` to `total - amountPaid`. The payment amount is only logged. | **Found; repair diagnosis complete, implementation gated** | — | A partial receipt can close an invoice and overstate cash collected. Current aggregate invoice snapshot cannot preserve multiple receipt events or reversals; do not implement a partial-payment workaround without approved ledger/source-of-truth design. |
| SQR-005 | High | Square invoice payment-link webhook → invoice lifecycle | The explicit `inv_<id>` reference path also sets the invoice to `paid` unconditionally and ignores `amountMoney`; it does not update `amountPaid` or persist the Square payment ID through the `square_payments` mirror in this branch. This is a separate path from the generic client-matching defect in SQR-004. | **Found; repair diagnosis complete, implementation gated** | — | Invoice status, aggregate paid amount, provider reconciliation, and cash-basis reports can disagree. Requires tracing Square link amount/partial-payment semantics and existing manual/Stripe behavior before repair. |
| SQR-006 | Medium | Square payment mirror → invoice/client reconciliation | The generic path inserts `square_payments` with `clientId: null` and does not populate the available `invoiceId` / `invoiceNumber` fields even after matching a client and invoice. The schema explicitly supports these links, but the handler discards the matched relationship. | **Found; repair diagnosis complete, implementation gated** | — | Payment history cannot reliably explain which invoice/client received a provider payment; reporting and reconciliation may require fuzzy matching. Needs approved mapping semantics and regression fixtures. |

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
- **SQR-004 — implemented in the existing aggregate model:** generic Tap-to-Pay matching now adds the received amount to the invoice's existing `amountPaid` aggregate using integer cents and sets `partial` until the invoice balance is covered. It no longer marks every matched invoice paid regardless of receipt amount.
- **SQR-005 — implemented in the existing aggregate model:** explicit `inv_<id>` Square references now use the same amount-aware allocation and persist the Square payment mirror row. Cancelled invoices are not updated; already-paid invoices are not incremented again by a later distinct Square payment.
- **SQR-006 — implemented:** Square mirror rows now retain the matched `clientId`, `invoiceId`, and `invoiceNumber` for both generic invoice matching and explicit invoice references. Invoice business ownership is used for the mirror row when an invoice is matched.
- **SQR-007 — discovered and implemented in this batch:** `quick_<id>`, `prospect_<id>`, and `estimate_<id>` reference paths previously had no unique Square payment claim. Re-delivery could append duplicate prospect deposit events. Each now claims the provider payment in `square_payments` inside the same transaction before updating its target record. Prospect and estimate business/client ownership is copied from the referenced record; legacy quick charges use the existing General Contracting fallback because that table has no business ownership column.
- Invoice allocation is capped at the invoice total. The full provider amount remains visible in `square_payments`; any overage is not treated as additional invoice revenue and requires reconciliation.
- Added regression coverage for partial receipts, completion after a prior partial receipt, successive receipts using cents, overpayment capping, and invalid amounts. Existing signature-ingress tests remain in place.

### Residual accounting boundary

The existing `amountPaid` and provider timestamp fields remain aggregate/snapshot fields. They still cannot allocate each receipt, refund, or reversal to its actual tax year across Square, Stripe, manual receipts, and bank reconciliation. This batch deliberately does not change cash-basis reports or create a customer-payment event ledger. Overpayment excess is visible in the Square mirror but has no separate unapplied-credit workflow yet. Those remain separate architecture work, not silently solved by these route changes.

### Validation

- Reviewed the updated route and test source after the commits.
- Added five focused invoice-allocation assertions; **tests, TypeScript checks, and builds were not executed** because this session has no repository checkout/package runtime.
- GitHub Actions returned no workflow runs and the commit had no combined status checks at the time of inspection. No test pass is claimed.
- The audit branch remains separate from `master`; no merge, deployment, credentials, or production data were changed.
