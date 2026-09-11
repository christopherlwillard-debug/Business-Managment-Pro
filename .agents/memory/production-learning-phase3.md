---
name: Production learning Phase 3
description: Scope and data-boundary decisions for the first Knowledge Center production-observation layer
---

The Knowledge Center derives observations from existing MH production jobs, their model/benchmark links, selected production services, confirmed daily presence, immutable component snapshots, and component work-session dates. Phase 6 observation loading remains read-only. Phase 7A is the only component-baseline persistence layer: a business/model/learning-key scoped review history may hold explicitly proposed, approved, rejected, and superseded production-day baselines.

**Why:** Whole-job presence measures cannot be truthfully attributed to each selected trade. Keeping the first slice model/benchmark-scoped preserves traceability and avoids changing financial, payroll, scheduling, or presence behavior.

**How to apply:** Group observations by home model and existing benchmark; show selected production services only as scope context. Count only confirmed presence provenance, treat unrecorded as missing evidence, exclude Service work, require three eligible jobs for observation visibility, and require five distinct eligible jobs for a persisted component-baseline proposal. Do not infer named custom profiles from free-text service names. Custom services need an active business-scoped profile mapping before they enter learning or traceability. Never convert observed days to benchmark hours automatically; preserve prior values and source evidence, and reject stale approvals.

## Component work-date learning

Component-level production-day observations consume Phase 5 work-session dates.
They remain a derived read-only view until an owner explicitly creates and
reviews a Phase 7A baseline proposal. Join each session to the exact component
snapshot it references, deduplicate dates, keep one normalized observation per
job and learning key, and exclude dates that conflict with confirmed `not_here`
presence. Do not copy whole-job presence to every component.

**Why:** Presence proves job/day evidence but cannot identify which selected
trade worked. Sessions provide that attribution without creating a second
learning ledger or converting operational hours into labor benchmarks.

**How to apply:** Preserve snapshot ID/version, session IDs, presence references,
and captured expected duration in review-time evidence. Hash that evidence when
proposing a baseline; approval must recompute the Phase 6 observation and
compare both the evidence hash and the captured active approved revision inside
one transaction. Require immutable named Custom-profile context; never use the
current catalog mapping to reinterpret old Custom snapshots. Keep pause and
unrecorded context visible but outside actual component work days. Approved
baselines must not feed pricing, payroll, scheduling, checklists, forecasting,
financials, or labor-hour learning.