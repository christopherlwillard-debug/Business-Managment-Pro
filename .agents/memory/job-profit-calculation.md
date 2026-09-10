---
name: Shared job profit calculation
description: Source-of-truth rules for operational job profit across individual and batch views
---

Operational job profit must be calculated by one shared server-side engine for both individual Job Financials and batch/Closed Jobs summaries. The response should include included-cost buckets and explicit exclusions so every displayed number is traceable.

**Why:** Separate route-local waterfalls drifted and produced impossible negative Closed Jobs values even when the authoritative source records did not support a loss.

**How to apply:** Keep invoices, expenses, allocation distributions, subcontractor payroll, and job reimbursements as raw inputs; do not reimplement profit arithmetic in React or another route. Treat an allocation as a distribution of its source expense, never as a second expense. Batch inputs must remain keyed by job before calculation; a global hourly-labor aggregate can otherwise be charged to every row. Batch-only fuel and split-pool enrichment may decorate the shared keyed result but must not reload or regroup accounting inputs.

The historical Closed Jobs mismatch was identifiable from the production values: both affected jobs carried the same implied `$4,340.00` cost, and `$4,340.00` was the total hourly accrual across all closed jobs even though neither affected job had job-hour rows. This is the signature of a batch aggregate leaking across job IDs, not a production loss in those jobs.

**Why:** Separate route-local waterfalls drifted and produced impossible negative Closed Jobs values even when the authoritative source records did not support a loss. A shared calculator alone is not enough unless each route passes correctly grouped per-job source inputs.

**How to apply:** When a batch value looks impossible, compare the implied cost (`revenue - displayed profit`) across rows. A repeated base that equals a cross-job aggregate points to grouping/mapping leakage; verify the raw rows and the pre-shared deployed route before changing data.

Profit route response extras must not reintroduce a suppressed operational fuel estimate after the shared calculator has excluded it. Keep the internal zero used for cost arithmetic distinct from the wire-level `null` meaning that no estimate applies, especially when actual Fuel/Travel expense evidence exists.

**Why:** Detail and batch routes can calculate the correct included costs while still exposing a misleading estimate if route-specific response enrichment overwrites the shared result.

**How to apply:** When an actual included fuel expense is present, skip routing estimation, expose actual fuel in the canonical field, report no applied reimbursement, and keep estimated fuel unavailable in both detail and batch responses.

Client-side profit requests must use generated API-client methods, and the guard must scan the full frontend source tree rather than a fixed page list; test fixtures are the exception because they intentionally contain forbidden examples.

**Why:** A route-planning screen had bypassed the generated contract while the old checker silently skipped it because only two pages were scanned.

**How to apply:** Keep the approved consumer registry beside the repository-wide scanner, and make violations report the exact source path and line so new financial screens cannot introduce a parallel request or response-casting path unnoticed.