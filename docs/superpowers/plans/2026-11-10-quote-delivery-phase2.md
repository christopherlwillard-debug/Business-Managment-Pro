# Quote Delivery and Customer Responses — Phase 2 Implementation Plan

**Status:** Prepared for user review; no implementation has started.
**Approved design:** `docs/superpowers/specs/2026-11-10-quote-delivery-phase2-design.md`
**Scope:** Phase 2 only. Do not start Phase 3 or Phase 4.

## Guardrails

- Reuse the current `estimates` records, estimate pricing functions, quote PDF generator, Gmail connector, and private App Storage.
- Do not alter quote pricing, tax, financial reports, invoices, historical estimates, or production data.
- Do not backfill or migrate existing estimates into sent-revision records.
- Keep internal costs, margin inputs, contingency inputs, internal notes, and object paths out of all customer responses.
- Do not publish or modify production while preparing or implementing this plan. Any production rollout requires separate approval.
- Keep sent PDF and logo objects immutable and private indefinitely. Do not add a new storage or email provider.
- Treat a provider acceptance checkpoint as the point at which a new public link becomes active and prior revision links are revoked.

## Implementation sequence

### 1. Add the quote-delivery event schema and additive migration

**Files**

- Add `lib/db/src/schema/estimate-quote-events.ts`.
- Export it from `lib/db/src/schema/index.ts`.
- Add the next numbered additive SQL migration under `lib/db/src/migrations/`.
- Update the existing API schema/OpenAPI contract source and regenerate the affected API types and hooks; do not hand-edit generated files.

**Work**

- Add one `estimate_quote_events` table; do not add a second estimate table.
- Use event rows for immutable sent-revision snapshots and related send attempts, public views, and customer responses. Each non-snapshot event references the revision snapshot row.
- Store canonical business ID, estimate ID, revision number, event type/status, recipient, actor, timestamps, provider/message IDs, idempotency key, safe error metadata, customer-safe JSON snapshot, and content hash.
- Store only a hash of the high-entropy public token, plus expiry, activation, and revocation timestamps. Never persist the raw token.
- Store the private PDF and frozen-logo object paths only on their revision snapshot row. Use unique generated object names; do not overwrite.
- Add database uniqueness for non-null send idempotency keys and one final customer decision per revision. Use foreign keys that preserve accepted history; failed-only draft deletion is handled transactionally in Step 4.
- Make the migration additive and safe for an existing database. No row backfill is needed.

**Reuse and rationale**

- `lib/db/src/schema/estimates.ts` remains the working quote/pricing record.
- `lib/db/src/schema/invoice-communication-events.ts` provides a useful event-field precedent, but is not reused because it is invoice-bound and has invoice-specific lifecycle rules.
- A separate event table is necessary to keep multiple immutable revisions, delivery attempts, and responses without turning events into quote pricing records.

**Checks**

- Schema/type tests verify relations, nullable values, status/event constraints, and the uniqueness rules.
- Confirm generated API contracts still represent current estimate endpoints unchanged.
- Review the SQL migration for additive-only behavior and confirm it does not touch existing rows.

### 2. Build customer-safe revision snapshot logic

**Files**

- Add `artifacts/api-server/src/lib/estimateQuoteSnapshot.ts`.
- Add focused tests beside it.
- Reuse `artifacts/api-server/src/lib/estimate-totals.ts`.
- Reuse `artifacts/api-server/src/lib/generateEstimateQuotePdf.ts`.
- Reuse the existing branding resolution used by `artifacts/api-server/src/routes/estimates.ts`.

**Work**

- Create a pure snapshot builder from the selected estimate, customer/work address, business branding, expiry, and existing calculated customer prices.
- Preserve the current saved-total reconciliation before any email or PDF is produced.
- Canonicalize only customer-visible fields and calculate a stable content hash; decimal values must be normalized consistently.
- Exclude internal notes, raw unit costs, markup and contingency inputs, formulas, and server-only fields.
- At send time, compare the customer-visible hash with the latest accepted snapshot:
  - Same hash: reuse that revision, its PDF, logo copy, and token.
  - Changed hash: allocate the next revision.
- Editing the working estimate alone must not revoke an already-sent token.

**Reuse and rationale**

- Current quote totals and selling-price expansion remain authoritative.
- The existing PDF generator remains the sole PDF implementation. The snapshot layer is needed to freeze precisely what the customer saw without duplicating pricing logic.

**Checks**

- Unit tests prove allow-listed fields are included and internal fields are absent.
- Verify identical content hashes identically and customer-visible changes produce a new hash.
- Verify a saved total mismatch blocks both send and snapshot creation.

### 3. Add private staging and immutable asset handling

**Files**

- Add a focused helper such as `artifacts/api-server/src/lib/estimateQuoteArchive.ts`.
- Reuse `artifacts/api-server/src/lib/objectStorage.ts`.
- Reuse `artifacts/api-server/src/lib/generateEstimateQuotePdf.ts`.

**Work**

- Read the current logo bytes once, store those bytes as a separate immutable private object, and pass the same captured bytes to the existing PDF generator so the archived PDF and public page use identical branding.
- Upload PDF and logo to unique paths under `PRIVATE_OBJECT_DIR` before sending. Do not use `PUBLIC_OBJECT_SEARCH_PATHS`.
- Attach the same staged PDF bytes to the email and retain those exact bytes after confirmed provider acceptance.
- On definite failure, best-effort delete both staged objects and record cleanup outcome. On uncertain or accepted-but-not-finalized outcomes, retain objects for recovery.
- Never return object paths, bucket names, or signed storage URLs from quote APIs.
- Set response cache headers so tokenized private quote assets are not cached publicly.

**Reuse and rationale**

- Existing `uploadBuffer`, `getObjectEntityFile`, `downloadObject`, and `deleteObject` operations cover private storage.
- An immutable logo copy is necessary because business settings can replace and delete the current logo; referencing that mutable path would change or break a previously sent quote.

**Checks**

- Storage tests verify private paths, unique objects, cleanup after definite failure, and retention after acceptance or uncertainty.
- Verify public route responses stream bytes through the server and never disclose a direct storage URL.

### 4. Implement internal send, history, repair, and deletion protections

**Files**

- Add `artifacts/api-server/src/lib/estimateQuoteDelivery.ts` for orchestration and state transitions.
- Extend `artifacts/api-server/src/routes/estimates.ts` with authenticated quote-delivery endpoints.
- Register schema and API contracts as required in Step 1.
- Update estimate delete controls in `artifacts/contractor-app/src/pages/Estimates.tsx`.
- Use `artifacts/api-server/src/routes/estimates-business-ownership.test.ts` as an existing scoping-test reference; add focused quote-delivery route tests.

**Proposed endpoints**

- `POST /estimates/:id/send` — recipient confirmation, idempotency key, send attempt.
- `GET /estimates/:id/quote-events` — authorized delivery and response history.
- `GET /estimates/:id/quote-events/:eventId/pdf` — authenticated, business-scoped historical PDF stream.
- `POST /estimates/:id/quote-events/:eventId/reconcile` — owner-only recovery action for an unresolved outcome, requiring explicit provider evidence and never sending another email.

**Work**

- Preserve existing `requireAuth`, `requireAccess`, `sectionGuard("estimates")`, and `businessReadPredicate` / canonical business checks. Confirm write access before every operation; do not trust a client-supplied business ID.
- Serialize send and delete decisions against the same estimate row so a concurrent delete cannot race a new send.
- Validate and confirm the recipient server-side; sanitize headers and escape email HTML using existing helpers.
- Create a pending attempt and inactive token before provider work; generate the PDF and email content from the snapshot.
- Extend `artifacts/api-server/src/lib/sendEmail.ts` only as needed to pass safe correlation metadata and return Gmail's provider/message IDs. Keep the existing Gmail connector and attachment format. Do not add an email provider.
- After acceptance, persist the message ID as a durable checkpoint, activate the new token and revoke prior accepted-revision tokens in the same transaction, then finalize the event and estimate's existing `sent` status.
- A definite rejection marks the attempt failed, revokes its inactive token, deletes staged objects, and leaves a never-sent estimate unsent.
- An uncertain outcome remains unresolved, retains staging objects, keeps its token inactive, and blocks automatic resend.
- If acceptance is known but finalization fails, use the saved message ID to repair state without resending. If no checkpoint exists, keep access inactive until an owner reconciles against provider evidence.
- Return a stable conflict response when a send is pending/unresolved, a customer response conflicts with a prior decision, or an estimate cannot be deleted.
- Block deletion after any provider-accepted revision and while an outcome is unresolved. Permit deletion for a draft with only definitively failed attempts, preserving current draft-delete behavior; remove only those failed-only event rows in the same transaction.
- The Quote History panel is the archive for sent revisions. Do not add a broad estimate soft-delete or archive state in this phase.

**Reuse and rationale**

- Estimate list/PDF routes already enforce business ownership and reconcile quote totals.
- `sendEmail` and `invoiceEmail.ts` provide the existing Gmail/MIME delivery pattern; invoice event routes are a lifecycle reference only.
- A small orchestration layer keeps the state machine and retry rules out of the React page and avoids an unsafe second send path.

**Checks**

- Test owner and authorized-section behavior, cross-business denial, idempotent double-submit, and same-estimate send/delete races.
- Test that accepted/unresolved history cannot be deleted and failed-only drafts can still be deleted.
- Test recovery after provider acceptance both with and without a saved message-ID checkpoint.

### 5. Add token-gated public quote routes

**Files**

- Add `artifacts/api-server/src/routes/public-quotes.ts`.
- Mount it in `artifacts/api-server/src/routes/index.ts` before the global `requireAuth` middleware.
- Add route tests beside the new public router tests.

**Proposed endpoints**

- `GET /public/quotes/:token` — customer-safe snapshot only.
- `GET /public/quotes/:token/pdf` — server-streamed archived PDF.
- `GET /public/quotes/:token/logo` — server-streamed frozen logo, when present.
- `POST /public/quotes/:token/responses` — approve, decline, or request changes.

**Work**

- Hash the presented token immediately and perform a constant-shape lookup; return the same unavailable response for invalid, expired, inactive, revoked, or unknown tokens.
- Require provider-acceptance checkpoint and valid expiry/revocation state before serving quote data.
- Return only the immutable allow-listed snapshot. Never query and serialize the live estimate row for public use.
- Stream PDF/logo through the API after token validation; never redirect to storage or return storage paths.
- Record a view event without recording raw tokens or raw IP addresses. Apply bounded request throttling to token fetches, asset streams, and responses; use a non-reversible request fingerprint if needed.
- Accept one final decision per revision. Make exact retries idempotent and reject conflicting decisions. A change request records text without editing the sent snapshot.
- Set `no-store`, `Referrer-Policy: no-referrer`, and appropriate indexing/security headers. Avoid third-party assets or analytics on token pages.
- Approval records an online response only; it must not set work authorization, convert a job, or alter financial/accounting data.

**Reuse and rationale**

- `artifacts/api-server/src/routes/index.ts` already mounts selected public routers before authentication.
- Existing token routes provide route-ordering conventions, but quote tokens use a hash-only storage model and do not reuse portal tokens or PIN sessions.

**Checks**

- Test invalid, expired, inactive, revoked, cross-estimate, and valid tokens.
- Test snapshot allow-listing, public PDF/logo streaming, no path leakage, and rate limits.
- Test exact retry, conflicting decision, and attempts to use a prior token after a newer accepted revision.

### 6. Add internal and customer-facing UI

**Files**

- Update `artifacts/contractor-app/src/pages/Estimates.tsx` for Send Quote, activity status, and delete-state handling.
- Add `artifacts/contractor-app/src/components/estimates/QuoteSendDialog.tsx`.
- Add `artifacts/contractor-app/src/components/estimates/QuoteHistoryPanel.tsx`.
- Add `artifacts/contractor-app/src/pages/PublicQuote.tsx`.
- Add a small customer-facing component for response confirmation only if needed; keep it separate from the internal editor.
- Add the public `/quote/:token` route to `artifacts/contractor-app/src/App.tsx` before the authenticated admin fallback.
- Regenerate/use the project’s API client hooks and types for the internal routes; use the existing API base/path helpers for public requests.

**Work**

- Send dialog shows recipient, quote amount, and the exact revision to send; recipient is editable and must be confirmed.
- Disable repeated clicks while sending and show pending, sent, failed, and unresolved states accurately. Do not label provider acceptance as “Delivered.”
- History panel lists each sent revision, recipient, date, send outcome, and customer response; historical PDF download uses the authenticated endpoint.
- Hide or disable delete for accepted/unresolved quote history and explain why. Keep the server-side delete guard authoritative.
- Customer page displays only snapshot fields, expiration, and the approve/decline/request-changes actions. Provide an explicit response confirmation and safe error state.
- Keep the existing quote builder, customer preview, and financial display unchanged.

**Reuse and rationale**

- `Estimates.tsx` already owns estimate listing, preview, permissions, and deletion controls; extend that workflow instead of adding another quote center.
- `App.tsx` already separates public token routes from the authenticated admin application; add the quote route to that public routing layer.
- Separate send/history components and a public page are necessary to keep customer-visible data and controls isolated from internal estimate costs and editing.

**Checks**

- Component tests cover recipient editing, send pending/error states, duplicate-click prevention, history status, and delete protection messaging.
- Public-page tests verify only customer data is rendered and that invalid/expired links show no quote details.
- Check desktop and mobile layouts for the modal and public quote page.

### 7. End-to-end verification and staged rollout

**Test coverage**

- Unit: canonical snapshot/hash, token hashing/expiry, revision selection, state transitions, response idempotency.
- API: recipient validation, business isolation, permissions, storage privacy, provider errors, uncertain results, recovery, delete race, and public data shape.
- Integration: full and partial delivery lifecycle with Gmail and storage mocked; no real email or persistent object writes in automated tests.
- Regression: existing estimate totals, PDF generation, create/update/delete for unsent drafts, and estimate-to-job conversion.
- Manual development verification: send to a controlled internal inbox, view the tokenized customer page, submit each response type, confirm owner history/PDF download, and verify retry behavior. Use no real customer recipient during testing.
- Run `pnpm --filter @workspace/api-server test`, `pnpm --filter @workspace/api-server run typecheck`, the contractor-app typecheck, and focused estimate/PDF contract checks.

**Rollout and rollback**

1. Apply the additive schema change to development only after code and tests are ready. Do not backfill estimates.
2. Verify a draft, a first send, a same-revision resend, a changed revision, a definite failure, an uncertain result, a recovered acceptance, a customer response, and a protected deletion in development.
3. Keep production untouched until the user separately approves rollout. At rollout, apply the additive schema before enabling send UI/API.
4. If a release must be rolled back, disable the send/public routes and UI while preserving the event rows and private objects. Do not drop the event table or delete snapshots as rollback cleanup.
5. Resolve pending/uncertain events before re-enabling sends. Never automatically resend an uncertain message.
6. Roll back code through the normal checkpoint/release process. Any schema rollback must be non-destructive and must not remove accepted quote history.

**Reuse and rationale**

- Use the existing API server test/typecheck commands and the current development app/API workflows.
- Mock Gmail and object storage in automated tests so test runs cannot email customers or create persistent objects; use a controlled internal inbox only for the explicitly manual development check.
- A staged rollout is necessary because the additive event schema, send endpoint, and public token route must be compatible before the UI exposes sending.

## Dependencies and cost

- No new external service, email provider, storage provider, or pricing library is planned.
- Existing Gmail connector and `PRIVATE_OBJECT_DIR` must be configured and available. Gmail acceptance confirms provider acceptance, not inbox delivery.
- App Storage rates reviewed for this design: about $0.015/GiB-month, $0.05/GiB egress, plus request charges; a 7-day minimum can apply even when failed staging objects are deleted. Sent PDFs and frozen logos are retained indefinitely, so storage usage grows with sent revisions and downloads.
- The earlier 1,000 × 1-MiB estimate covers PDF bytes only; frozen logo copies add a small, variable amount. Actual cost depends on quote volume, file size, and download frequency.
- No paid per-use provider is introduced. No automated retention/deletion job is planned.

## Approval boundary

This plan is for Phase 2 only. It does not authorize database changes, storage writes, email sends, production changes, publication, or Phase 3/4 work. Begin implementation only after the user approves this plan.
