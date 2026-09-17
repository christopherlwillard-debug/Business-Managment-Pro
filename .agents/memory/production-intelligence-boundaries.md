---
name: Production intelligence boundaries
description: Phase 0 contract for Willard's simple production model and its separation from scheduling, learning, and financial truth.
---

Scheduling/Operations is the source of truth for actual daily presence and schedule history; Knowledge Center consumes those facts to learn production expectations and never owns calendar presence. Willard's production components are Interior Finish (VOG, Hybrid, Drywall), Siding, Plumbing, Skirting, and Custom. Service is a separate future work type and is excluded from production learning.

**Why:** A simple daily presence signal produces useful calendar-span and production-day history without forcing exact time tracking, while separate ownership prevents duplicate pricing, payroll, expense, checklist, or profit systems.

**How to apply:** Treat unrecorded, here, and not_here as distinct states; preserve completed-job history; require explicit provenance for inferred legacy facts; treat daily workday start/finish timestamps as UI-state markers, never labor hours; allow Custom learning only for named profiles; never mix Service into production averages.