---
name: Prod schema via Publish
description: Production schema changes must flow from the development schema through Publish, never application startup or custom production DDL.
---

# Production Schema Changes — Correct Pattern

Production schema is managed by Replit Publish, which diffs the development and production databases and validates the resulting SQL before applying it.

**Rule:** Make schema changes in the Drizzle source of truth, synchronize and verify the development database, inspect the development-to-production diff, and then ask the user to retry Publish.

**Why:** Deployment hooks, migration endpoints, direct production DDL, and startup-time self-healing create a third migration path that can drift from Publish and damage production.

**How to apply:** Use production queries only for read-only diagnosis. Apply safe schema corrections to development through normal database permissions. Ask before destructive development changes.

## Unvalidated CHECK constraint diff quirk

If a development constraint has `convalidated = false`, Publish may serialize its introspected `NOT VALID` definition incorrectly. First confirm all rows satisfy the constraint, represent the constraint in Drizzle schema, validate it in development, and recompute the diff. A validated constraint should generate ordinary `ADD CONSTRAINT ... CHECK (...)` SQL.
