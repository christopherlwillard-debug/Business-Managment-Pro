# Quote Review Before Send — Implementation Plan

**Source spec:** `docs/superpowers/specs/2026-11-11-quote-review-before-send-design.md`

**Status:** Plan only; no implementation started

## Goal

Require a successful review of a frozen customer PDF before an owner can email that exact quote revision. No email is sent until the owner presses the final Send quote button.

## Scope and guardrails

- Extend the existing `estimate_quote_events` lifecycle; do not add a table or pricing engine.
- Preserve business scoping, owner permissions, send idempotency, unresolved-send reconciliation, quote history, public-token activation, and separate customer decision/work authorization behavior.
- Do not edit Q-37, attempt to repair its saved total, send email, or use production data.
- Keep the current pricing mismatch visible as a blocking error until an owner reviews and corrects the estimate.

## Work sequence

### 1. Prepare and serve a frozen preview revision

Files:
- `artifacts/api-server/src/routes/estimate-quote-delivery.ts`
- `artifacts/api-server/src/lib/estimateQuoteSnapshot.ts`
- `artifacts/api-server/src/routes/estimates.ts`
- Quote delivery API tests

Work:
- Add a prepare/reuse endpoint in the existing quote-delivery route. It builds the customer-safe snapshot with `buildEstimateQuoteSnapshot`, reuses a revision with the same content hash, or creates a new `revision` / `snapshot` event.
- Generate and stage the branded PDF before exposing a prepared revision. If PDF generation, object storage, or database persistence fails, clean up staged files and leave no send attempt or usable revision.
- Keep prepared public tokens inactive until email acceptance.
- Extend the existing revision-PDF endpoint to support inline preview as well as download, using only the stored revision PDF.
- Return a structured error for total mismatch and storage failures; never expose raw JSON as PDF content.

Exit criteria:
- Previewing creates no send attempt and never calls the email provider.
- Repeating a prepare request for unchanged customer-safe content reuses the same revision/PDF.
- Preview and later send use the same customer snapshot and archived PDF.

### 2. Require the prepared revision when sending

Files:
- `artifacts/api-server/src/routes/estimate-quote-delivery.ts`
- `artifacts/api-server/src/routes/estimate-quote-delivery.integration.test.ts`
- `artifacts/api-server/src/routes/estimate-quote-delivery.postgres.integration.test.ts`

Work:
- Require `revisionEventId`, recipient, and idempotency key in `POST /:id/send`.
- Verify that the revision belongs to the requested estimate and business, has a stored PDF, and is an eligible snapshot.
- Rebuild the current customer-safe snapshot inside the send transaction and compare its content hash with the reviewed revision. Return `409` if the estimate changed after preview; require a fresh preview.
- Attach the stored PDF from the reviewed revision rather than regenerating a PDF from current estimate data.
- Preserve current pending/unresolved conflict checks, provider rejection handling, token activation/revocation, status updates, and reconciliation semantics.
- Update all send-route tests and clients to require the reviewed revision ID.

Exit criteria:
- Sending without a prepared revision is rejected.
- A stale reviewed revision is rejected without contacting the email provider.
- A successful send attaches exactly the PDF stored for the reviewed revision.

### 3. Add the required review-and-send UI

Files:
- `artifacts/contractor-app/src/pages/Estimates.tsx`
- `artifacts/contractor-app/src/components/estimates/QuoteCenterBoard.tsx`
- `artifacts/contractor-app/src/components/estimates/QuoteSendDialog.tsx`
- `artifacts/contractor-app/src/components/CustomerQuotePreview.tsx`
- Relevant component tests

Work:
- Replace separate send initiation with a shared Review & Send flow from Estimates and Quote Center.
- Add a clear Review & Send action to draft rows, including Q-37, without changing draft status.
- Display the stored revision PDF, customer email, and total in one review screen.
- Require an “I reviewed this quote” acknowledgement before enabling the separate final Send quote button.
- Keep final send unavailable until the PDF has loaded successfully and the recipient is valid.
- Show pricing mismatch, stale revision, and PDF errors as readable alerts; do not show raw server JSON inside the PDF viewer.
- Keep preview, download, opening the dialog, and acknowledgement free of send requests.
- On a `409` stale-revision response, require a new preview and acknowledgement rather than retrying against changed content.

Exit criteria:
- Drafts are clearly sendable only through Review & Send.
- No email request occurs until the owner presses the final button.
- The recipient, total, and exact PDF are visible before sending.

### 4. Verify end-to-end behavior

Run:
- Quote delivery API integration suites, including PostgreSQL coverage.
- Customer quote preview and send-dialog component tests.
- API and contractor-app typechecks.
- Authenticated development browser checks with the email provider mocked or blocked.

Required scenarios:
- Valid preview prepares a revision but creates no send attempt and sends no email.
- Invalid pricing shows the reconciliation error and keeps Send quote unavailable.
- Missing, wrong-business, or stale revision IDs are rejected.
- Editing the estimate after preview requires a new preview.
- Successful final send uses the stored reviewed PDF and activates only the matching public token.
- Cancel, close, preview, download, and acknowledgement never send.
- Provider rejection, unresolved outcomes, idempotency, and quote history continue to behave as before.

## Completion boundary

This plan does not include changing estimate data, repairing Q-37, sending a real email, migrating production, or publishing. Q-37 must be corrected by an owner before it can produce a valid customer PDF.
