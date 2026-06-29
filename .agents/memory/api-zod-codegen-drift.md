---
name: api-zod codegen drift
description: Why not to run orval codegen for job/contractor API types
---
The OpenAPI source `lib/api-spec/openapi.yaml` has drifted from the committed generated
files in `lib/api-client-react/src/generated/` and `lib/api-zod/src/generated/`.

**Why:** Fields like `homeModel` (and now `mfhManufacturerId`/`mfhModelId`/`mfhModelYear`)
exist in the generated `api.schemas.ts` interfaces but are NOT in `openapi.yaml`. They were
hand-added directly to the generated files.

**How to apply:** To add a new request/response field, edit the generated interface(s) by
hand (mirror an existing field like `homeModel`, present in both `Job` and `CreateJobRequest`),
and also add the matching server route handling in `artifacts/api-server/src/routes/`.
Do NOT run `pnpm --filter @workspace/api-spec codegen` — it regenerates from the stale spec
and silently DELETES the hand-added fields, breaking the job form and other features.
