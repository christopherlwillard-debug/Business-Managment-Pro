---
name: Jobs scheduling boundary
description: Defines which jobs and checklist items may participate in the Jobs page planning summary.
---

Scheduling is a Jobs-owned operational layer with a Planner/List toggle. It may provide Pipeline, Today, This Week, Month, and Agenda views, but it must not replace the canonical job lifecycle or become part of Route Planner.

Only open, active jobs may participate. Completed, invoiced, closed, or closed-at jobs must never appear in active planning counts or “needs dates” indicators.

Planning uses four explicit states: Ready, Scheduled, Waiting, and Queue. Priority and resource demand are separate inputs. Queue/Lot Model work uses stable queue order and must never receive invented calendar dates.

Checklist scheduling follows existing checklist semantics: only explicitly scheduled items in active sections that are not completed and not skipped/not-applicable participate in dated views. Undated incomplete checklist work remains unscheduled, not automatic planning debt.

Internal readiness blockers have their own auditable job-scoped history. They must remain separate from customer-facing checklist delay messages. Clearing the final blocker on an undated job makes it Ready to Schedule.

**Why:** Planning state, customer communication, financial lifecycle, and route stops answer different questions. Combining them previously made optional work look overdue and risked corrupting historical or accounting meaning.

**How to apply:** Keep cards compact and scan-friendly, derive progress from the applied checklist's shared fractional calculation, show only real dates in dated modes, preserve completion/reopen evidence, and never couple planning actions to invoices, payments, closure, or Route Planner.