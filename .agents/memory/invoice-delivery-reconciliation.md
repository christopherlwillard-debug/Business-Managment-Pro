---
name: Invoice delivery reconciliation
description: Rules for reconciling invoice lifecycle compatibility fields from Gmail communication evidence
---

Verified Gmail invoice communication events are the authoritative delivery evidence when they are finalized as accepted, use the Gmail provider, and contain a provider message ID. A stale `approved` invoice may be reconciled to `sent` from that evidence, using the event completion time for `sentAt`; pending or ambiguous attempts must remain blockers.

Operating-performance revenue views are a deliberate exception to cash-basis period attribution: a paid invoice belongs to its verified delivery period, with `issueDate` only as the explicit fallback for historical records without verified delivery evidence. All accounting, tax, P&L, reserve, Year-End, and payment-history calculations remain payment-date based.

**Why:** A production invoice was visibly accepted by Gmail in its communication timeline while the legacy invoice status remained `approved`, causing the UI to offer the initial-send action again. Treating provider acceptance without verified message evidence as sent would create the opposite trust failure. The dashboard is intended to show operating performance for the period work was billed, while formal reports must preserve cash-basis receipt timing.

**How to apply:** Keep the append-only communication timeline and `invoices` compatibility fields aligned through existing invoice routes. Preserve resend/reminder behavior for genuinely sent invoices. Use the shared operating-performance send-date calculation only for Dashboard-style performance views; never reuse it in cash-basis reports or ledgers.