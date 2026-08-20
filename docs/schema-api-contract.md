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