---
name: Profit loading error states
description: Profit screens must distinguish unavailable responses from legitimate zero-profit results and clear stale values before showing an error.
---

Profit consumers should treat a failed canonical profit response as unavailable, not as an empty or zero-valued response. Bulk summary failures and per-job detail failures are separate request boundaries and need independent regression coverage.

**Why:** Falling back to `{}`, `null`, or zero lets a failed request look like a valid no-profit job and can leave values from a previous job visible during navigation.

**How to apply:** Clear the affected profit state on failure, show an actionable retry state, and test both the summary and detail failure paths with authenticated browser fixtures.