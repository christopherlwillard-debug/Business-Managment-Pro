---
name: Production learning Phase 3
description: Scope and data-boundary decisions for the first Knowledge Center production-observation layer
---

The first learning layer derives observations from existing MH production jobs, their model/benchmark links, selected production services, and confirmed daily presence. Observation loading remains read-only; benchmark changes require an all-business, owner-reviewed revision against the existing global benchmark.

**Why:** Whole-job presence measures cannot be truthfully attributed to each selected trade. Keeping the first slice model/benchmark-scoped preserves traceability and avoids changing financial, payroll, scheduling, or presence behavior.

**How to apply:** Group observations by home model and existing benchmark; show selected production services only as scope context. Count only confirmed presence provenance, treat unrecorded as missing evidence, exclude Service work, require three eligible jobs for a learned baseline, and do not infer named custom profiles from free-text service names. Custom services need an active business-scoped profile mapping before they enter learning or traceability. Never convert observed days to benchmark hours automatically; preserve the prior value and source jobs, and reject stale approvals.

## Component work-date learning

Component-level production-day observations may consume Phase 5 work-session
dates, but they remain a derived read-only view. Join each session to the exact
component snapshot it references, deduplicate dates, keep one normalized
observation per job and learning key, and exclude dates that conflict with
confirmed `not_here` presence. Do not copy whole-job presence to every
component.

**Why:** Presence proves job/day evidence but cannot identify which selected
trade worked. Sessions provide that attribution without creating a second
learning ledger or converting operational hours into labor benchmarks.

**How to apply:** Preserve snapshot ID/version and captured expected duration
in evidence. Require immutable named Custom-profile context; never use the
current catalog mapping to reinterpret old Custom snapshots. Keep pause and
unrecorded context visible but outside actual component work days.