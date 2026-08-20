---
name: Post-merge schema push behavior
description: The post-merge script currently tolerates a failed Drizzle push, so database parity must be verified explicitly after setup.
---

The post-merge setup can report success even when its Drizzle schema push fails because the command is wrapped with `|| true`.

**Why:** Schema source changes can appear complete while the development database is still missing required columns or constraints.

**How to apply:** After any schema task, run read-only information_schema checks against development and do not rely on post-merge success alone.