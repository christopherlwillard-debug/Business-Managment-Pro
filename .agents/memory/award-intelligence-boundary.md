---
name: Award intelligence boundary
description: The architectural boundary between historical award records and actionable bid opportunities
---

Historical award intelligence is stored in the existing bid opportunity system but must never be treated as actionable work. Use the shared award predicate for API/count/lifecycle boundaries; keep awards available only through the dedicated intelligence view.

**Why:** Award records have no solicitation deadline or bid lifecycle and including them in active counts makes the pipeline misleading.

**How to apply:** When adding a new award source or bid count, classify by both source and opportunity type so legacy or mislabelled award rows cannot leak into actionable views.