/* Authenticated development-only visual verification of Website Studio. */
import { launchBrowser } from "../src/lib/launchBrowser";
import { db } from "@workspace/db";
import { businessesTable, sessionsTable, settingsTable, websiteConfigDraftsTable, websiteConfigsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:80";
const SCREENSHOT_DIR = path.resolve(process.cwd(), "../../generated-artifacts/website-studio-visual");
const SID = `e2e-website-visual-${crypto.randomUUID()}`;
if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
  throw new Error("Refusing to run Website Studio visual verification against production.");
}
const target = new URL(BASE);
if (target.protocol !== "http:" || !["localhost", "127.0.0.1", "::1"].includes(target.hostname)) {
  throw new Error("Website Studio visual verification requires a local development preview.");
}

const [business] = await db.select({
  id: businessesTable.id,
  slug: businessesTable.slug,
})
  .from(businessesTable)
  .innerJoin(websiteConfigsTable, eq(websiteConfigsTable.businessId, businessesTable.id))
  .where(eq(websiteConfigsTable.published, true))
  .orderBy(businessesTable.id)
  .limit(1);
if (!business) throw new Error("No published development website exists to verify.");

const [settings] = await db.select({ ownerUserId: settingsTable.ownerUserId }).from(settingsTable).limit(1);
if (!settings?.ownerUserId) throw new Error("No approved development owner exists for the visual check.");
const [draftBefore] = await db.select().from(websiteConfigDraftsTable)
  .where(eq(websiteConfigDraftsTable.businessId, business.id)).limit(1);
if (!draftBefore) throw new Error("The development website draft was not initialized by the Phase B migration.");

await fs.promises.mkdir(SCREENSHOT_DIR, { recursive: true });
let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
let page: any;
let publicBaseline: any;
let sessionCreated = false;
try {
  await db.insert(sessionsTable).values({
    sid: SID,
    sess: {
      user: { id: settings.ownerUserId, email: "e2e-website-visual@example.invalid", firstName: "Website", lastName: "Reviewer", profileImageUrl: null },
      access_token: "dummy",
      expires_at: Math.floor(Date.now() / 1000) + 86_400,
    },
    expire: new Date(Date.now() + 86_400_000),
  });
  sessionCreated = true;

  browser = await launchBrowser();
  page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1050 });
  await page.setCookie({ name: "sid", value: SID, url: BASE, path: "/" });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle2", timeout: 60_000 });
  await page.waitForSelector(`[data-testid="business-select-${business.id}"]`, { timeout: 20_000 });
  await page.click(`[data-testid="business-select-${business.id}"]`);
  await new Promise(resolve => setTimeout(resolve, 500));
  await page.goto(`${BASE}/website`, { waitUntil: "networkidle2", timeout: 60_000 });
  await page.waitForFunction(() => !document.body.innerText.toLowerCase().includes("loading website"), { timeout: 30_000 }).catch(() => undefined);
  await new Promise(resolve => setTimeout(resolve, 1000));
  const publicBefore = await page.evaluate(async slug => {
    const response = await fetch(`/api/public/site/${slug}`, { credentials: "omit" });
    if (!response.ok) throw new Error(`Public website request failed: ${response.status}`);
    return response.json();
  }, business.slug);
  publicBaseline = publicBefore;
  const originalHeadline = publicBefore.sections?.find((section: any) => section.type === "hero")?.content?.headline;
  if (!originalHeadline) throw new Error("Could not find editable website headline.");
  await page.evaluate(async ({ businessId, config }: any) => {
    const current = await fetch(`/api/website?businessId=${businessId}`, { credentials: "include" });
    if (!current.ok) throw new Error("Could not read the saved development draft.");
    const currentDraft = await current.json();
    const restored = await fetch(`/api/website?businessId=${businessId}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sections: config.sections,
        settings: config.settings,
        expectedDraftRevision: currentDraft.draftRevision,
      }),
    });
    if (!restored.ok) throw new Error("Could not reset the development draft to its published baseline.");
  }, { businessId: business.id, config: publicBefore });
  await page.reload({ waitUntil: "networkidle2", timeout: 60_000 });
  await new Promise(resolve => setTimeout(resolve, 800));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01-editor-initial.png"), fullPage: false });

  const clickButton = async (label: string) => page.evaluate(text => {
    const button = Array.from(document.querySelectorAll("button"))
      .find(el => el.innerText.trim() === text);
    if (!button) throw new Error(`Could not find ${text} button.`);
    (button as HTMLButtonElement).click();
  }, label);
  await clickButton("Media");
  await new Promise(resolve => setTimeout(resolve, 900));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "02-media-library.png"), fullPage: false });
  const mediaView = await page.evaluate(() => ({
    visibleText: document.body.innerText.slice(-2500),
    imageCount: Array.from(document.querySelectorAll("img")).filter(image => image.getBoundingClientRect().width > 0).length,
    hasSearch: !!Array.from(document.querySelectorAll("input")).find(input => /search/i.test(input.placeholder)),
  }));
  await clickButton("Editor");
  await new Promise(resolve => setTimeout(resolve, 500));

  await page.evaluate(() => {
    const layer = Array.from(document.querySelectorAll("button"))
      .find(el => el.innerText.includes("Hero Banner"));
    (layer as HTMLButtonElement | undefined)?.click();
  });
  await new Promise(resolve => setTimeout(resolve, 400));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "03-editor-properties.png"), fullPage: false });
  await page.click('[data-inline-editable]', { clickCount: 2 });
  await page.waitForSelector('[contenteditable="true"][data-inline-editable]', { timeout: 5000 });
  await page.keyboard.down("Control");
  await page.keyboard.press("A");
  await page.keyboard.up("Control");
  const testHeadline = `${originalHeadline} — PRIVATE DRAFT CHECK`;
  await page.keyboard.type(testHeadline);
  await page.keyboard.press("Tab");
  await new Promise(resolve => setTimeout(resolve, 1000));
  await clickButton("Save Draft");
  await new Promise(resolve => setTimeout(resolve, 900));
  const savedDraft = await page.evaluate(async businessId => {
    const response = await fetch(`/api/website?businessId=${businessId}`, { credentials: "include" });
    if (!response.ok) throw new Error(`Draft request failed: ${response.status}`);
    return response.json();
  }, business.id);
  const savedDraftHeadline = savedDraft.sections?.find((section: any) => section.type === "hero")?.content?.headline;
  if (savedDraftHeadline !== testHeadline) throw new Error("The harmless test edit did not save as a draft.");

  await clickButton("Preview");
  await new Promise(resolve => setTimeout(resolve, 700));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "04-draft-preview.png"), fullPage: false });
  const previewShowsTest = await page.evaluate(text => document.body.innerText.includes(text), testHeadline);
  const publicDuringDraft = await page.evaluate(async slug => {
    const response = await fetch(`/api/public/site/${slug}`, { credentials: "omit" });
    if (!response.ok) throw new Error(`Public website request failed: ${response.status}`);
    return response.json();
  }, business.slug);
  const publicStillPublished = JSON.stringify(publicDuringDraft.sections) === JSON.stringify(publicBefore.sections)
    && JSON.stringify(publicDuringDraft.settings) === JSON.stringify(publicBefore.settings);

  const restoredDraft = await page.evaluate(async ({ businessId, config, expectedDraftRevision }: any) => {
    const response = await fetch(`/api/website?businessId=${businessId}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sections: config.sections,
        settings: config.settings,
        expectedDraftRevision,
      }),
    });
    if (!response.ok) throw new Error("Could not restore the published content as the private draft.");
    return response.json();
  }, {
    businessId: business.id,
    config: publicBefore,
    expectedDraftRevision: savedDraft.draftRevision,
  });
  const restoredHeadline = restoredDraft.sections?.find((section: any) => section.type === "hero")?.content?.headline;
  if (restoredHeadline !== originalHeadline || JSON.stringify(publicDuringDraft.sections) !== JSON.stringify(publicBefore.sections)) {
    throw new Error("Test edit restoration or public-site isolation verification failed.");
  }
  await page.reload({ waitUntil: "networkidle2", timeout: 60_000 });
  await new Promise(resolve => setTimeout(resolve, 800));
  const restoredInEditor = await page.evaluate(() => ({
    headline: document.querySelector("h1")?.textContent?.trim() ?? "",
    testMarkerPresent: document.body.innerText.includes("PRIVATE DRAFT CHECK"),
  }));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "05-editor-restored.png"), fullPage: false });
  const publicPage = await browser.newPage();
  await publicPage.setViewport({ width: 1440, height: 1050 });
  await publicPage.goto(`${BASE}/site/${business.slug}`, { waitUntil: "networkidle2", timeout: 60_000 });
  const publicRenderedHeadline = await publicPage.$eval("h1", el => el.textContent?.trim() ?? "");
  const publicPageShowsPublished = publicRenderedHeadline === originalHeadline;
  await publicPage.screenshot({ path: path.join(SCREENSHOT_DIR, "06-public-published.png"), fullPage: false });
  await publicPage.close();
  if (!publicPageShowsPublished) throw new Error("The public website did not render the published headline.");
  if (restoredInEditor.testMarkerPresent) throw new Error("The editor still displays test content after restoration.");

  const observations = await page.evaluate(() => ({
    url: location.pathname,
    title: document.title,
    headings: Array.from(document.querySelectorAll("h1,h2,h3")).map(el => el.textContent?.trim()).filter(Boolean).slice(0, 30),
    buttons: Array.from(document.querySelectorAll("button")).map(el => el.innerText.trim() || el.getAttribute("aria-label") || "").filter(Boolean).slice(0, 80),
    inputs: Array.from(document.querySelectorAll("input,textarea")).map(el => ({
      type: (el as HTMLInputElement).type,
      placeholder: (el as HTMLInputElement).placeholder,
      ariaLabel: el.getAttribute("aria-label"),
    })).slice(0, 30),
  }));
  const [draftAfterLoad] = await db.select().from(websiteConfigDraftsTable)
    .where(eq(websiteConfigDraftsTable.businessId, business.id)).limit(1);
  console.log(JSON.stringify({
    businessId: business.id,
    businessSlug: business.slug,
    draftRevisionBefore: draftBefore.revision,
    draftRevisionAfterLoad: draftAfterLoad?.revision,
    draftUnchangedOnLoad: draftBefore.revision === draftAfterLoad?.revision
      && JSON.stringify(draftBefore.sections) === JSON.stringify(draftAfterLoad?.sections)
      && JSON.stringify(draftBefore.settings) === JSON.stringify(draftAfterLoad?.settings),
    mediaView,
    draftPreviewShowedTest: previewShowsTest,
    publicStayedPublished: publicStillPublished,
    testDraftSaved: savedDraftHeadline === testHeadline,
    testEditRestored: restoredHeadline === originalHeadline,
    editorRestored: !restoredInEditor.testMarkerPresent,
    editorRestoredHeadline: restoredInEditor.headline,
    publicRenderedPublished: publicPageShowsPublished,
    observations,
    screenshots: [
      "generated-artifacts/website-studio-visual/01-editor-initial.png",
      "generated-artifacts/website-studio-visual/02-media-library.png",
      "generated-artifacts/website-studio-visual/03-editor-properties.png",
      "generated-artifacts/website-studio-visual/04-draft-preview.png",
      "generated-artifacts/website-studio-visual/05-editor-restored.png",
      "generated-artifacts/website-studio-visual/06-public-published.png",
    ],
  }, null, 2));
} finally {
  if (page && publicBaseline) {
    try {
      await page.evaluate(async ({ businessId, config }: any) => {
        const current = await fetch(`/api/website?businessId=${businessId}`, { credentials: "include" });
        if (!current.ok) return;
        const currentDraft = await current.json();
        await fetch(`/api/website?businessId=${businessId}`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sections: config.sections,
            settings: config.settings,
            expectedDraftRevision: currentDraft.draftRevision,
          }),
        });
      }, { businessId: business.id, config: publicBaseline });
    } catch (error) {
      console.error("Development draft restore check failed:", error instanceof Error ? error.message : "unknown error");
    }
  }
  await browser?.close();
  if (sessionCreated) await db.delete(sessionsTable).where(eq(sessionsTable.sid, SID));
}
