---
name: Workday source constraint
description: Production schema compatibility requirement for workday start records
---

The daily-presence source constraint must include `workday_action` before the START WORK TODAY route can persist its operational timestamp.

**Why:** The route already writes `workday_action`, while an older published constraint rejected that value and rolled back the entire upsert.

**How to apply:** Before validating workday start in production, inspect the live constraint and publish the existing schema definition if it is stale. This change affects presence metadata only; it must not alter manually entered future presence rows.