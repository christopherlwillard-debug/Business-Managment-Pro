# One trusted schema and API contract

This project has historically accumulated three migration trees and startup
DDL. That history is useful for reconciliation, but it must not create multiple
execution authorities.

## Policy

1. The Drizzle modules under `lib/db/src/schema/` are the source of truth for
   the desired application schema.
2. New reviewed SQL migrations belong only in `lib/db/migrations/`.
3. `lib/db/src/migrations/` and `artifacts/api-server/src/migrations/` are
   historical/manual reconciliation trees. They are frozen: do not add,
   renumber, or execute them as part of normal releases.
4. `drizzle-kit push` may synchronize a development database while iterating,
   but it is not a production migration ledger. Production changes require a
   reviewed canonical migration and the release process.
5. API shape is defined in `lib/api-spec/openapi.yaml`. Run the API-spec
   codegen command after changing it; never hand-edit generated client files.
6. A mounted route is not considered contract-complete until its OpenAPI
   operation, generated client output (when client-facing), and frontend caller
   are inventoried. Public, webhook, and server-only routes must be labeled as
   such rather than omitted.

## Verification

Run:

```sh
pnpm run schema-contract:inventory
pnpm run schema-contract:check
```

The first command refreshes
`docs/schema-api-contract-inventory.md`. The check fails on duplicate IDs in
the canonical ledger or missing required contract artifacts, and the generated
inventory reports route/spec gaps and all remaining startup DDL/data changes.

The source inventory does not inspect the active database. Before running the
accounting test/release gate, run the read-only development metadata check:

```sh
pnpm run schema-contract:live-check
```

For the complete accounting release gate, which first verifies the canonical
job-profit contract and then runs the live schema check, use:

```sh
pnpm run accounting:gate
```

The live check fails with a table/column-specific message when a required
ownership column is missing or has the wrong nullability, integer type, foreign
key target, or delete behavior. It never runs DDL, backfills records, or
connects to a production database.

The post-merge setup intentionally continues after a failed development
`drizzle-kit push` so it does not make destructive recovery decisions or block
unrelated setup. It reports that failure immediately and repeats it in the
post-merge validation summary. Treat that warning as a failed development
schema synchronization, not as a successful setup. Confirm the mismatch with
the read-only check:

```sh
pnpm run schema-contract:live-check
```

After review, use the approved development-only synchronization path:

```sh
pnpm --filter @workspace/db run push-force
```

Do not use the warning as a reason to run production DDL, ownership backfills,
or startup self-healing.

## Business ownership release gate

Core accounting records use `business_id` as the canonical ownership field.
The compatibility-period contract is:

| table | column | type | nullable | foreign key | delete behavior |
| --- | --- | --- | --- | --- | --- |
| `clients` | `business_id` | `INTEGER` | yes | `businesses(id)` | `ON DELETE SET NULL` |
| `jobs` | `business_id` | `INTEGER` | yes | `businesses(id)` | `ON DELETE SET NULL` |
| `invoices` | `business_id` | `INTEGER` | yes | `businesses(id)` | `ON DELETE SET NULL` |
| `prospects` | `business_id` | `INTEGER` | yes | `businesses(id)` | `ON DELETE SET NULL` |
| `assets` | `business_id` | `INTEGER` | yes | `businesses(id)` | `ON DELETE SET NULL` |

The Drizzle schema modules and `lib/db/migrations/0047_business_ownership_backfill.sql`
are the trusted definitions for this contract. The migration also applies the
same ownership column to `estimates`, which is part of the broader core-record
policy.

### Verification record — 2026-08-20

Read-only `information_schema` checks were run against both the development and
production databases. All five required tables exist in both environments, but
`business_id` is absent from every required table in both environments. No
ownership foreign keys can therefore be present, and no ownership backfill or
production data mutation was performed.

**Release decision:** accounting changes must not be published until the
development schema has been synchronized and the same metadata check confirms
every required column is nullable `INTEGER` with a foreign key to
`businesses(id)` using `ON DELETE SET NULL`. Production must then be rechecked
after publishing.

### Development gate result — 2026-08-20

The reviewed schema-only change was applied to development through the
post-merge database flow. Read-only metadata verification confirms that
`clients`, `jobs`, `invoices`, `estimates`, `prospects`, and `assets` each have
a nullable `INTEGER business_id` referencing `businesses(id)` with
`ON DELETE SET NULL`.

The ownership inventory remains intentionally unclassified for historical
records: clients (3), jobs (3), invoices (1331), estimates (1), and prospects
(3) have `business_id IS NULL`; assets has 0 unassigned rows. No ambiguous
rows were backfilled.

Production metadata was checked read-only before publishing and still has no
`business_id` columns. Replit Publish must apply the verified development
schema before the final production metadata check and accounting release gate.

### Approved schema-application path

1. Keep the Drizzle schema and reviewed SQL in `lib/db/migrations/` aligned.
2. Merge the schema change and let the post-merge setup apply the development
   schema; do not manually backfill ownership as part of this verification.
3. Re-run the read-only metadata checks and inventory checks in development.
4. Use Replit Publish to diff the verified development schema against
   production and apply the schema change. Do not use production DDL,
   `drizzle-kit push` against production, custom production migration scripts,
   deploy-time schema hooks, or startup-time DDL.
5. Re-run the same read-only metadata checks against production after Publish.

This follows the database migration-on-Publish policy in
`.local/skills/database/references/database-migrations-on-publish.md`.

## Reconciliation queue

The inventory is the review queue for moving startup DDL/backfills behind
reviewed migrations. For each item:

1. identify the exact schema/data assertion and affected production records;
2. add one canonical migration and verify it against development and
   production metadata/data;
3. remove the startup mutation or post-merge SQL;
4. regenerate the inventory and retain the data check in the migration or a
   focused test.

Legacy tables/routes must not be deleted merely because they are absent from
the OpenAPI file. First search route and frontend usage, query production
metadata/data where applicable, and record the retirement decision in the
canonical migration/reconciliation note.