---
name: Bid ownership quarantine
description: Ownership rules for legacy and synchronized bid opportunities
---

Bid opportunities must be assigned only to an existing business. Legacy rows with missing ownership are recoverable data, not evidence for assigning them to the current or default business; quarantine them until manually classified.

**Why:** A broad null-row backfill can silently attribute unrelated opportunities to one business and contaminate business-scoped feeds.

**How to apply:** Keep the canonical ownership field nullable while legacy rows are inventoried, exclude null-owned rows from normal scoped and unified feeds, and preserve their source row and content when quarantining.