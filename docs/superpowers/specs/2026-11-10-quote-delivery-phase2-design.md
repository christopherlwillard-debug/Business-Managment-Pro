# Quote Delivery and Customer Responses — Phase 2

**Status:** Architecture approved; user-approved deletion rule incorporated; written specification is awaiting final review.
**Scope:** Secure delivery and online customer responses for the existing Quote Center only.  
**Date:** 2026-11-10

## 1. Goal and boundaries

Extend the existing `estimates` workflow so an authorized internal user can email a branded PDF and secure quote link, and a customer can view and respond without an account. Preserve the exact customer-facing revision that was sent.

This is Phase 2 only. Do not implement manual/offline acceptance, work authorization, reminders, job conversion, or later-phase workflows. Online acceptance records a customer response only; it does not authorize work or create a Job Card.

No second estimate builder, quote database, CRM, pricing engine, PDF engine, email provider, or storage provider is introduced. No historical estimates are backfilled or rewritten. Do not publish or change production data.

## 2. Architecture review

1. **Existing overlap:** The existing Quote Center, `estimates` records, estimate PDF route, quote PDF generator, `sendEmail`, and invoice communication history cover the adjacent concerns. Public token pages already exist for other domains, but none for estimates.
2. **Existing tables:** `estimates` owns quote content; `clients`, `businesses`, and settings provide customer, legal/division, branding, terms, and validity data. `invoice_communication_events` is invoice-only and requires an invoice foreign key.
3. **Existing APIs:** `artifacts/api-server/src/routes/estimates.ts` handles estimate CRUD, PDF, and conversion. `artifacts/api-server/src/routes/invoices.ts` and `artifacts/api-server/src/lib/invoiceCommunication.ts` show the prepare/finalize delivery-event pattern. Public routers are mounted before internal authentication in `artifacts/api-server/src/routes/index.ts`.
4. **Existing UI:** `artifacts/contractor-app/src/pages/Estimates.tsx` is the Quote Center. `artifacts/contractor-app/src/App.tsx` has public token-route patterns but no customer quote page.
5. **Existing calculations:** `artifacts/api-server/src/lib/estimate-totals.ts` owns estimate total and customer-selling-price derivation. The estimate PDF route verifies the saved total against customer-facing lines, tax, and adjustment. These calculations must not change.
6. **Reports:** Estimates are pre-sale and are not directly included in financial reports. Delivery and response events must not become revenue or payment data.
7. **Source of truth:** `estimates` remains the source of truth for current working quote content and pricing. A frozen customer-safe snapshot tied to a send event is the source for that sent revision and its public page.
8. **Duplicate-system risks:** Reusing the invoice event table would couple estimates to invoice foreign keys and invoice-only lifecycle rules. Storing only fields on `estimates` would lose append-only attempts, multiple recipients, response history, and immutable revisions. A dedicated event/history table is justified, but it is not a second quote database.
9. **Extension choice:** Extend estimates with one append-only quote-delivery/response event table; use the existing private App Storage and existing Gmail sending infrastructure. Do not add a new email or storage provider.
10. **Recommendation:** Keep all pricing in the existing estimate engine. Add token-gated public access and an estimate-linked event history, with immutable customer-safe snapshots and private PDF objects.

## 3. Existing implementation findings

- `lib/db/src/schema/estimates.ts` already holds client/job links, work address, customer-facing terms, line items, tax/adjustment inputs, totals, business ownership, and quote expiry.
- Estimate creation already uses each business's `defaultQuoteValidityDays` and `defaultQuoteTerms`; the configured validity default is capped at one year and defaults to 30 days.
- `GET /estimates/:id/pdf` uses the existing branded PDF generator, resolves business/DBA branding, and excludes internal notes and input costs from the customer document.
- `artifacts/api-server/src/lib/sendEmail.ts` sends through the existing Gmail connector and supports a PDF attachment. `invoiceEmail.ts` provides the existing SMTP/Gmail patterns; quote sending must use quote-specific content and the existing PDF rather than invoice wording or a second PDF generator.
- The existing storage service writes to `PRIVATE_OBJECT_DIR`; private object downloads require authenticated access and default to owner-only. Quote files must use a private path and a quote-specific authorized retrieval endpoint.
- App Storage pricing is currently $0.015/GiB-month with a 7-day minimum, $0.05/GiB transfer, $0.0004 per 1,000 basic operations, and $0.005 per 1,000 advanced operations. As an illustration, 1,000 files of 1 MiB each cost about $0.015/month in stored capacity; downloading that set once transfers about 0.98 GiB, about $0.049, plus request costs. Actual cost depends on file sizes, volume, and downloads.
- App Storage has no automatic versioning, lifecycle rules, or per-object retention policy. Objects persist until explicitly deleted; deletion is irreversible. The approved retention behavior is to keep sent snapshots indefinitely, never overwrite them, and perform no automatic deletion. Token expiration or revocation does not delete an archived document.
- Existing Gmail responses confirm provider acceptance and return a message ID; they do not prove inbox delivery. Show `Delivered` only if an actual provider delivery confirmation is available. Do not label Gmail acceptance as delivery.

## 4. Data model and immutable revisions

Add one additive `estimate_quote_events` table. It records revision snapshots, pending/finalized send attempts, views, and online responses, all linked to the existing estimate and exact revision. The table is not another estimate record or pricing source.

The table must support:

- Estimate ID, canonical business ID, revision number, event type/status, actor, recipient, timestamps, provider/message IDs, idempotency key, and safe error details.
- A canonical customer-safe JSON snapshot and stable content hash for the exact document and public page.
- A private PDF object path, populated only for the successfully sent snapshot; unique paths prevent overwrite.
- A private immutable logo asset copy for the sent revision when the quote uses a logo. The public page and PDF use this copy, never the business's mutable current-logo path.
- A one-way reference from send/view/response events to the immutable revision snapshot.
- A hash of a cryptographically random public token, expiry time, activation state, and revocation time. Never store the raw token.
- A uniqueness constraint that makes repeated customer decision submissions idempotent for the same revision.

The snapshot allow-list includes business display identity/contact, quote number/date/revision/expiry, customer and work-site details, work description, customer-facing line amounts, subtotal, adjustment, tax, total, and terms. The logo is stored as a separate immutable private asset and referenced internally by the snapshot; the reference is never returned to public clients. The snapshot excludes internal estimate notes, costs, markup/contingency inputs, formulas, and internal API fields.

The same customer-visible content hash identifies an unchanged revision. Resending it reuses its existing snapshot and PDF. Editing the working estimate does not create a customer-visible revision or revoke a sent token. At send time, changed customer-visible content creates the next revision and its new PDF. The currently active token stays valid until the new revision has provider acceptance durably checkpointed; then the new token is activated and older tokens for that estimate are revoked as one transition. If the new send definitely fails or remains unresolved, the previously accepted revision stays active. Customer responses remain attached to the immutable revision they opened. Existing estimates without a saved expiry use the existing business validity setting for the sent snapshot without rewriting the historic estimate row.

Snapshots and their logo assets are retained indefinitely. Estimate deletion is rejected once any revision has been provider-accepted, and is also blocked while a send outcome is unresolved; unsent estimates with only definitively failed attempts retain the existing draft-deletion behavior. Accepted quote history and stored files must not cascade-delete.

## 5. Delivery and failure behavior

1. The Send Quote action opens a confirmation surface with the customer's saved email prefilled and editable; sending requires a valid confirmed recipient.
2. The server rechecks estimate ownership/access, recomputes the customer-safe snapshot with existing calculations, and refuses to send if the saved quote total does not reconcile.
3. A pending event and inactive token are created before provider work. The server generates the PDF and logo copy, writes them to private staging objects, and attaches the same PDF to an email containing the secure link. The token is not usable while delivery is pending.
4. After confirmed Gmail acceptance, persist the provider message ID as an acceptance checkpoint before finalizing the event. Once that checkpoint exists, activate the new token and revoke tokens for older accepted revisions in the same transition, even if later event finalization fails; an internal repair can finish the event without resending. Only then mark the estimate Sent.
5. On a definite provider rejection, finalize the attempt as failed, revoke its token, delete staged objects, leave a never-sent estimate unsent, and permit a deliberate retry. The App Storage 7-day minimum may still bill for deleted staging objects.
6. On an uncertain provider outcome, retain staged objects and provider evidence, keep the token inactive, leave the attempt unresolved, and block automatic resend. Resolve or reconcile the event before allowing a retry; never risk a duplicate email silently.
7. If the provider accepted the email but the process failed before saving the message-ID checkpoint, keep the token inactive and the attempt unresolved. Reconcile against provider evidence before activating the token or permitting a retry. A customer who clicks before activation receives a safe unavailable/retry message, not quote data.

“Sent” means provider acceptance, not confirmed inbox delivery. “Delivered” appears only when an explicit provider delivery confirmation exists. With the current Gmail sender, delivery generally remains unconfirmed.

## 6. Public quote access and responses

- Add a customer page at a dedicated public route (for example `/quote/:token`) and public API routes mounted before `requireAuth`.
- A token is generated with cryptographic randomness; only its hash is stored. It expires on the quote's effective expiry date and can be revoked. It is inactive until provider acceptance is durably checkpointed; a checkpointed token remains usable during event-finalization recovery. Unknown, inactive, expired, or revoked tokens fail closed.
- Public APIs return only the saved customer-safe snapshot for that revision. They never expose the estimate row, internal notes, costs, margins, object path, or signed storage URL.
- The customer page renders business branding/logo, quote number/date, customer/work-site information, scope, customer-facing pricing, tax/total, terms, and expiration.
- The page offers Approve Quote, Decline Quote, Request Changes, and Contact Willard's. Responses are attributed to the exact revision, recorded with server timestamp, and protected against duplicate/conflicting submissions. Decline reason is optional; change-request text is recorded without changing the sent snapshot.
- Opening the public page creates a verified view event. Public requests are rate-limited and do not require contractor-app login.
- Online approval records “approved online” only. It does not set work authorization, create a job, or rewrite the estimate's pricing/status into a won/authorized state.
- Internal historical-PDF retrieval is authenticated, access-checked, and estimate/business-scoped. Public token endpoints stream the PDF and immutable logo only after token validation; they do not return storage paths or direct object URLs.

## 7. API and UI work

- Extend `artifacts/api-server/src/routes/estimates.ts` with authorized send/history/PDF retrieval and keep all estimate writes scoped to the selected record's exact business/division.
- Add a public quote router before authentication for safe snapshot fetch, PDF streaming, view recording, and customer response submission.
- Reuse `sendEmail` and the existing Gmail connector; do not add an email integration. If the existing Gmail connection is unavailable, show the configuration/reconnection requirement and do not add a paid provider.
- Add the event schema and additive migration; update schema exports and OpenAPI before generated client code.
- Add a Send Quote action, recipient confirmation/edit field, activity/revision history, and delivery/response badges to the existing Quote Center. Keep the existing builder, routes, pricing, branding, and PDF generation intact.
- Add a customer-facing page without application authentication, while preserving all internal authentication and authorization checks.

## 8. Acceptance and security tests

1. A valid recipient is confirmed/edited before send; the email includes the existing branded PDF and tokenized link.
2. Successful provider acceptance with a message ID records the recipient, timestamp, revision, result, and snapshot and only then marks a first send Sent.
3. Definite failure does not mark an unsent quote Sent and permits an explicit retry; uncertain outcomes block duplicate sends.
4. A resend of unchanged customer-visible content reuses its PDF object; changed content creates a new snapshot; old snapshots are never overwritten. Editing a draft does not revoke the currently accepted revision's token; a newer accepted send does.
5. Sent PDF objects are private, owner/authorized-user retrieval is scoped, and no public response includes storage paths or signed URLs.
6. Customers without accounts can open only valid tokens; another estimate's token, revoked tokens, and expired tokens fail closed.
7. Public data includes only the allow-listed snapshot and never includes costs, internal notes, markup, contingency, or internal estimate responses.
8. Views, approval, decline, and change requests refer to the correct revision; repeated submissions cannot duplicate an approval or create conflicting decisions.
9. Online approval does not authorize work or create a Job Card.
10. PDF generation and existing estimate calculations remain unchanged; historical estimates are not migrated or rewritten.
11. Changing or deleting the current business logo does not change the logo shown on an already-sent revision.
12. Pending, failed, unresolved, and accepted send states enforce the specified token activation and retry rules; the prior accepted token remains active until the newer revision is checkpointed; a provider-accepted message with a failed finalization can be repaired without resending.
13. Deletion is blocked after a provider-accepted revision or while a send outcome is unresolved; unsent drafts remain deletable after only definite failures.
14. Replit storage billing assumptions, indefinite retention, and 7-day minimum for failed staged files are represented in product/operations notes. The estimate excludes the small logo-copy storage overhead.

## 9. Out of scope

- Manual/offline response recording and work authorization.
- Internal three-/seven-day follow-up reminders.
- Job creation/conversion and Phase 3/4 workflows.
- New email provider, new storage provider, public object storage, or automatic storage cleanup.
- Changes to financial reports, estimate calculations, invoice flows, historical records, or production deployment.

## 10. Review gate

The user approved private PDF snapshots, the stated storage cost controls, and indefinite retention. This written specification must be reviewed before the implementation plan is created. Implementation starts only after the user approves the reviewed written specification.
