---
name: Invoice delivery reconciliation
description: Rules for reconciling invoice lifecycle compatibility fields from Gmail communication evidence
---

Verified Gmail invoice communication events are the authoritative delivery evidence when they are finalized as accepted, use the Gmail provider, and contain a provider message ID. A stale `approved` invoice may be reconciled to `sent` from that evidence, using the event completion time for `sentAt`; pending or ambiguous attempts must remain blockers.

**Why:** A production invoice was visibly accepted by Gmail in its communication timeline while the legacy invoice status remained `approved`, causing the UI to offer the initial-send action again. Treating provider acceptance without verified message evidence as sent would create the opposite trust failure.

**How to apply:** Keep the append-only communication timeline and `invoices` compatibility fields aligned through existing invoice routes. Preserve resend/reminder behavior for genuinely sent invoices, and never change accounting ledgers or revenue calculations as part of delivery reconciliation.