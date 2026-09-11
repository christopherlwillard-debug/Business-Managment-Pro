---
name: Stale lib/api-client-react dist declarations
description: New API response fields may be invisible to contractor-app typechecks until the shared client declarations are rebuilt
---

After adding a field to an interface in `lib/api-client-react/src`, the contractor app typecheck can still report that the field does not exist because it is resolving stale declarations from the shared library build.

**Why:** The app's TypeScript project references can consume the previous `lib/api-client-react/dist` output even while the source interface is already updated.

**How to apply:** Run `pnpm exec tsc -b lib/api-client-react` before re-running the contractor-app typecheck. This is a declaration-build issue, not a runtime response-shape issue.