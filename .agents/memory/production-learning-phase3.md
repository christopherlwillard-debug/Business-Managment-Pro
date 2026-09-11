---
name: Production learning Phase 3
description: Scope and data-boundary decisions for the first Knowledge Center production-observation layer
---

The first learning layer is read-only and derives observations from existing MH production jobs, their model/benchmark links, selected production services, and confirmed daily presence. It does not update benchmarks or create a second operational source of truth.

**Why:** Whole-job presence measures cannot be truthfully attributed to each selected trade. Keeping the first slice model/benchmark-scoped preserves traceability and avoids changing financial, payroll, scheduling, or presence behavior.

**How to apply:** Group observations by home model and existing benchmark; show selected production services only as scope context. Count only confirmed presence provenance, treat unrecorded as missing evidence, exclude Service work, require three eligible jobs for a learned baseline, and do not infer named custom profiles from free-text service names.