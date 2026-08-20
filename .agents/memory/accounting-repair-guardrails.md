---
name: Accounting repair guardrails
description: Cash-basis report changes require source-record reconciliation and business/schema verification first.
---

Cash-basis accounting repairs must begin with a read-only source-of-truth map and reconciliation of receipts, payment dates, ownership, subcontractor payments, owner activity, mileage, and reversals. Never change reports merely to make totals agree, backfill null business ownership, alter historical financial records, or publish production changes as part of the accounting repair.

**Why:** The forensic audit found that report discrepancies are entangled with incomplete business ownership, competing ledgers, duplicated rate logic, and uncertain reversal semantics. A report-only fix could make consistently wrong totals appear correct.

**How to apply:** Before implementing the cash-revenue helper, document exact source tables/predicates/date rules per report, define unassigned-record behavior, verify subcontractor/owner/reversal semantics, and add fixtures proving raw paid records equal every cash-basis report surface.