#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

if (process.env.NODE_ENV !== "development") {
  throw new Error("Website Phase B verification is development-only.");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is unavailable.");

const requireFromDb = createRequire(new URL("../lib/db/package.json", import.meta.url));
const { Client } = requireFromDb("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
const check = (condition, label) => {
  assert.ok(condition, label);
  console.log(`PASS: ${label}`);
};

await client.connect();
try {
  const missingDrafts = await client.query(`
    SELECT count(*)::int AS count
    FROM website_configs c
    LEFT JOIN website_config_drafts d USING (business_id)
    WHERE d.business_id IS NULL
  `);
  check(missingDrafts.rows[0].count === 0, "every existing config has a private draft snapshot");

  await client.query("BEGIN");
  const business = await client.query(
    "INSERT INTO businesses (name, slug) VALUES ($1, $2) RETURNING id",
    ["Phase B verification", `phaseb-verify-${randomUUID()}`],
  );
  const businessId = business.rows[0].id;
  const draftSections = JSON.stringify([{ type: "hero", content: { headline: "PRIVATE_DRAFT_MARKER" } }]);
  const settings = JSON.stringify({});
  await client.query(
    `INSERT INTO website_config_drafts (business_id, sections, settings, revision, published_revision)
     VALUES ($1, $2::jsonb, $3::jsonb, 1, 0)`,
    [businessId, draftSections, settings],
  );
  const noPublicRow = await client.query(
    "SELECT count(*)::int AS count FROM website_configs WHERE business_id = $1",
    [businessId],
  );
  check(noPublicRow.rows[0].count === 0, "saving a draft does not create a public config");

  await client.query("SAVEPOINT legacy_insert");
  let legacyInsertBlocked = false;
  try {
    await client.query(
      `INSERT INTO website_configs (business_id, sections, settings, published)
       VALUES ($1, $2::jsonb, $3::jsonb, true)`,
      [businessId, draftSections, settings],
    );
  } catch (error) {
    legacyInsertBlocked = error.code === "55000";
    await client.query("ROLLBACK TO SAVEPOINT legacy_insert");
  }
  check(legacyInsertBlocked, "legacy direct insert cannot publish draft content");

  await client.query("SELECT set_config('app.website_publish_allowed', 'on', true)");
  const publishedSections = JSON.stringify([{ type: "hero", content: { headline: "PUBLISHED_BASELINE" } }]);
  await client.query(
    `INSERT INTO website_configs (business_id, sections, settings, published)
     VALUES ($1, $2::jsonb, $3::jsonb, true)`,
    [businessId, publishedSections, settings],
  );
  await client.query("SAVEPOINT failed_publish");
  await client.query(
    "UPDATE website_configs SET sections = $2::jsonb WHERE business_id = $1",
    [businessId, draftSections],
  );
  await client.query("ROLLBACK TO SAVEPOINT failed_publish");
  const afterFailedPublish = await client.query(
    "SELECT sections FROM website_configs WHERE business_id = $1",
    [businessId],
  );
  check(
    JSON.stringify(afterFailedPublish.rows[0].sections).includes("PUBLISHED_BASELINE")
      && !JSON.stringify(afterFailedPublish.rows[0].sections).includes("PRIVATE_DRAFT_MARKER"),
    "failed publish rollback preserves the previous public snapshot",
  );

  await client.query("SELECT set_config('app.website_publish_allowed', 'off', true)");
  await client.query("SAVEPOINT rollback_write");
  let legacyUpdateBlocked = false;
  try {
    await client.query(
      "UPDATE website_configs SET sections = $2::jsonb WHERE business_id = $1",
      [businessId, draftSections],
    );
  } catch (error) {
    legacyUpdateBlocked = error.code === "55000";
    await client.query("ROLLBACK TO SAVEPOINT rollback_write");
  }
  check(legacyUpdateBlocked, "rolled-back application cannot write draft content into the public config");

  const mediaUrl = "https://private.invalid/api/website/draft-media-image/00000000-0000-4000-8000-000000000001";
  const media = await client.query(
    `INSERT INTO website_media (business_id, filename, object_path, url)
     VALUES ($1, 'phase-b.png', '/objects/uploads/website-media-drafts/00000000-0000-4000-8000-000000000001.png', $2)
     RETURNING id`,
    [businessId, mediaUrl],
  );
  await client.query(
    `UPDATE website_config_drafts
     SET sections = $2::jsonb
     WHERE business_id = $1`,
    [businessId, JSON.stringify([{ type: "hero", content: { imageUrl: mediaUrl } }])],
  );
  await client.query("SAVEPOINT protected_media");
  let mediaDeleteBlocked = false;
  try {
    await client.query("DELETE FROM website_media WHERE id = $1", [media.rows[0].id]);
  } catch (error) {
    mediaDeleteBlocked = error.code === "55000";
    await client.query("ROLLBACK TO SAVEPOINT protected_media");
  }
  check(mediaDeleteBlocked, "media referenced by a saved draft cannot be deleted");

  await client.query("ROLLBACK");
  console.log("PASS: all verification fixtures rolled back; no business, config, draft, or media rows remain");
} finally {
  await client.end();
}
