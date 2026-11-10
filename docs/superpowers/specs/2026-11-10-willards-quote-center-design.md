# Willard's Quote Center — Design Specification

**Status:** Architecture approved; this written specification is awaiting user review.  
**Scope:** Complete the existing estimate workflow in four implementation phases.  
**Date:** 2026-11-10

## 1. Goal

Turn the existing Quote Center into a professional, auditable quoting workflow that can create a branded customer quote, deliver it as a PDF and secure link, record online or offline responses, track authorization separately from response, and convert an authorized quote revision to the existing Job Card system.

The existing estimate builder and `estimates` table remain the sole estimate system. This work does not create a second estimator, CRM, customer database, invoice system, pricing engine, or Job Card system.

## 2. Existing implementation reviewed

### Quote creation and pricing

- `artifacts/contractor-app/src/pages/Estimates.tsx` contains the Quote Center and the shared `EstimateModal`.
- `artifacts/contractor-app/src/components/GCEstimateWizard.tsx` creates estimates for the General Contracting workflow.
- `artifacts/contractor-app/src/pages/AerialQuote.tsx` creates Asphalt Sealing estimates through the same `/api/estimates` endpoint.
- `lib/db/src/schema/estimates.ts` already stores the title, client, job link, work-address snapshot, customer notes, line items, markup, contingency, totals, business ownership, and deposit information.
- `artifacts/api-server/src/lib/estimate-totals.ts` owns estimate totals and `expandEstimateLinesForInvoice`, which applies the existing markup/contingency behavior when producing customer-selling prices.
- The existing modal labels the line-item source value `Unit Cost`. Customer output must never expose that field or the markup/contingency inputs. Customer line prices will be derived through the existing invoice-expansion helper and checked against the stored quote total and tax line; the pricing engine itself is not to be changed.
- Existing estimates and their stored tax, adjustment, and total values remain unchanged.

### Customer document and branding

- `artifacts/contractor-app/src/components/CustomerQuotePreview.tsx` is a customer-safe client-side preview. It currently hides line-item price fields and supports browser printing, but lacks the full branding, contact details, quote dates/number, and complete price presentation required here.
- `artifacts/api-server/src/lib/invoiceBranding.ts` and `lib/api-zod/src/invoice-branding.ts` already resolve business/DBA branding, contact details, logo, and logo layout from the selected business profile and existing settings.
- The public document and PDF will share one server-generated customer-view model with an explicit allow-list. The internal estimate response will not be returned from a public route.
- PDF output will use the production-safe PDF generation approach already established for this project (PDFKit), not the browser print screen or the generic Chromium renderer.

### Delivery, response, and conversion

- `artifacts/api-server/src/lib/sendEmail.ts` sends through the existing Gmail connector. The existing invoice email path provides a model for attachments and success/failure handling.
- `lib/db/src/schema/invoice-communication-events.ts` is invoice-specific and cannot be reused for estimate events because it requires an invoice foreign key.
- The estimates router is mounted behind authentication and currently exposes list/create/update/delete and a basic conversion endpoint. There is no public quote route, quote token, sent/viewed history, revision history, or independent customer-decision/work-authorization state.
- The current conversion endpoint creates a minimal job and changes the estimate status to `won`. It does not require authorization, capture an accepted revision, or prevent repeated conversions.

## 3. User-facing workflow

### Quote Center

The existing `/estimates` page remains the main surface. It will show summary counts/value and filters for draft, sent/awaiting response, accepted online, accepted outside the portal, authorized, declined, expired, and converted quotes. Each quote card shows its number, revision, customer, work address, total, expiry, delivery status, customer decision, authorization state, and next follow-up date.

Actions are shown only when valid for the quote's state: edit draft, preview, download PDF, send/resend, view activity, record response, record authorization, create a revision, and convert an authorized revision to a job.

### Branded customer document

The same customer-safe document model drives the internal preview, downloaded PDF, emailed PDF, and public quote page. It includes:

- Business/DBA logo or a text-only business header when no logo exists
- Business name, phone, email, website when configured, and mailing address
- Quote number, revision, issue date, expiry date, and delivery/decision status where appropriate
- Customer name/contact details and billing address when available
- Saved work-site address, falling back to the linked job and then customer address
- Quote title, scope descriptions, quantities/units, customer selling prices, subtotal, adjustment, exact tax, total, and customer terms
- Professional letter-size layout, page breaks, header/footer, and page numbers

Internal notes, base unit costs, labor/subcontractor costs, employee rates, markup/contingency percentages, formulas, and profit are excluded at the server boundary.

Before sending or publishing an itemized quote revision, the server reconciles the customer-facing selling lines, adjustment, tax, and total against the stored estimate values. If they do not match exactly, sending and public approval are blocked with a discrepancy for the user to resolve in the draft. The system does not invent a balancing line, silently change a stored value, or alter a historical estimate. A total-only customer document is not an automatic fallback because tax and adjustments must remain clear.

Default quote terms and validity are configured with the existing business settings/profile, with per-quote overrides. No new settings surface is created unless the existing configuration cannot represent the required defaults.

### Sending and public access

Sending requires a user action and recipient confirmation/editing. The server builds the PDF and public URL, sends via the existing Gmail integration, and records the recipient, revision, timestamp, provider/message ID, result, and error when applicable. Delivery status changes only after send succeeds. `Delivered` is shown only when provider evidence confirms it; sending alone is not delivery confirmation.

The public link contains an unguessable token. Only its hash is stored. Each link is tied to one revision and has an expiry and revocation state. Public endpoints return only the customer-safe document model, are rate-limited, and never require internal application authentication.

The public link renders the customer quote while valid. Before quote expiration, the customer can approve, decline, or request changes. Quote expiration is a separate action deadline: after that date the customer can still view the quote, but those actions are disabled and the quote displays as expired. A link's maximum lifetime is 90 days from issuance; revocation takes effect immediately. Opening a link records a view event. Manual acceptance remains available when the customer does not use the online page.

Delivery summary is derived from immutable events. Precedence is Expired after the quote action deadline; otherwise Viewed if a verified public view exists; otherwise Delivered if provider evidence confirms delivery; otherwise Sent after Gmail accepts the send; otherwise Draft. A view does not erase or replace delivery evidence.

For a confirmed Gmail send failure, the attempt is recorded as failed and a retry creates a new event. If the request times out or otherwise has an unknown outcome, the event remains unresolved; the system does not automatically resend. The user must review the attempt and explicitly choose to retry, which may deliver a duplicate if Gmail accepted the first message.

### Separate lifecycle states

The estimate's existing `status` remains for compatibility during transition. New lifecycle state is kept separately:

- **Delivery:** draft, sent, delivered (verified), viewed, expired
- **Customer decision:** no response, accepted online, accepted by phone/text/email/in person/purchase order/work order/other, declined, requested changes
- **Work authorization:** not authorized or authorized

Sending, viewing, or downloading does not authorize work. Recording a manual response never labels it as online approval. Authorization requires a deliberate user action and can be recorded independently of the response method.

### Revisions and follow-up

Draft edits do not create a customer revision. After a quote has been sent, the user creates a new draft revision; sending freezes a customer-facing snapshot. Earlier sent and accepted snapshots are immutable. The event history identifies the exact revision accepted or declined.

Follow-up due dates are derived from successful send time at three and seven days. These are internal reminders, never automatic customer messages. Phone, text, email, and other follow-up notes are recorded in the quote event history.

## 4. Data and API design

Use the existing `estimates` row as the working draft and current-state summary. Add only fields that cannot be derived safely, such as quote-specific lifecycle state, accepted revision reference, and converted-job reference.

Add an immutable estimate-revision table containing the revision number and a customer-facing financial/scope snapshot. Add an estimate event table for send results, views, decisions, authorizations, changes requested, follow-up activity, and actor/audit context. Add a public-link table (or equivalent revision-linked record) storing only token hash, expiry, and revocation state. Do not reuse the invoice event table.

Add a unique source-revision reference to the converted job (or an equivalent database-enforced idempotency key) so one accepted revision can create at most one Job Card. Conversion is transactional and verifies that the revision is authorized before inserting the job. It preserves the customer, work address, approved revision link, legal business owner, operating division, and exact stored customer total; it does not recalculate the accepted quote.

New internal endpoints remain authenticated and access-checked. New public quote endpoints are mounted before the internal `requireAuth` middleware and accept only a valid, unexpired, unrevoked token. OpenAPI is updated before generated clients/types.

## 5. Migration and historical-data rules

- Additive schema only; no broad estimate/customer migration.
- Historical estimates remain intact and are treated as legacy single-version records. Their existing total, tax, adjustment, status, work address, and ownership are not rewritten.
- A revision snapshot is created only when a legacy estimate is first sent/revised under the new workflow; the system must not claim an old revision was previously sent or accepted without existing evidence.
- Existing Aerial Quote and General Contractor Estimate Wizard continue to create estimates through the same endpoint. Their current measurement/pricing calculations are not changed.
- No email is sent automatically during migration or implementation. No production schema/data change or publish occurs without a separate release approval.

## 6. Phased delivery

### Phase 1 — Branded document and PDF

- Replace the current print-only customer preview with the shared customer-safe document model.
- Use existing business/DBA branding and work-address/customer information.
- Produce a branded PDF download/print and preserve exact existing pricing/tax/adjustment behavior.
- Add or reuse only the quote-default fields that are genuinely missing.

### Phase 2 — Delivery and customer portal

- Add secure public quote links, email recipient confirmation, PDF attachment, Gmail send result recording, and send/view/decline/change-request events.
- Add online approval tied to the exact revision.

### Phase 3 — Manual response, authorization, revisions, and reminders

- Record offline response method, date/time, customer contact, internal actor, notes, and optional reference.
- Keep authorization separate and explicit.
- Preserve immutable sent/accepted revisions and show three-/seven-day internal follow-up reminders.

### Phase 4 — Job conversion and regression

- Convert only an explicitly authorized accepted revision.
- Enforce transactional, duplicate-safe conversion and preserve the accepted snapshot link.
- Verify invoices, existing Job Cards, Aerial Quote, and Estimate Wizard remain intact.

## 7. Acceptance tests

1. Correct configured General Contracting or Asphalt branding appears; missing logos produce a text header.
2. Existing client/job/work-site addresses render correctly; each estimate retains its saved work address.
3. Customer PDF, public page, and email attachment contain only allow-listed fields; tests explicitly assert that base `unitCost`, markup, contingency, internal notes, and profit are absent.
4. Customer line prices reconcile to the existing total engine, including exact adjustment and tax-line handling.
5. PDF downloads as a real branded PDF and prints with correct multi-page layout.
6. Email success, Gmail error, invalid recipient, and retry/idempotency behavior are recorded accurately; no failed send is marked sent.
7. Valid tokens show only the associated customer-safe revision. Expired/revoked/unknown tokens fail closed; token rotation invalidates the prior link.
8. Online approval, decline, and change request are attributed to the correct revision.
9. Manual phone/text/email/in-person acceptance remains distinct from online approval.
10. Sending/viewing never authorizes work; conversion without authorization fails.
11. Revisions preserve prior sent/approved prices and identify the revision the customer accepted.
12. Three-/seven-day follow-up reminders are internal only and can be dismissed/recorded without sending a customer message.
13. Repeated conversion requests create one job; conversion preserves client, address, revision, business/operating division, and exact accepted total.
14. Existing Aerial Quote, General Contractor Estimate Wizard, estimates, Job Cards, and invoices continue to function.

## 8. Explicit exclusions

- No second estimate builder, pricing engine, customer database, CRM, job system, or invoice system.
- No change to unrelated accounting, payroll, financial calculations, or legal business ownership.
- No automatic customer follow-up email.
- No mandatory online approval.
- No silent rewriting of historical quote data or accepted prices.
- No paid email service added; use the existing Gmail integration.

## 9. Implementation order and gates

1. Review this specification and correct any scope or safety issue.
2. Create an implementation plan with the four phases as ordered milestones.
3. Implement and verify one phase at a time, preserving the existing builder and data.
4. Before any production release, present schema/data effects and obtain separate approval to publish.
