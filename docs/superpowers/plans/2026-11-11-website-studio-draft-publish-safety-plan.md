# Website Studio Draft and Publish Safety — Implementation Plan

**Source spec:** `docs/superpowers/specs/2026-11-11-website-studio-draft-publish-safety-design.md`

**Status:** Plan only; no implementation started

## Goal

Implement the approved Phase B design so saved drafts, editor loading, media replacement, or rollback cannot change or expose live website content. Only explicit Publish may promote content to the public site.

## Guardrails

- Work only in development fixtures and the development website.
- Do not use production data, migrate production, publish, deploy, or activate maintenance mode.
- Preserve current published content and existing public route behavior.
- Keep the database write guards enabled through code rollback.
- Make only focused Website Studio changes; do not undertake a broad editor rewrite.

## Work sequence

### 1. Add the draft table and database protections

Files:
- `lib/db/src/schema/website.ts`
- `lib/db/migrations/`

Work:
- Add `website_config_drafts`, keyed uniquely by business, with draft sections/settings, draft revision, published revision, and draft update timestamp.
- Add an additive, transactional migration.
- Create the draft table, lock `website_configs` with `SHARE ROW EXCLUSIVE`, backfill existing rows idempotently, install the write guards, and commit while the lock is held.
- Add a transaction-scoped advisory lock shared by draft, published-content, and media-reference writes.
- Add triggers that reject unauthorized changes to `website_configs` and prevent media URL/object-path replacement or deletion while any published or draft content references the asset.
- Add development database integration tests for backfill, lock behavior, direct legacy writes, and permitted publish writes.

Exit criteria:
- Existing published JSON remains unchanged.
- Backfill revision markers are deterministic for published and unpublished rows.
- A legacy write racing migration is either included in the backfill or rejected by the installed guard.

### 2. Move editor API writes to drafts

Files:
- `artifacts/api-server/src/routes/website.ts`
- Relevant API route tests under `artifacts/api-server/src/routes/`

Work:
- Change owner-only `GET /api/website` to return draft content and revision/status metadata; keep it read-only for missing configs and draft rows.
- Change owner-only `PUT /api/website` to validate and upsert only the draft table. Acquire the shared advisory lock before media-reference checks and writes.
- Enforce `expectedDraftRevision`, return a stable `409` conflict, and preserve current published content on conflicts.
- If saved draft JSON matches the published snapshot, update the published revision marker so the UI clears the unpublished state.
- Change `POST /api/website/publish` to promote the already-saved expected draft revision in one transaction. Set the transaction-local publish permission only inside this route.
- Keep slug, custom-domain, nested-page, contact, deposit, sitemap, robots, manifest, and logo routes reading the published row only.
- Change the authenticated preview route to read draft content without exposing it to public routes.

Exit criteria:
- Draft saves never write the public config row.
- Publish promotes only the expected revision or returns `409`.
- Public responses contain no draft data.

### 3. Make media changes draft-safe and private

Files:
- `artifacts/api-server/src/routes/website.ts`
- `artifacts/contractor-app/src/pages/website/MediaLibrary.tsx`
- Relevant media route tests

Work:
- Update media replacement to create a new media item and replace URLs only in saved draft JSON.
- Keep the original media row and object files while the published site references them.
- Serve draft-only media only to the owning business; keep media referenced by a published site publicly available.
- Count references in both published config and draft content before deletion.
- Delete object-storage files only after the guarded database transaction succeeds. On failure, clean up only newly uploaded replacement objects.
- Test direct image access for public, owner-authenticated draft, unauthorized, and unknown-media cases.

Exit criteria:
- Replace and delete cannot break a published or draft page.
- Draft-only media URLs do not work without owner authorization.
- Publish makes referenced draft media available to public pages.

### 4. Update editor save and publish states

Files:
- `artifacts/contractor-app/src/pages/website/WebsiteEditor.tsx`
- Relevant WebsiteEditor component tests

Work:
- Make initial hydration read-only: no dirty state, autosave, generated header, or default-page persistence on open.
- Preserve existing saved structure as-is; structural changes require an explicit owner action.
- Keep two-second autosave after genuine edits, targeting only the draft API.
- Send expected revisions with saves and Publish.
- Show persisted unpublished state after reload, and retain local edits on save errors or `409` conflicts.
- Clear the unpublished state only after the server confirms matching published revision.
- Label media replacement as staged in the draft.

Exit criteria:
- Opening an existing or new site sends no write.
- Failed and conflicted saves do not discard local work or alter public content.

### 5. Verify end-to-end invariants

Run:
- Website API suites, including database-backed guard/migration tests.
- Contractor app website component tests.
- Authenticated browser checks using isolated development fixtures and request guards.

Required scenarios:
- Open legacy published content with missing sections; no PUT occurs.
- Save and reload a draft; public slug, custom-domain, nested-page, and metadata routes still return the old published snapshot.
- Explicit Publish promotes the expected draft; stale revision and failed transaction leave public content unchanged.
- New websites remain unavailable publicly until first Publish.
- Draft-only media requires authentication; replacement preserves old published files until Publish.
- Concurrent save, publish, replace, and delete operations serialize without leaving references to deleted assets.
- Pre-Phase-B direct database/API writes fail closed while guards are active.

## Dependencies

1. Database schema, migration, guards, and integration tests.
2. API draft/publish and media behavior.
3. Editor state and media-library UI.
4. Full development verification.

## Risks to monitor

- The migration table lock blocks writes to `website_configs` until backfill and guards commit; keep the transaction short and disable editor writes if transactional locking is unavailable.
- The shared advisory lock serializes website content and media-reference writes across businesses. It is limited to writes and accepted for the current editing workload; do not use it for public reads or view tracking.
- Media privacy relies on accurate published/draft reference checks. Test the actual object-storage cleanup and authorization behavior, not only mocked database responses.

## Completion boundary

This plan covers Phase B only. Phase C maintenance mode requires a separate hosting/routing feasibility review for returning HTTP 503 at the public custom-domain root. No Phase C implementation, production migration, deployment, or publishing is included here.
