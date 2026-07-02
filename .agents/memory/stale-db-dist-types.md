---
name: Stale lib/db dist declarations
description: Phantom TS2339 "column does not exist" errors after adding schema columns; fix by rebuilding lib/db
---

After adding a column to a `lib/db` schema file, `pnpm --filter @workspace/api-server run typecheck` can report TS2339 "Property X does not exist" on the new column even though runtime (tsx) works fine.

**Why:** Package exports point at `src/*.ts`, but TypeScript project references resolve the stale declaration files in `lib/db/dist` (plus `tsconfig.tsbuildinfo`). Runtime never uses dist, so the app works while typecheck lies.

**How to apply:** Run `pnpm exec tsc -b lib/db` to regenerate the dist declarations, then re-run typecheck. If old columns (not just your new one) also error, that's the same stale-dist symptom, not a real schema problem.
