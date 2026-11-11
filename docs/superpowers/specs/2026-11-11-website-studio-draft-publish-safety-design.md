# Website Studio Draft and Publish Safety

**Date:** 2026-11-11

**Status:** Approved by the user; implementation plan drafted separately

**Scope:** Phase B reliability work following the Website Studio Phase A audit

## Problem

The Website Studio currently saves editor content into `website_configs.sections` and `website_configs.settings`. Public website routes read those same fields whenever `published=true`. As a result, autosave and “Save Draft” can change the live site before the owner chooses Publish.

The editor also normalizes loaded content during hydration. When a saved site has no header, it inserts one, marks the editor dirty, and schedules autosave. The Phase A read-only browser audit reproduced an attempted PUT on opening a published development site with no header; the request was blocked and no data was changed.

Phase B must ensure that editor saves never change published content, that loading a site is read-only, and that only an explicit Publish promotes a draft.

## Goals

- Keep saved draft content separate from the public website.
- Preserve existing published content during migration.
- Make Publish the only operation that changes the public website.
- Ensure opening or refreshing the editor performs no write.
- Preserve local work on save, publish, or revision conflicts.
- Keep draft data inaccessible from public website responses, including after a code rollback.
- Keep draft-only media private and preserve currently published image assets until Publish.
- Verify the behavior for slug routes, custom domains, nested pages, and private preview.

## Non-goals

- Website maintenance mode and HTTP 503 handling. This remains Phase C and requires a separate hosting/routing feasibility review.
- Persistent version history. Phase B stores the latest draft and the current published snapshot; existing undo/redo remains session-local.
- A broad visual redesign of the editor. Phase B includes only the status and error UI needed for safe draft editing.
- Production migrations, publishing, or changes to the public site.

## Current system boundaries

- `GET` and `PUT /api/website` are owner-only editor routes.
- `POST /api/website/publish` is the explicit publish route.
- Public slug and custom-domain routes read `website_configs` only when `published=true`.
- Private draft preview uses an authenticated endpoint.
- `website_configs` has one row per business and currently holds the public content, `published`, and `publishedAt`.

## Storage decision

Use a separate `website_config_drafts` table rather than adding draft columns to `website_configs`.

The Phase A review found that several public handlers select and serialize the entire `website_configs` row. If draft columns were added to that table, updated handlers could omit them, but a rollback to the current handlers could serialize the draft columns into public JSON. A separate table avoids that class of leak: public handlers continue querying only the published table, and old code cannot return draft rows it does not know about.

### Draft table

Add a one-row-per-business table with:

- `business_id`: primary or unique key referencing `businesses.id` with cascade delete. A draft can exist before a published config row.
- `sections` and `settings`: JSONB draft content.
- `revision`: monotonically increasing draft revision.
- `published_revision`: revision whose content matches the current published snapshot, or zero before first publish.
- `updated_at`: timestamp of the latest draft write.

The existing `website_configs.sections` and `.settings` remain the canonical published snapshot. Existing public routes continue reading them. Draft writes do not update the published row or its timestamps.

## Media replacement and privacy

The current Media Library replacement endpoint rewrites URLs in `website_configs` and deletes the old object. That behavior must not remain on a draft-editing path.

- Replacing an image uploads a new asset, then creates a new `website_media` item and updates matching URLs only in the business’s draft sections/settings. If that database transaction fails, clean up only the newly uploaded objects. Never delete the original asset during replacement.
- Keep the existing asset and its object files while the published site references them. After Publish, the owner can use the existing usage-checked delete flow to remove an old, unused asset.
- A draft-only image URL is not public. The public image route checks whether the asset is referenced by any published config. If so, it serves the asset publicly; otherwise, it requires owner authorization for the asset’s business. Unauthorized or unknown draft assets return not-found behavior.
- The authenticated draft preview can load draft-only images. Once Publish references a new image, its public URL becomes available. Unused draft images remain owner-only.
- Media usage and deletion checks include both published configs and saved drafts, preventing deletion of an asset still used in either state.
- For an explicit delete, check references and delete the media row in a guarded transaction first. Delete object-storage files only after that transaction commits successfully. If a guard or database operation rejects the delete, skip object cleanup. If storage cleanup fails after a successful row delete, report it for retry; no content row may still reference those files.

This keeps a draft image from becoming publicly fetchable merely because someone knows its UUID, and prevents replacement from breaking an image still used by the live site.

### Migration and backfill

Use an additive, transactional migration. In one transaction:

1. Create `website_config_drafts`.
2. Acquire a `SHARE ROW EXCLUSIVE` lock on `website_configs`. This waits for in-flight writes to finish and blocks legacy inserts/updates until the transaction commits.
3. Backfill every existing `website_configs` row that has no draft row.
4. Install the database write guards described below.
5. Commit the migration and release the table lock.

This ensures every write committed before the lock is included in the backfill, and every legacy write after commit is rejected by the guard. If the migration runner cannot hold the table lock through backfill and guard installation in one transaction, disable editor writes for the entire migration window.

- Preserve all existing published fields, `published`, `publishedAt`, domains, and page content.
- For an already published row, copy the current content into the draft with `revision=1` and `published_revision=1`; the copied draft matches the live snapshot.
- For an existing unpublished row, copy the content with `revision=1` and `published_revision=0`; public routes continue to reject it.
- Make the backfill idempotent so it can safely run again without overwriting a draft created after the migration.
- Do not create a `website_configs` row merely because the editor is opened or a draft is saved.

For a new business without a config row, `GET /api/website` may return default content for the editor, but does not persist it. The first draft save creates only a draft row. The first Publish creates or updates the published row.

## API and data flow

### Editor load

`GET /api/website?businessId=...` remains owner-only. It returns the existing editor response shape (`sections`, `settings`) from the draft table, along with:

- published state and publish timestamp from `website_configs`, when present;
- `draftRevision` and `publishedRevision`;
- a derived `hasUnpublishedChanges` state. For a published site it is true when draft and published revisions differ; for an unpublished site it is true after a saved draft exists.

If a draft row is absent, the server uses the existing config content as the editor view when available, or returns defaults for an unpublished new site. It returns `draftRevision=0` and `publishedRevision=0` and does not create either row. The first save creates revision 1; if it matches the published JSONB content, the published revision marker is also set to 1. Reading must not write to either table.

### Save Draft and autosave

`PUT /api/website?businessId=...` remains owner-only and accepts the editor’s sections and settings plus the `expectedDraftRevision` last read by that editor.

- Apply the existing sections, settings, SEO, and page-slug validation.
- Upsert only `website_config_drafts`; do not update `website_configs`.
- Increment the draft revision only when normalized content changes.
- If the resulting draft is JSONB-equal to the published snapshot, set `published_revision` to the new draft revision. Otherwise retain the previous published revision. For an unpublished site, keep `published_revision=0`.
- Return the saved draft and its revision.
- If the supplied revision is stale, return `409` with a stable conflict code. Do not overwrite the newer draft.
- Keep the existing two-second autosave after actual edits, but send it only to this draft route.

### Publish

The editor flushes its save queue, then sends `POST /api/website/publish?businessId=...` with `expectedDraftRevision`. The server promotes the already-saved draft; it does not accept a second content payload as another source of truth.

In one database transaction:

1. Lock or otherwise compare the draft row against `expectedDraftRevision`.
2. Reject a stale revision with `409` without changing public content.
3. Validate the stored draft.
4. Create or update `website_configs.sections` and `.settings` from that draft.
5. Set `published=true` and update `publishedAt` and the published row’s `updatedAt`.
6. Set `published_revision` to the promoted draft revision.

If the transaction fails, the old published snapshot remains intact and the draft remains available. A successful response includes the published and draft revision markers.

### Database write guard

Add database guards that protect published content and referenced media even if older API code is restored.

- Install the guard in the same transaction as the additive migration/backfill.
- A trigger on `website_configs` rejects any insert, or change to `sections`, `settings`, `published`, or `publishedAt`, unless the transaction-local `app.website_publish_allowed` setting is enabled by the new explicit Publish transaction.
- Use one transaction-scoped advisory lock for website content and media-reference writes across all businesses. Application transactions acquire it before validating references or changing rows so cross-business references cannot race a delete. This serializes only these infrequent website edits, not public reads or page-view tracking.
- Triggers on `website_config_drafts`, `website_configs`, and `website_media` acquire the same lock before checking writes. The media trigger rejects URL/object-path updates or row deletion when the old asset is referenced by any published config or saved draft. This stops older replacement or delete handlers from removing files used by a draft that their code cannot see.
- The Publish transaction sets the local setting, writes the promoted draft, and commits atomically. Normal draft saves and media replacement do not write the published table and do not enable the setting.
- Legacy Save Draft, media replacement, or Publish handlers fail closed while the guards are active; they cannot change the live website or create an alternate config row. A rollback may temporarily make the old editor’s write actions unavailable, but must not revert the database guards.
- Test the trigger against direct insert/update attempts as well as the new Publish route. Any future code path that intentionally changes published fields must use the same explicit transaction capability.

### Public routes and preview

- Public slug, custom-domain, nested-page, contact, deposit, sitemap, robots, manifest, and logo/config behavior continues to read only `website_configs` and its published fields.
- Public handlers must not join or serialize the draft table.
- The authenticated preview endpoint reads draft content. It stays behind owner authentication and is excluded from public view tracking and public SEO metadata.
- Changing a custom domain in a draft does not change domain routing until Publish, because public host lookup continues using the published settings.
- Draft-only media access follows the media privacy rules above; public media access is granted only when a published config references that asset.

## Editor behavior

- Initial hydration is read-only. It must not set dirty state, increment a revision, or schedule autosave.
- Do not silently insert a header or default pages into an existing saved site. Display the saved structure as-is; adding structural content requires an explicit owner action.
- New-site defaults may be prepared locally. They are saved only after a real edit or an explicit Save Draft action.
- Keep the “Published” state distinct from “Unpublished changes.” Derive the latter from the persisted draft/published revision state so it remains correct after reload.
- When a draft save fails, retain the local content and dirty state. Say the draft was not saved and the public site is unchanged; offer Retry.
- On a revision conflict, retain local edits and present a clear reload/resolve path. Never silently replace local content.
- Do not clear the unpublished state or show a successful Publish state until the server confirms the transaction.
- Media replacement reports that the replacement is staged in the draft. The original library asset stays available for the published website until the draft is published.

## Failure handling and compatibility

- A failed draft write cannot affect public content because it does not write the published table.
- A failed publish transaction leaves the published row unchanged.
- A stale save or publish returns `409`; local edits remain available to the owner.
- A code rollback to the current public handlers cannot expose drafts because they read only `website_configs`; the database guard also rejects the old editor’s direct writes to that table. Drafts may be temporarily inaccessible to the older editor until the new code is restored, but remain stored in the separate draft table.
- Object storage cleanup occurs only after the database reference checks succeed. Draft saves validate that referenced media rows exist while holding the same business lock, so an asset cannot be deleted between validation and save.
- Replacement and deletion endpoints perform object cleanup only after their guarded database transaction commits. A rejected legacy database write skips cleanup; replacement failure may remove only the new, unreferenced upload.
- Do not remove or disable the database guard during a code rollback. Older Save Draft, Publish, and media replacement handlers may fail with an error until the draft-aware API is restored; this is preferable to silently changing the live site.
- Keep database changes additive. Do not drop or repurpose existing published fields.

## Verification

Add API and authenticated-browser coverage for:

1. Opening an existing site with missing legacy sections produces no PUT and no data change.
2. Migration copies existing content to drafts without changing the published response.
3. Draft save and reload preserve the draft while slug and custom-domain responses still return the previous published snapshot.
4. Draft-only content and revision metadata are absent from all public JSON responses.
5. Explicit Publish promotes exactly the expected revision; a stale revision returns `409`.
6. Failed save and failed publish preserve both the local draft and the previous live snapshot.
7. A new site remains unavailable on public routes until its first explicit Publish.
8. Authenticated preview can read the draft; unauthenticated public routes cannot.
9. Updating draft custom-domain settings does not change host resolution until Publish.
10. Replacing a published image changes only the draft; the old image remains available publicly until publication and is not deleted by replacement.
11. Draft-only image URLs require owner authorization; after Publish, referenced images are publicly available.
12. Media usage checks prevent deletion while either published or draft content references an asset.
13. The database guard rejects legacy/direct writes to published fields and permits the explicit Publish transaction only.
14. Legacy media replacement and deletion cannot remove an asset referenced by a draft or published website, including when the old handler is restored; verify both database behavior and actual object persistence.
15. Concurrent draft save, Publish, replacement, and deletion—including references from another business—serialize on the shared lock; no committed content points at a deleted asset.
16. A legacy write racing the migration is either included before backfill or rejected after the guard is installed; it cannot be missed between those steps.
17. Saving draft content back to the currently published JSON clears the persisted unpublished-change indicator after reload.

Use isolated development fixtures and block unexpected writes in browser verification. Do not use the production website or production data for these checks.

## Phase boundaries

Phase B implements and verifies draft/published isolation and editor save safety only. Phase C separately investigates whether the deployed public root can return HTTP 503 with `Retry-After`. A client-rendered maintenance screen is not an acceptable substitute for the required HTTP status. No Phase C work should begin until the hosting/routing capability is confirmed and the user approves that design.
