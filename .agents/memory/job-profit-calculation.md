---
name: Shared job profit calculation
description: Source-of-truth rules for operational job profit across individual and batch views
---

Operational job profit must be calculated by one shared server-side engine for both individual Job Financials and batch/Closed Jobs summaries. The response should include included-cost buckets and explicit exclusions so every displayed number is traceable.

**Why:** Separate route-local waterfalls drifted and produced impossible negative Closed Jobs values even when the authoritative source records did not support a loss.

**How to apply:** Keep invoices, expenses, allocation distributions, subcontractor payroll, and job reimbursements as raw inputs; do not reimplement profit arithmetic in React or another route. Treat an allocation as a distribution of its source expense, never as a second expense. Batch inputs must remain keyed by job before calculation; a global hourly-labor aggregate can otherwise be charged to every row.

The historical Closed Jobs mismatch was identifiable from the production values: both affected jobs carried the same implied `$4,340.00` cost, and `$4,340.00` was the total hourly accrual across all closed jobs even though neither affected job had job-hour rows. This is the signature of a batch aggregate leaking across job IDs, not a production loss in those jobs.

**Why:** Separate route-local waterfalls drifted and produced impossible negative Closed Jobs values even when the authoritative source records did not support a loss. A shared calculator alone is not enough unless each route passes correctly grouped per-job source inputs.

**How to apply:** When a batch value looks impossible, compare the implied cost (`revenue - displayed profit`) across rows. A repeated base that equals a cross-job aggregate points to grouping/mapping leakage; verify the raw rows and the pre-shared deployed route before changing data.