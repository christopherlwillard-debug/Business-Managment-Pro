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
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1050 });
  await page.setCookie({ name: "sid", value: SID, url: BASE, path: "/" });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle2", timeout: 60_000 });
  await page.waitForSelector(`[data-testid="business-select-${business.id}"]`, { timeout: 20_000 });
  await page.click(`[data-testid="business-select-${business.id}"]`);
  await new Promise(resolve => setTimeout(resolve, 500));
  await page.goto(`${BASE}/website`, { waitUntil: "networkidle2", timeout: 60_000 });
  await page.waitForFunction(() => !document.body.innerText.toLowerCase().includes("loading website"), { timeout: 30_000 }).catch(() => undefined);
  await new Promise(resolve => setTimeout(resolve, 1000));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01-editor-initial.png"), fullPage: false });

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
    observations,
    screenshot: "generated-artifacts/website-studio-visual/01-editor-initial.png",
  }, null, 2));
} finally {
  await browser?.close();
  if (sessionCreated) await db.delete(sessionsTable).where(eq(sessionsTable.sid, SID));
}
