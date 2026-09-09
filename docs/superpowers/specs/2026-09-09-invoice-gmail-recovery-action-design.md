# Invoice Gmail Recovery Action Design

## Problem

Pending Gmail invoice-delivery events are visible in Communication & delivery, but their recovery action is hidden inside the Send Invoice panel. A large invoice logo can also paint over the toolbar.

## Design

- Keep `invoice_communication_events` as the delivery source of truth.
- Reuse the existing Gmail recovery handler and `recover-gmail` route.
- Show `Find Sent Email & Repair` directly on the one pending Gmail event already selected by the invoice panel's unresolved-event rules.
- Keep provider-message finalization and pending-message search recovery mutually exclusive, and support approved, sent, overdue, and partially paid invoices.
- Never mark an invoice sent on the client and never resend from the repair action.
- Flag pending Gmail events in the invoice list even when the interrupted send did not save a provider message ID.
- Finalize recovered events only while they are still pending so concurrent resolutions cannot be overwritten.
- Give the toolbar an explicit stacking layer above the invoice logo.

## Verification

- Component test confirms the repair action renders on the selected pending event.
- Invoice communication test confirms pending events without provider IDs are flagged for repair.
- Contractor app and API type checks pass.
- Visual preview confirms the toolbar remains above the logo and the action is visible in Communication & delivery.