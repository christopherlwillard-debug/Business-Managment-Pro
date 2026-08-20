---
name: Accounting repair guardrails
description: Cash-basis report changes require source-record reconciliation and business/schema verification first.
---

Cash-basis accounting repairs must begin with a read-only source-of-truth map and reconciliation of receipts, payment dates, ownership, subcontractor payments, owner activity, mileage, and reversals. Never change reports merely to make totals agree, backfill null business ownership, alter historical financial records, or publish production changes as part of the accounting repair.

**Why:** The forensic audit found that report discrepancies are entangled with incomplete business ownership, competing ledgers, duplicated rate logic, and uncertain reversal semantics. A report-only fix could make consistently wrong totals appear correct.

**How to apply:** Treat the accounting foundation as one chain: Business → Source Record → Accounting Treatment → Report. Resolve C1 business isolation and C4 unassigned-record policy before #1966; then verify subcontractor filtering, mileage predicates/rates, owner activity, and reversal semantics before implementing the cash-revenue helper. Add fixtures proving raw paid records equal every cash-basis report surface.

The current invoice model is an aggregate snapshot: `amountPaid` can represent a partial aggregate, while provider/manual timestamps represent at most one payment date. It cannot prove multiple customer receipts, refunds, or reversals by event date until a customer-payment ledger exists.

**Why:** A synthetic event-stream fixture can validate the intended arithmetic, but wiring that arithmetic into reports without a persisted source ledger would create false confidence and violate the source-record-first rule.

**How to apply:** Treat event-level payment reconciliation as blocked until customer receipt events are persisted and consumed consistently by every cash-basis report.