---
name: Database test timeouts
description: Timeout behavior for the API server's database-backed Vitest suite
---

The API server's full Vitest suite needs 15-second test and hook timeouts. Individual database tests can pass within the default five seconds, but parallel suite contention can push setup and rollback scenarios beyond that limit.

**Why:** The full suite intermittently timed out in bid-ownership and mileage-import integrity tests while both passed independently and the complete suite passed with 15-second limits.

**How to apply:** Keep the shared Vitest timeout configuration at 15 seconds for test bodies and lifecycle hooks; treat isolated failures under the default as possible database contention before changing application logic.