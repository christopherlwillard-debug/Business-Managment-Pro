---
name: contractor-app build does not type-check
description: Why TS errors (incl. TDZ use-before-declaration) can ship to prod and crash at runtime
---

The contractor-app `build` script is `vite build` only — esbuild strips types WITHOUT type-checking. The `typecheck` script (`tsc -p tsconfig.json --noEmit`) exists but is NOT wired into build or dev. So TypeScript errors that `tsc` would catch (e.g. TS2448 "used before declaration") compile and deploy fine, then throw at runtime.

**Why:** Two separate production crashes from this same class. (1) The Manufactured Home panel rendered blank — TDZ `ReferenceError` from a `useEffect` dep array referencing a `const` declared later; tsc flags that one (TS2448) but the build never ran tsc. (2) The whole Jobs page crashed (`Cannot access 'l' before initialization`) because a hook arg referenced a value destructured from a LATER hook: `useListProductionServiceTypes(activeBusiness?.id)` was placed above `const { activeBusiness } = useBusiness()`.

**CRITICAL nuance — typecheck is NOT a reliable safeguard for all TDZ:** case (2) above shipped even though `pnpm --filter @workspace/contractor-app run typecheck` was run and passed clean. tsc did NOT emit TS2448 for `useHook(x?.id)` where `x` is destructured from another hook declared further down the same component body. So a clean typecheck does NOT prove TDZ-free.

**How to apply:** After non-trivial edits to contractor-app, run typecheck — but treat it as necessary, not sufficient. Independently verify hook/const declaration order by eye: any value used as a hook argument or in a derived const / dep array MUST be declared on an earlier line than its use. The only fully reliable catch is exercising the actual page (or adding a `no-use-before-define` lint rule). Note: one unrelated pre-existing TS6306 (replit-auth-web needs composite:true) shows up in typecheck output.
