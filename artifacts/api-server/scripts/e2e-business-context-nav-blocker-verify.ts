/* Authenticated development-only regression check for business switching with unsaved Website Editor changes. */
import { createTestLoginProof, deleteSession, SESSION_COOKIE } from "../src/lib/auth";
import { launchBrowser } from "../src/lib/launchBrowser";

const BASE = process.env.BUILDPRO_E2E_BASE_URL ?? "http://localhost:80";
const url = new URL(BASE);
if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT
  || url.protocol !== "http:"
  || !["localhost", "127.0.0.1", "::1"].includes(url.hostname.replace(/^\[|\]$/g, ""))) {
  throw new Error(`Refusing navigation-blocker verification against non-local target ${url.origin}`);
}

async function main() {
  const browser = await launchBrowser();
  let sessionId: string | undefined;
  const blockedWrites: string[] = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1365, height: 900 });
    await page.setRequestInterception(true);
    page.on("request", request => {
      if (["GET", "HEAD", "OPTIONS"].includes(request.method().toUpperCase())) {
        void request.continue();
      } else {
        blockedWrites.push(`${request.method()} ${new URL(request.url()).pathname}`);
        void request.abort("blockedbyclient");
      }
    });
    const clickButtonWithText = async (text: string) => {
      const clicked = await page.evaluate(label => {
        const button = Array.from(document.querySelectorAll("button"))
          .find(element => element.textContent?.trim() === label) as HTMLButtonElement | undefined;
        button?.click();
        return Boolean(button);
      }, text);
      if (!clicked) throw new Error(`Could not find button "${text}"`);
    };

    const returnTo = "/";
    const proof = createTestLoginProof(returnTo);
    await page.goto(`${BASE}/api/dev-test-login?${new URLSearchParams({ returnTo, ...proof })}`, {
      waitUntil: "networkidle2",
      timeout: 60_000,
    });
    sessionId = (await page.cookies()).find(cookie => cookie.name === SESSION_COOKIE)?.value;
    if (!sessionId) throw new Error("Development test login did not create a session");
    await page.goto(`${BASE}/`, { waitUntil: "networkidle2", timeout: 60_000 });

    const business = await page.evaluate(async () => {
      const response = await fetch("/api/businesses", { credentials: "include" });
      const businesses = await response.json();
      return businesses.find((candidate: { slug: string }) => candidate.slug === "general_contracting") ?? businesses[0] ?? null;
    });
    if (!business) throw new Error("No existing business was available for the verification");
    await page.click(`[data-testid="business-select-${business.id}"]`);
    await page.goto(`${BASE}/website`, { waitUntil: "networkidle2", timeout: 60_000 });
    await page.waitForFunction(() =>
      document.querySelector("main")?.innerText.includes("Save Draft")
      && document.querySelector("main [data-inline-editable]"),
    { timeout: 60_000 });

    const editTarget = await page.$$eval("[data-inline-editable]", elements => {
      const element = elements.find(candidate => (candidate.textContent?.trim().length ?? 0) > 3);
      return element ? {
        id: element.getAttribute("data-inline-editable"),
        text: element.textContent?.trim() ?? "",
      } : null;
    });
    if (!editTarget?.id) throw new Error("Could not find editable text for the temporary browser-only change");
    const editTargetId = editTarget.id;

    const target = await page.$(`[data-inline-editable="${editTargetId}"]`);
    if (!target) throw new Error("The sample tagline disappeared before editing");
    await target.click({ clickCount: 2, delay: 80 });
    await page.waitForSelector(`[contenteditable="true"][data-inline-editable="${editTargetId}"]`, { timeout: 15_000 });
    const originalText = await page.$eval(`[data-inline-editable="${editTargetId}"]`, element => element.textContent ?? "");
    await page.keyboard.press("End");
    await page.keyboard.type(" [temporary blocker check]");
    await page.keyboard.press("Tab");
    await page.waitForFunction(id => {
      const element = document.querySelector(`[data-inline-editable="${id}"]`);
      return element?.textContent?.includes("[temporary blocker check]") ?? false;
    }, { timeout: 15_000 }, editTargetId);
    const editedText = await page.$eval(`[data-inline-editable="${editTargetId}"]`, element => element.textContent ?? "");
    if (!editedText.includes("[temporary blocker check]")) throw new Error("The temporary editor change did not remain in the browser");

    await page.click('[data-testid="business-context-desktop"]');
    await page.waitForFunction(() => document.body.innerText.includes("Unsaved changes"), { timeout: 15_000 });
    const businessBeforeCancel = await page.$eval('[data-testid="business-context-desktop"]', element => element.getAttribute("aria-label"));
    await clickButtonWithText("Stay and keep editing");
    await page.waitForFunction(() => !document.body.innerText.includes("Unsaved changes"), { timeout: 15_000 });
    const cancelState = await page.evaluate(id => ({
      route: location.pathname,
      text: document.querySelector(`[data-inline-editable="${id}"]`)?.textContent ?? "",
      editorOpen: Boolean(document.querySelector("main [data-inline-editable]")),
      context: document.querySelector('[data-testid="business-context-desktop"]')?.getAttribute("aria-label"),
    }), editTargetId);
    const cancelPreserved = cancelState.route === "/website"
      && cancelState.editorOpen
      && cancelState.text === editedText
      && cancelState.context === businessBeforeCancel
      && businessBeforeCancel === business.name;

    await page.click('[data-testid="business-context-desktop"]');
    await page.waitForFunction(() => document.body.innerText.includes("Unsaved changes"), { timeout: 15_000 });
    await clickButtonWithText("Leave and discard");
    await page.waitForSelector('[data-testid="business-select-all"]', { timeout: 30_000 });
    await page.click('[data-testid="business-select-all"]');
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="business-context-desktop"]')?.getAttribute("aria-label") === "All Businesses, read-only",
    { timeout: 30_000 });

    console.log(JSON.stringify({
      blockerAppeared: true,
      cancelPreservedUnsavedChange: cancelPreserved,
      originalBusinessStayedSelectedAfterCancel: cancelState.context === business.name,
      editorStayedOpenAfterCancel: cancelState.editorOpen && cancelState.route === "/website",
      switchWorkedAfterDiscard: await page.$eval('[data-testid="business-context-desktop"]', element => element.getAttribute("aria-label")) === "All Businesses, read-only",
      noWritesReachedServer: true,
      blockedWriteAttempts: blockedWrites,
      originalSampleText: originalText,
      temporaryEditedText: editedText,
    }, null, 2));

    if (!cancelPreserved || blockedWrites.some(path => !path.startsWith("PUT /api/website"))) {
      process.exitCode = 1;
    }
  } finally {
    if (sessionId) await deleteSession(sessionId).catch(() => undefined);
    await browser.close();
  }
}

main().catch(error => {
  console.error("Navigation-blocker verification failed:", error);
  process.exit(1);
});
