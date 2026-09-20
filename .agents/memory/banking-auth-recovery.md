---
name: Banking authentication recovery
description: Safety rules for recovering an interrupted bank-transaction filing without duplicating financial writes.
---

Never automatically replay a Banking financial mutation after authentication recovery. Preserve the pending form, return through login, and require an explicit resubmission. Filing a bank transaction as an expense must serialize on that bank row before creating the canonical expense.

**Why:** Authentication can expire after a form is completed, while automatic POST replay or simultaneous taps can create duplicate financial records. Draft recovery preserves the user's work without weakening authorization or risking an unseen write.

**How to apply:** Use this rule for Banking actions that create or match ledger records. Authentication checks must bypass caches, sensitive cookie/session identifiers must never be logged, and a recovered draft may reopen only for the same still-unmatched bank transaction.