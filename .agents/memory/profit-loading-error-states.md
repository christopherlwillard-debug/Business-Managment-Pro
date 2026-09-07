---
name: Profit loading error states
description: Profit screens must distinguish unavailable responses from legitimate zero-profit results and clear stale values before showing an error.
---

Profit consumers should treat a failed canonical profit response as unavailable, not as an empty or zero-valued response. Bulk summary failures and per-job detail failures are separate request boundaries and need independent regression coverage.

**Why:** Falling back to `{}`, `null`, or zero lets a failed request look like a valid no-profit job and can leave values from a previous job visible during navigation.

**How to apply:** Clear the affected profit state on failure, show an actionable retry state, and test both the summary and detail failure paths with authenticated browser fixtures.

Authenticated retry checks should scope recovery assertions to the visible profit consumer and track main-frame navigation separately from URL equality; parent pages may retain unrelated financial values, and CSS text transforms can change label casing.

**Why:** A whole-document text check can pass on stale parent-card values or fail on a correctly recovered panel, while unchanged URLs do not rule out a full reload.

**How to apply:** Identify the open panel/error container, compare canonical values after the retry, use case-insensitive text matching where presentation styles transform labels, and assert the main frame did not navigate.