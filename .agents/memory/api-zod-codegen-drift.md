---
name: api-zod codegen drift
description: Why not to run orval codegen for job/contractor API types
---
The OpenAPI source `lib/api-spec/openapi.yaml` has drifted from the committed generated
files in `lib/api-client-react/src/generated/` and `lib/api-zod/src/generated/`.

**Why:** Some request/response fields exist in the generated `api.schemas.ts` interfaces
but were never added to `openapi.yaml` — they were hand-added directly to the generated
files.

**How to apply:** To add a new request/response field, edit the generated interface(s) by
hand (mirror an existing field that lives in both the entity and its create-request type),
and add the matching server route handling. Do NOT run the api-spec codegen — it
regenerates from the stale spec and silently DELETES the hand-added fields, breaking the
job form and other features.
