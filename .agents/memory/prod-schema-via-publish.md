---
name: Production schema changes go through Publish, never a migration endpoint
description: Why "production missing a column" must be fixed by re-publish, not by an admin-migrations DDL endpoint; how to safely apply a single column to dev
---

# Production schema drift ("column does not exist") — correct fix

When production fails with `column "X" does not exist` and the schema source of truth (`lib/db/src/schema/*.ts`) already declares the column, the fix is NOT a migration endpoint.

**Rule:** Never add an admin-migrations endpoint, deploy-build hook, or startup-time DDL that runs `ALTER TABLE`/`CREATE TABLE` against the production database. Replit's Publish flow is the only supported path for production schema changes — on Publish it diffs the dev schema against prod and applies the SQL (prompting the user for renames/destructive alters).

**Why:** The `database` skill's `database-migrations-on-publish.md` explicitly prohibits custom prod migration scripts/endpoints and self-heal DDL. The classic failure mode it prevents: agent writes a prod migration endpoint/hook instead of just re-publishing.

**How to apply:**
1. Ensure the column is in the schema source of truth (it usually already is).
2. Apply it to the **dev** database (dev DDL is fully supported).
3. Verify the feature works in dev.
4. Tell the user to re-publish — the publish diff carries the column to prod.

## admin-migrations.ts is for DATA ops, not schema DDL
The existing endpoints (remove-orphan-mileage, delete-payworker-expenses, seed/fix MFH) are one-time **data** migrations. Schema DDL does not belong there — keep that distinction.

## push-force prompts to TRUNCATE invoices — do not use it blindly
`pnpm --filter @workspace/db run push-force` (drizzle-kit push --force) still STOPS on an interactive prompt offering to truncate the `invoices` table when adding the `invoices_pay_token_unique` unique constraint. It hangs waiting for stdin and risks data loss. To apply a single safe column to dev, run a targeted `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` via executeSql (development) or psql instead of a full-schema push.
