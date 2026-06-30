---
name: Data migrations only fix dev, never production
description: Why a "merged" data-migration task can leave production still broken, and how to actually repair production data
---

# Data migrations run in dev/isolated envs do NOT reach production

A data-migration task that is MERGED only means its *code* merged and the migration ran against the **dev / isolated** database (which is why dev ends up correct). It does **not** repair the production database. Production data only changes when you:
- run the migration against the **deployed production server** (curl the live `.replit.app` URL's admin endpoint with the `x-migration-key` header = `MIGRATION_KEY`), OR
- choose the data-overwrite option at publish time (overwrites ALL prod data — usually not wanted).

**Why:** Task agents and the dev workspace each have their own database copy. Publish syncs *schema* (diff), not data. So a "fix the data" task can look done while the published app still shows the old/broken data. This exact gap caused the MFH "Clayton" hierarchy to stay broken in production after the repair was merged and dev was fixed.

**How to apply:** When a user reports the *published* app still shows bad data after a data-fix task merged, suspect that only dev was repaired. Verify by querying the production DB directly (`executeSql({ environment: "production" })`, read-only), then run the repair endpoint against the live production URL — not localhost/dev (which is already correct and would be a no-op). Note: production executeSql is read-only, so writes must go through the deployed HTTP endpoint, not SQL.

## How to call a prod admin endpoint
- Get the live URL via `getDeploymentInfo().primaryUrl` (do NOT guess; `$REPLIT_DOMAINS` is the dev domain).
- API is mounted at `/api` (see api-server artifact.toml). Admin migrations: `POST {primaryUrl}/api/admin/migrations/<name>` with header `x-migration-key: $MIGRATION_KEY`.

## MFH "Clayton" specifics
- Production manufacturers had only "Clayton" (the dealer; client is "Clayton Homes Evansville"), with the real builders stored as MODELS under it. Dev has the 10 real builders as top-level manufacturers, no models.
- Repair endpoint: `POST /api/admin/migrations/fix-mfh-hierarchy`. Auto-detection (exact match of manufacturer name vs client names) will NOT catch "Clayton" — pass `dealerManufacturerIds: [<Clayton id>]` explicitly. In production Clayton was id 1.
- Safe because 0 production jobs referenced any manufacturer/model; runs in one transaction with a pre-delete safety gate. Always dry-run first.
