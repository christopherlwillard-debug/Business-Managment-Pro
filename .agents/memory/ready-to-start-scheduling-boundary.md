---
name: Ready-to-start scheduling boundary
description: Phase 4.1 rules for moving a job without a start date into Active Schedule
---

Starting a ready job is a scheduling transition only: write the requested start date and scheduled planning state, while preserving planned end dates, checklist scheduling, readiness history, and confirmed presence.

**Why:** A start date represents the requested schedule placement, not proof that production occurred. Presence and readiness blockers have separate owners and audit semantics.

**How to apply:** Keep the start mutation narrow and reject waiting or actively blocked jobs. Do not insert daily presence rows, clear blockers, or alter financial, payroll, expense, mileage, checklist, or production-learning data.