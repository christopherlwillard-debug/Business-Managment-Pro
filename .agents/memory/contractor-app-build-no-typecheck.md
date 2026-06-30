---
name: contractor-app build does not type-check
description: Why TS errors (incl. TDZ use-before-declaration) can ship to prod and crash at runtime
---

The contractor-app `build` script is `vite build` only — esbuild strips types WITHOUT type-checking. The `typecheck` script (`tsc -p tsconfig.json --noEmit`) exists but is NOT wired into build or dev. So TypeScript errors that `tsc` would catch (e.g. TS2448 "used before declaration") compile and deploy fine, then throw at runtime.

**Why:** A real production crash — the Manufactured Home panel rendered fully blank — was a TDZ `ReferenceError` from a `useEffect` dep array referencing a `const` declared later in the same component. tsc flags this (TS2448); the build never ran tsc, so it shipped.

**How to apply:** After non-trivial edits to contractor-app, run `pnpm --filter @workspace/contractor-app run typecheck` before assuming the code is sound — a clean `vite build`/dev compile does NOT mean type-clean. Watch especially for hook dependency arrays / derived consts referenced above their declaration (eager render-time evaluation → TDZ crash, not just a lint nit). Note: one unrelated pre-existing TS6306 (replit-auth-web needs composite:true) shows up in typecheck output.
