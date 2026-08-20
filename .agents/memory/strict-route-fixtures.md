---
name: Strict route test fixtures
description: Ordered database queues in route tests must expose query-order drift instead of silently returning empty rows.
---

Ordered route-test database mocks should reject on queue exhaustion and assert that every queued response was consumed after each test. Track select, execute, and mutation-return queues separately when a route uses more than one ordered response stream.

**Why:** An exhausted queue returning `[]` can make a reordered query look like a valid empty result, allowing route regressions to pass.

**How to apply:** When adding or editing route fixtures with `shift()` queues, include route context and slot numbers in exhaustion errors and add leftover-response assertions.