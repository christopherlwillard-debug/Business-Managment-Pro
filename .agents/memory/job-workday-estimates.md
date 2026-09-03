---
name: Actual workday fuel estimates
description: Fuel estimates must use recorded work dates rather than scheduled job spans
---

Fuel estimates use the distinct union of daily-log dates and subcontractor-hour dates. A job's start and end dates are scheduling bounds only; when no work-date evidence exists, the estimate is unavailable instead of guessed.

**Why:** Contractors may skip days within a job's scheduled span, and treating every calendar day as worked overstates both fuel and job costs.

**How to apply:** Add actual work dates through Daily Logs or Sub Hours before expecting a per-job fuel estimate. Keep route distance and fuel arithmetic inside RoutingEngine and VehicleEngine.