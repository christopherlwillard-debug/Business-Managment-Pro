---
name: Shared job profit calculation
description: Source-of-truth rules for operational job profit across individual and batch views
---

Operational job profit must be calculated by one shared server-side engine for both individual Job Financials and batch/Closed Jobs summaries. The response should include included-cost buckets and explicit exclusions so every displayed number is traceable.

**Why:** Separate route-local waterfalls drifted and produced impossible negative Closed Jobs values even when the authoritative source records did not support a loss.

**How to apply:** Keep invoices, expenses, allocation distributions, subcontractor payroll, and job reimbursements as raw inputs; do not reimplement profit arithmetic in React or another route. Treat an allocation as a distribution of its source expense, never as a second expense.