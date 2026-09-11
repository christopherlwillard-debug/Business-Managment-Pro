---
name: Post-merge schema push behavior
description: The post-merge script currently tolerates a failed Drizzle push, so database parity must be verified explicitly after setup.
---

The post-merge setup intentionally continues after a failed Drizzle schema push,
but now reports the failure immediately and repeats it in the final validation
summary. A successful script exit still does not prove database parity.

**Why:** Schema source changes can appear complete while the development database is still missing required columns or constraints.

**How to apply:** Use `pnpm run schema-contract:live-check` to perform the
read-only development metadata check, then use the approved development
synchronization path only after review. Never use production DDL or startup
self-healing to recover parity.

The API server's pretest schema gate also stops the full test workflow when a
new source migration has not reached development, even if the migration file
and generated types are present. Verify the live development metadata before
interpreting a test failure as application behavior.

**Why:** A passing typecheck and a committed migration can coexist with a
missing development table, causing the test command to fail before Vitest runs.

**How to apply:** After additive schema work, apply the development migration
through the approved development path, rerun the schema gate, then run the
focused and full test suites.