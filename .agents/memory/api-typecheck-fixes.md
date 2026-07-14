---
name: API server TypeScript error fix patterns
description: Patterns used to eliminate 204→0 TS errors in artifacts/api-server with Drizzle ORM + Express
---

## Key patterns that fixed TS errors

**SelectedFields / getTableColumns**
- Never spread `...table` in `db.select({})` — table objects have non-column methods that fail SelectedFields. Always use `getTableColumns(table)`.

**Drizzle conditional where chaining**
- `let query: any = db.select(...)...` — typing the query builder as `any` allows `.where()` reassignment across branching logic without type narrowing conflicts.

**Express req.params**
- All `req.params.*` are typed `string | string[]` in this project. Always cast `as string` in eq() calls and parseInt().
- Destructuring `const { id } = req.params` → prefer `const id = req.params.id as string`.

**ReadableStream incompatibility**
- `response.body as any` when passing to `Readable.fromWeb()` — the fetch `ReadableStream<Uint8Array<...>>` doesn't satisfy Node's overloaded param.

**Drizzle Map<K, typeof queryResult>**
- If the query uses a ternary `cond ? db.select()... : Promise.resolve([])`, `typeof result` becomes `never[]`. Use `Map<number, any[]>` instead.

**p-retry v7**
- `AbortError` is a named export: `import { AbortError } from "p-retry"`. Not `pRetry.AbortError`.

**lib/api-zod disambiguating re-exports**
- When both `api.ts` (Zod consts) and `types/` (interfaces) export the same name → TS2308. Explicit re-export from `api.ts` disambiguates.

**mfh.ts values() cast**
- Drizzle `.insert().values({ ... } as any)` is safe when object shape is verifiably correct but TypeScript can't narrow it (e.g. dynamic or spread objects).

**wrapAsync next parameter**
- `next: NextFunction` (required) not `next?: NextFunction` — otherwise TS2722 fires at every `next()` call inside the wrapper.

**Why:**
These were the dominant patterns across 204 errors reduced to 0. Future schema changes should apply the same patterns.
