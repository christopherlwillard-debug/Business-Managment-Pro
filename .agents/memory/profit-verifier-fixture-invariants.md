---
name: Profit verifier fixture invariants
description: Authenticated profit-browser fixtures must keep derived totals and existing sort assumptions coherent when adding cost buckets.
---

When an authenticated profit verifier gains nonzero labor, allocation, or reversal values, update every derived total and any existing assertions that depend on fixture ordering or recovered amounts.

**Why:** A realistic financial fixture can change route and Closed Jobs ordering even when the UI behavior under test is unchanged; stale hardcoded recovery labels can also hide the real regression.

**How to apply:** Keep the fixture arithmetic source-derived, prefer expected-value helpers over literal money strings, and preserve deliberate ordering invariants unless the test is explicitly changing them.