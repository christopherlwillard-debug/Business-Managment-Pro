# Quote Review Before Send — Design

**Status:** Design approved by the user; written spec pending review

**Owner:** Estimates / Quote Center
**Scope:** Require an owner to review the exact customer PDF before an email can be sent.

## Problem

Quote preview and quote sending are currently separate actions. The owner can open the Send Quote dialog and send without first viewing the customer PDF. The email is not sent automatically, but the interface does not enforce the requested review step.

The current Q-37 preview also shows a pricing-reconciliation error. The PDF route returns HTTP 409 when calculated customer pricing does not match the saved estimate total; the send route performs the same validation. The underlying saved values have not been inspected or changed, so this design does not assume which value is wrong.

## Goals

- Require an explicit review of a successfully generated PDF before sending.
- Send the exact frozen quote revision and PDF that were reviewed.
- Require a separate final Send quote action; opening, previewing, downloading, or acknowledging the PDF never sends email.
- Keep quote decisions, work authorization, estimate conversion, and accounting behavior unchanged.
- Show pricing and PDF failures as readable application errors and block sending until resolved.

## Non-goals

- Automatically correcting estimate totals or line items.
- Sending reminders or quotes automatically.
- Changing customer acceptance or work-authorization semantics.
- Adding a new table, quote ledger, or price calculation engine.
- Modifying production data, deployment, or public quote hosting.

## Architecture review

1. **Existing systems:** The Estimates page and Quote Center already share estimate records and the quote-event lifecycle.
2. **Existing tables:** `estimates` owns editable estimate content and pricing. `estimate_quote_events` owns frozen revisions, delivery attempts, and quote history. No new table is needed.
3. **Existing APIs:** `GET /api/estimates/:id/pdf` renders the current estimate; `GET /api/estimates/:id/quote-events/:eventId/pdf` serves a stored revision PDF; `POST /api/estimates/:id/send` currently prepares the latest revision and sends it.
4. **Existing UI:** `Estimates.tsx`, `QuoteCenterBoard`, `CustomerQuotePreview`, and `QuoteSendDialog` contain the relevant entry points and dialogs.
5. **Existing calculation:** `buildEstimateQuoteSnapshot` uses `expandEstimateLinesForInvoice` and validates that customer totals reconcile. Preview and send must use this shared snapshot builder rather than separate pricing logic.
6. **Reports and accounting:** Estimates are pre-sale documents, are not directly used in reports, and do not affect revenue until converted to invoices.
7. **Source of truth:** Editable estimate content stays in `estimates`; a reviewed/sent document is the frozen revision stored in `estimate_quote_events`.
8. **Duplicate-system check:** This design adds no table, ledger, or calculation engine. It extends the existing revision and delivery lifecycle.
9. **Module ownership:** The feature belongs to Estimates / Quote Center.
10. **Recommendation:** Add a prepare/review step to the existing quote lifecycle, then require that exact prepared revision when sending.

## User flow

1. The owner chooses **Review & Send** from an estimate or Quote Center row. Draft quotes, including Q-37, receive a clear action.
2. The application prepares or reuses a frozen revision from the current estimate and generates or retrieves its branded PDF. This step does not send email or activate a public quote link.
3. A review screen displays the PDF, customer email, and quote total. The recipient can be corrected before sending.
4. The owner must check **I reviewed this quote**. The separate final **Send quote** action remains disabled until the PDF is ready and the checkbox is selected.
5. On the final click, the server verifies the revision belongs to this estimate and business, verifies the current estimate still matches the reviewed content hash, and sends the stored PDF for that revision.
6. If the estimate changed after review, the server returns a conflict. The owner must refresh the preview and review the new revision before sending.
7. Existing accepted/failed/unresolved delivery handling remains in place. An unresolved attempt still blocks retry until reconciled.

## API and data flow

- Add a prepare/reuse operation in the existing quote-delivery route. It creates a `revision` event with status `snapshot` when the current customer-safe content differs from the latest revision, stores the frozen customer snapshot and PDF path, and returns the revision identifier and summary. If the content hash matches the latest revision, reuse that revision.
- The preview PDF endpoint serves the stored revision PDF inline when requested, while retaining a download option. Preview revisions remain inactive to the public until an email send is accepted.
- Change `POST /api/estimates/:id/send` to require the reviewed revision identifier in addition to recipient and idempotency key. It must not silently build a different revision at send time.
- The send route uses the stored PDF for the reviewed revision as the email attachment and preserves existing public-link activation, token revocation, idempotency, and reconciliation behavior.
- Both prepare and send validate the current estimate against the existing snapshot builder. Do not duplicate customer-price calculations in the client.

## Error and safety behavior

- A total mismatch returns a clear 409 message in the review screen; do not render raw JSON inside the PDF viewer.
- A failed PDF request, missing PDF, invalid recipient, or stale revision keeps the send action disabled or rejects the final request.
- No email API call occurs during dialog open, preview preparation, PDF viewing, download, or checkbox selection.
- Only the owner’s final Send quote click issues the send request.
- Sending remains distinct from customer acceptance, authorization to begin work, and conversion to a job or invoice.

## Verification

- API: preview preparation creates or reuses the correct immutable revision without creating a send attempt or calling the email provider.
- API: totals mismatch blocks preview/send; sending without a prepared revision is rejected; changed estimate content after preview returns a conflict.
- API: a successful send attaches the exact stored PDF and activates only that revision’s public token.
- UI: both Estimates and Quote Center entry points open the required review flow; preview, download, and checkbox interactions do not call the send route.
- UI: PDF errors are readable, send stays disabled until preview succeeds and review is acknowledged, and recipient/total are visible before the final click.
- Regression: existing idempotency, provider rejection, unresolved-send reconciliation, quote-history, decision, and work-authorization behavior remains unchanged.

## Completion boundary

This document defines the design only. No code, estimate data, database schema, production data, or email delivery has been changed.
