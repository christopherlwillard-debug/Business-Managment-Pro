---
name: orval codegen wipes Prospect/RouteStop (spec drift)
description: Running api-spec codegen regenerates from openapi.yaml with clean:true and deletes schemas the committed generated code relies on
---

# orval codegen / openapi.yaml drift

The committed orval-generated client (`lib/api-client-react/src/generated/api.ts` + `api.schemas.ts`, and `lib/api-zod/src/generated/`) is OUT OF SYNC with `lib/api-spec/openapi.yaml`. The generated code contains schemas (e.g. `Prospect`, `ProspectStatus`, `RouteStop` detail, dashboard business-line types) that `openapi.yaml` no longer defines. Conversely the yaml has some types the generated code lacked (phaseItem, dashboardStatsByBusinessLine).

**Why this matters:** orval is configured with `clean: true` (see `lib/api-spec/orval.config.ts`) and reads ONLY `openapi.yaml`. Running `pnpm --filter @workspace/api-spec codegen` therefore DELETES every generated symbol not present in the current yaml. This silently breaks the frontend at runtime — e.g. `ProspectDrawer`/`Prospects`/`PeopleAndProperties` import `ProspectStatus` and the app dies with "module does not provide an export named 'ProspectStatus'".

**How to apply:** Do NOT run a full codegen to add a new endpoint unless you are prepared to also re-add every drifted schema to `openapi.yaml` first. Instead, for a small additive change: edit `openapi.yaml` for documentation, then **manually inject** only the new types into `api.schemas.ts` and the new react-query hooks into `api.ts` (copy orval's output style — Url/fn/QueryKey/QueryOptions/use* for queries; Url/fn/MutationOptions/use* for mutations — and add the type names to the `import type { ... } from "./api.schemas"` block, kept roughly alphabetical). `lib/api-client-react` and `lib/db` export from `src` directly, so no build is needed for runtime; but `lib/db` has a `dist` of `.d.ts` used by api-server's TS project references — rebuild it with `pnpm exec tsc -p tsconfig.json` in `lib/db` after schema changes or api-server typecheck reports the new columns/exports missing.

**api-zod note:** api-server validates request bodies with zod from `@workspace/db/schema` (e.g. `serviceBillingSchema`), not from `@workspace/api-zod`. The frontend does not import api-zod at all. So api-zod generated files can be left at HEAD when adding endpoints — billing/serviceBilling work needs nothing there.

**Migration convention:** despite drizzle using `push` (no `generate` script, no `out` in drizzle.config), there IS a numbered hand-written SQL log under `lib/db/src/migrations/` (latest is the MFH series, 0044+). New schema changes should add the next numbered `.sql` there (idempotent: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`). There is a second divergent dir `lib/db/migrations/` (lower numbers) — `src/migrations/` is the one carrying recent feature work.
