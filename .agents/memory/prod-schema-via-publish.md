---
name: Prod schema via Publish
description: How production schema changes work — publish can wipe columns added via raw SQL; the correct fix is startup-time ADD COLUMN IF NOT EXISTS in index.ts.
---

# Production Schema Changes — Correct Pattern

## The Problem
When Replit Publish runs, Drizzle-kit push compares the schema and can prompt the user about mismatches. If the user clicks through the warning, columns added via one-time `ALTER TABLE` (migration endpoints or curl) are wiped on the next publish. This happened with `accepted_at`, `sent_at`, `sent_method` on the invoices table — added via migration endpoint → confirmed present → disappeared after next publish because the user accepted the Drizzle warning.

## The Correct Fix

**For any column that production keeps losing after publish: add it to the server startup in `artifacts/api-server/src/index.ts`.**

Add an `ADD COLUMN IF NOT EXISTS` in the `start()` function, before `app.listen`. This runs on every server boot (dev and prod), so the column is always present regardless of what Drizzle does during publish.

```ts
async function ensureMyColumns(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE my_table
        ADD COLUMN IF NOT EXISTS my_col TEXT;
    `);
    console.log("[startup] my_col ensured.");
  } catch (err) {
    console.error("[startup] ensureMyColumns failed (non-fatal):", err);
  }
}

async function start() {
  await ensureMyColumns();
  // ... rest of startup
}
```

**Why this works:** `ADD COLUMN IF NOT EXISTS` is fully idempotent. If the column already exists it's a no-op. If Drizzle wiped it during publish, the server adds it back within milliseconds of boot, before any request is served.

## Also do these steps
1. Ensure the column is in `lib/db/src/schema/<table>.ts` (source of truth for types).
2. Add to `scripts/post-merge.sh` for dev DB consistency after task merges.
3. For the current live production instance (before next publish), still curl the admin migration endpoint to apply immediately — don't wait for a publish cycle.

## push-force truncation warning
`pnpm --filter @workspace/db run push-force` (drizzle-kit push --force) can prompt to truncate `invoices` when adding a unique constraint. Never run it blindly — use targeted `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` instead.

## Production URL
`https://willardsgc.com` (additional: `https://business-managment-pro.replit.app`)
Trigger migration endpoints via: `curl -X POST <url>/api/admin/migrations/<endpoint> -H "x-migration-key: $MIGRATION_KEY"`
