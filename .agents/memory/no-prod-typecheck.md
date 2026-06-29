---
name: No production typecheck
description: api-server never runs tsc; TS errors are non-blocking
---
`artifacts/api-server` production build is `tsx ./build.ts` (esbuild) — it strips types
without checking. Dev is `tsx ./src/index.ts`. Neither runs `tsc`.

**Why:** The codebase carries a large backlog of pre-existing TS errors (notably
TS7030 "not all code paths return a value" from the Express `return res.json()`
convention, plus drizzle `as Record<string,unknown>` cast warnings). If prod
typechecked, it could never build.

**How to apply:** Don't treat `npx tsc --noEmit` errors in api-server as build blockers.
Only fix type errors in files you authored, and match the existing loose-typing convention
rather than trying to zero out the whole codebase.
