---
name: Invoice delivery reconciliation
description: Rules for reconciling invoice lifecycle compatibility fields from Gmail communication evidence
---

Accepted Gmail invoice communication events with a provider message ID are the authoritative provider-acceptance evidence. A stale `approved` invoice may be reconciled to `sent` from that event, using the event completion time for `sentAt`; this means accepted by Gmail, not confirmed inbox delivery. After Gmail accepts a send, checkpoint its message and thread IDs on the same pending event, then finalize that event without requiring a secondary metadata read. Pending events without a message ID remain ambiguous.

Operating-performance revenue views are a deliberate exception to cash-basis period attribution: a paid invoice belongs to its verified delivery period, with `issueDate` only as the explicit fallback for historical records without verified delivery evidence. All accounting, tax, P&L, reserve, Year-End, and payment-history calculations remain payment-date based.

Known-message repair does not require a Gmail token or metadata permission. If no provider identity survived, recovery belongs entirely in the authenticated management app using its server-side read-only Gmail access; never require the public site, browser storage edits, Developer Tools, another Google reconnect, or a resend.

If a metadata search succeeds but finds no exact Sent message, resolve the stale communication event as failed and leave invoice status unchanged. This removes a false blocker without inventing delivery evidence or sending again.

**Why:** Requiring a second metadata-scoped request after Gmail had already accepted a send caused the existing event to remain pending and the invoice to remain `approved`. Gmail's returned message ID is sufficient provider-acceptance evidence for BuildPro's Sent lifecycle; calling it inbox delivery would overstate that evidence. The dashboard is intended to show operating performance for the period work was billed, while formal reports must preserve cash-basis receipt timing.

**How to apply:** Keep the append-only communication timeline and `invoices` compatibility fields aligned through existing invoice routes. Checkpoint returned provider IDs on the prepared event and finalize that same event as accepted without a metadata request. If an interrupted send loses the message ID everywhere, use a bounded Sent-folder search and require the stored delivery header, recipient, exact subject, Sent label, and delivery-time window to match uniquely before finalizing the same event. Stop on incomplete or multiple results; never prepare or send during recovery. Label only accepted Gmail invoice events with provider message IDs as sent. Preserve resend/reminder behavior for genuinely sent invoices. Use the shared operating-performance send-date calculation only for Dashboard-style performance views; never reuse it in cash-basis reports or ledgers.

The authenticated in-app repair action was confirmed to reconcile both known production invoice mismatches successfully without another Gmail connection or resend.