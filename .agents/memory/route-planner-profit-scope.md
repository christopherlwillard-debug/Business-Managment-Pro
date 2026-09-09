---
name: Route Planner profit scope
description: Week route-profit totals and explanations must share the current visible-stop set
---

Route Planner Week profit must derive both its canonical totals and its explanation from the same visible, date-filtered, deduplicated linked-job set. Cache the profit query by the selected day/week range as well as job IDs so an unavailable response cannot reuse a prior period's result.

**Why:** The planner has separate Day and Week stop collections; deriving Week metrics from the Day collection can leave totals and explanatory UI stale or scoped to the wrong date range.

**How to apply:** Start from `viewStops`, deduplicate by `jobId`, exclude unlinked and out-of-range stops, use canonical batch profit responses keyed by those job IDs, and include the selected scope in the query cache key. Hide totals when a visible linked job has no profit response instead of silently undercounting.