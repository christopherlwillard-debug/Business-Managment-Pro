---
name: Quote decision and authorization boundary
description: Keeps customer decisions, work permission, and estimate conversion distinct in the Quote Center.
---

In Quote Center, customer decisions and work authorization are separate facts. Online approval records the decision only. Explicit work authorization is a separate event linked to the exact frozen quote revision and never transfers to a newer revision. Conversion is manually initiated, requires current acceptance plus explicit authorization, and must compare the estimate's current content hash with that frozen revision so later edits cannot silently change accepted scope or price. Historical `won` or `lost` statuses are not backfilled as customer responses or authorization.

**Why:** The user approved this distinction to avoid treating a customer's online decision as permission to begin work; matching the current content hash also prevents authorized work from drifting away from the accepted scope and price.

**How to apply:** Keep decision, authorization, reminders, archive state, and conversion independently traceable in the existing quote event history. Do not add automatic customer messaging, job creation, or a competing quote/CRM ledger.
