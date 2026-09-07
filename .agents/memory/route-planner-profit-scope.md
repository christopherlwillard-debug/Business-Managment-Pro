---
name: Route Planner profit scope
description: Week route-profit totals and explanations must share the current visible-stop set
---

Route Planner Week profit must derive both its canonical totals and its explanation from the same visible, date-filtered, deduplicated linked-job set.

**Why:** The planner has separate Day and Week stop collections; deriving Week metrics from the Day collection can leave totals and explanatory UI stale or scoped to the wrong date range.

**How to apply:** Start from `viewStops`, deduplicate by `jobId`, exclude unlinked and out-of-range stops, and use canonical batch profit responses keyed by those job IDs. Hide totals when a visible linked job has no profit response instead of silently undercounting.