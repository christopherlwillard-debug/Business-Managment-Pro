/* Development-only API verification for Website Studio draft isolation. */
import { launchBrowser } from "../src/lib/launchBrowser";
import { db } from "@workspace/db";
import { businessesTable, sessionsTable, settingsTable, websiteConfigDraftsTable, websiteConfigsTable, websiteMediaTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { ObjectStorageService } from "../src/lib/objectStorage";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:80";
const SID = `e2e-website-phaseb-${crypto.randomUUID()}`;
if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
  throw new Error("Refusing to run Website Phase B verification against production.");
}
const target = new URL(BASE);
if (target.protocol !== "http:" || !["localhost", "127.0.0.1", "::1"].includes(target.hostname)) {
  throw new Error("Website Phase B verification requires a local development preview.");
}

const results: Array<{ name: string; pass: boolean; detail?: string }> = [];
const record = (name: string, pass: boolean, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
};

let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
let businessId: number | undefined;
let sessionCreated = false;
const objectStorage = new ObjectStorageService();
const uploadedObjectPaths: string[] = [];
let draftMediaUrl: string | undefined;
let draftMediaUuid: string | undefined;
try {
  const [settings] = await db.select({ ownerUserId: settingsTable.ownerUserId }).from(settingsTable).limit(1);
  if (!settings?.ownerUserId) throw new Error("No development owner is configured for the authenticated API test.");
  await db.insert(sessionsTable).values({
    sid: SID,
    sess: {
      user: { id: settings.ownerUserId, email: "website-phaseb@example.invalid", firstName: "Website", lastName: "Phase B" },
      access_token: "development-browser-test-session",
      expires_at: Math.floor(Date.now() / 1000) + 86_400,
    },
    expire: new Date(Date.now() + 86_400_000),
  });
  sessionCreated = true;
  const [business] = await db.insert(businessesTable).values({
    name: "Website Phase B Verification",
    slug: `phaseb-${crypto.randomUUID()}`,
    type: "other",
  }).returning();
  businessId = business.id;

  browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setCookie({ name: "sid", value: SID, url: BASE, path: "/" });
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 30_000 });

  const initial = await page.evaluate(async (businessId) => {
    const response = await fetch(`/api/website?businessId=${businessId}`, { credentials: "include" });
    return { status: response.status, body: await response.json() };
  }, businessId);
  record("Editor load reads defaults without creating a published config", initial.status === 200 && initial.body.draftRevision === 0);

  const uploaded = await page.evaluate(async (businessId) => {
    const bytes = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pQAAAABJRU5ErkJggg=="), c => c.charCodeAt(0));
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: "image/png" }), "phase-b.png");
    const response = await fetch(`/api/website/media/upload?businessId=${businessId}`, {
      method: "POST", credentials: "include", body: form,
    });
    return { status: response.status, body: await response.json() };
  }, businessId);
  if (uploaded.status !== 200) throw new Error(`Draft media upload failed: ${JSON.stringify(uploaded.body)}`);
  uploadedObjectPaths.push(
    uploaded.body.objectPath,
    uploaded.body.webpObjectPath,
    uploaded.body.thumbnailObjectPath,
    uploaded.body.displayObjectPath,
  );
  draftMediaUrl = uploaded.body.url;
  draftMediaUuid = uploaded.body.objectPath.split("/").pop();
  const mediaAccess = await page.evaluate(async (uuid) => {
    const privateResponse = await fetch(`/api/website/draft-media-image/${uuid}`, { credentials: "include" });
    const publicResponse = await fetch(`/api/public/site/media-image/${uuid}`, { credentials: "omit" });
    const anonymousPrivateResponse = await fetch(`/api/website/draft-media-image/${uuid}`, { credentials: "omit" });
    return {
      privateStatus: privateResponse.status,
      publicStatus: publicResponse.status,
      anonymousStatus: anonymousPrivateResponse.status,
    };
  }, draftMediaUuid);
  record(
    "Draft-only image is owner-only and absent from public image delivery",
    mediaAccess.privateStatus === 200 && mediaAccess.publicStatus === 404 && mediaAccess.anonymousStatus === 401,
    JSON.stringify(mediaAccess),
  );

  const firstSave = await page.evaluate(async ({ businessId, sections, settings }) => {
    const response = await fetch(`/api/website?businessId=${businessId}`, {
      method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sections, settings, expectedDraftRevision: 0 }),
    });
    return { status: response.status, body: await response.json() };
  }, {
    businessId,
    sections: initial.body.sections.map((section: any) =>
      section.type === "hero" ? { ...section, content: { ...section.content, headline: "PHASE_B_DRAFT_ONE", imageUrl: draftMediaUrl } } : section,
    ),
    settings: initial.body.settings,
    mediaUrl: draftMediaUrl,
  });
  record("Draft save persists revision one", firstSave.status === 200 && firstSave.body.draftRevision === 1);

  const publicBeforePublish = await page.evaluate(async (slug) => {
    const response = await fetch(`/api/public/site/${slug}`, { credentials: "omit" });
    return { status: response.status, body: await response.json() };
  }, business.slug);
  record("Unpublished draft is absent from public endpoint", publicBeforePublish.status === 404);

  const staleSave = await page.evaluate(async ({ businessId, sections, settings }) => {
    const response = await fetch(`/api/website?businessId=${businessId}`, {
      method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sections, settings, expectedDraftRevision: 0 }),
    });
    return { status: response.status, body: await response.json() };
  }, { businessId, sections: firstSave.body.sections, settings: firstSave.body.settings });
  record("Stale draft save is rejected without overwriting revision one", staleSave.status === 409);

  const firstPublish = await page.evaluate(async ({ businessId, revision }) => {
    const response = await fetch(`/api/website/publish?businessId=${businessId}`, {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedDraftRevision: revision }),
    });
    return { status: response.status, body: await response.json() };
  }, { businessId, revision: 1 });
  record("Explicit publish promotes the saved revision", firstPublish.status === 200 && firstPublish.body.publishedRevision === 1);

  const firstPublic = await page.evaluate(async (slug) => {
    const response = await fetch(`/api/public/site/${slug}`, { credentials: "omit" });
    return { status: response.status, body: await response.json() };
  }, business.slug);
  const firstHeadline = firstPublic.body.sections?.find((section: any) => section.type === "hero")?.content?.headline;
  record("Public endpoint returns only the published snapshot", firstPublic.status === 200 && firstHeadline === "PHASE_B_DRAFT_ONE");
  const publicImageUrl = firstPublic.body.sections?.find((section: any) => section.type === "hero")?.content?.imageUrl;
  const publicImage = await page.evaluate(async (url) => {
    const response = await fetch(url, { credentials: "omit" });
    return { status: response.status, contentType: response.headers.get("content-type") };
  }, publicImageUrl);
  record("Publish promotes staged media to a public image path", publicImage.status === 200 && publicImage.contentType === "image/png");

  const secondSave = await page.evaluate(async ({ businessId, sections, settings }) => {
    const nextSections = sections.map((section: any) =>
      section.type === "hero" ? { ...section, content: { ...section.content, headline: "PHASE_B_DRAFT_TWO" } } : section,
    );
    const response = await fetch(`/api/website?businessId=${businessId}`, {
      method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sections: nextSections, settings, expectedDraftRevision: 1 }),
    });
    return { status: response.status, body: await response.json() };
  }, { businessId, sections: firstPublish.body.sections, settings: firstPublish.body.settings });
  record("Second draft revision saves without changing the live site", secondSave.status === 200 && secondSave.body.draftRevision === 2);

  const failedPublish = await page.evaluate(async ({ businessId }) => {
    const response = await fetch(`/api/website/publish?businessId=${businessId}`, {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedDraftRevision: 1 }),
    });
    return { status: response.status, body: await response.json() };
  }, { businessId });
  const publicAfterFailure = await page.evaluate(async (slug) => {
    const response = await fetch(`/api/public/site/${slug}`, { credentials: "omit" });
    return { status: response.status, body: await response.json() };
  }, business.slug);
  const unchangedHeadline = publicAfterFailure.body.sections?.find((section: any) => section.type === "hero")?.content?.headline;
  record(
    "Failed stale publish preserves the existing live snapshot",
    failedPublish.status === 409 && unchangedHeadline === "PHASE_B_DRAFT_ONE",
  );

  const secondPublish = await page.evaluate(async ({ businessId }) => {
    const response = await fetch(`/api/website/publish?businessId=${businessId}`, {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedDraftRevision: 2 }),
    });
    return { status: response.status, body: await response.json() };
  }, { businessId });
  record("Publishing revision two succeeds", secondPublish.status === 200 && secondPublish.body.publishedRevision === 2);
} finally {
  await browser?.close();
  if (businessId != null) {
    const mediaRows = await db.select().from(websiteMediaTable).where(eq(websiteMediaTable.businessId, businessId));
    uploadedObjectPaths.push(...mediaRows.flatMap(media => [
      media.objectPath, media.webpObjectPath, media.thumbnailObjectPath, media.displayObjectPath,
    ]));
    await db.delete(websiteConfigsTable).where(eq(websiteConfigsTable.businessId, businessId));
    await db.delete(websiteConfigDraftsTable).where(eq(websiteConfigDraftsTable.businessId, businessId));
    await db.delete(websiteMediaTable).where(eq(websiteMediaTable.businessId, businessId));
    await db.delete(businessesTable).where(eq(businessesTable.id, businessId));
  }
  await Promise.allSettled(uploadedObjectPaths.filter(Boolean).map(path => objectStorage.deleteObject(path)));
  if (sessionCreated) await db.delete(sessionsTable).where(eq(sessionsTable.sid, SID));
}

const failed = results.filter(result => !result.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) process.exitCode = 1;
