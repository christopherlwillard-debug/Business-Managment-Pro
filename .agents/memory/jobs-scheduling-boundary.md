---
name: Jobs scheduling boundary
description: Defines which jobs and checklist items may participate in the Jobs page planning summary.
---

Scheduling is a compact secondary layer on the existing Job Cards, never a separate tab or a full chronological replacement for the Jobs list.

Only open, active jobs may participate. Completed, invoiced, closed, or closed-at jobs must never appear in active planning counts or “needs dates” indicators.

The all-open-jobs default is a compact card grid, not a table. Each card shows essential overview information first and exposes the full operational card on demand. The schedule summary must look far enough ahead to include next-month work; use a rolling 60-day window.

Checklist scheduling follows existing checklist semantics: only items in active sections that are not completed and not skipped/not-applicable are actionable. A checklist item without a date is not automatically planning debt; checklist scheduling is optional. “Needs dates” applies to active jobs missing their primary job dates.

**Why:** A calendar-heavy presentation exposed historical jobs and optional checklist rows as unfinished scheduling work, making the Jobs page extremely long and misleading.

**How to apply:** Keep compact overview cards primary, show at most the next relevant scheduled item on a card, and place the rolling schedule in a concise collapsed strip. Never render full checklists inline on the Jobs page.