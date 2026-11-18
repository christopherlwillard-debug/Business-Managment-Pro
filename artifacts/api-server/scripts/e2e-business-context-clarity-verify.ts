/* Read-only authenticated checks for the approved Phase 3B business-context wording. */
import { createTestLoginProof, deleteSession, SESSION_COOKIE } from "../src/lib/auth";
import { launchBrowser } from "../src/lib/launchBrowser";

const BASE = process.env.BUILDPRO_E2E_BASE_URL ?? "http://localhost:80";
const url = new URL(BASE);
if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT
  || url.protocol !== "http:"
  || !["localhost", "127.0.0.1", "::1"].includes(url.hostname.replace(/^\[|\]$/g, ""))) {
  throw new Error(`Refusing business-context verification against non-local target ${url.origin}`);
}

const results: Array<{ name: string; pass: boolean; detail?: string }> = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const browser = await launchBrowser();
  let sessionId: string | undefined;
  const writes: string[] = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1365, height: 900 });
    await page.setRequestInterception(true);
    page.on("request", request => {
      if (["GET", "HEAD", "OPTIONS"].includes(request.method().toUpperCase())) {
        void request.continue();
      } else {
        writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
        void request.abort("blockedbyclient");
      }
    });

    const returnTo = "/";
    const proof = createTestLoginProof(returnTo);
    await page.goto(`${BASE}/api/dev-test-login?${new URLSearchParams({ returnTo, ...proof })}`, {
      waitUntil: "networkidle2",
      timeout: 60_000,
    });
    sessionId = (await page.cookies()).find(cookie => cookie.name === SESSION_COOKIE)?.value;
    if (!sessionId) throw new Error("Development test login did not create a session");
    await page.goto(`${BASE}/`, { waitUntil: "networkidle2", timeout: 60_000 });
    await page.waitForSelector('[data-testid="business-select-all"]', { timeout: 30_000 });

    const selectorCopy = await page.evaluate(() => ({
      heading: document.querySelector("h1")?.textContent?.trim() ?? "",
      subtitle: document.querySelector("h1")?.parentElement?.querySelector("p")?.textContent?.trim() ?? "",
      allBusinessesDescription: Array.from(document.querySelectorAll("button"))
        .find(button => button.dataset.testid === "business-select-all")
        ?.querySelector("p.text-sm")?.textContent?.trim() ?? "",
    }));
    record(
      "Selector uses the approved heading, subtitle, and All Businesses description",
      selectorCopy.heading === "Choose a business"
        && selectorCopy.subtitle === "Choose one business to work in, or view combined information across businesses."
        && selectorCopy.allBusinessesDescription === "View combined information across businesses. Read-only.",
      JSON.stringify(selectorCopy),
    );

    await page.click('[data-testid="business-select-all"]');
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="business-context-desktop"]')?.getAttribute("aria-label") === "All Businesses, read-only",
    { timeout: 30_000 });
    const allContext = await page.$eval('[data-testid="business-context-desktop"]', element => ({
      name: element.getAttribute("aria-label"),
      text: element.textContent?.replace(/\s+/g, " ").trim() ?? "",
    }));
    record(
      "Desktop combined context is visibly read-only and accessible",
      allContext.name === "All Businesses, read-only" && allContext.text.includes("All Businesses") && allContext.text.includes("Read-only"),
      JSON.stringify(allContext),
    );
    const allMode = await page.evaluate(() => localStorage.getItem("buildpro_selection_mode"));
    record("All Businesses selection persists in the existing setting", allMode === "all", allMode ?? "missing");

    await page.click('[data-testid="business-context-desktop"]');
    await page.waitForSelector('[data-testid="business-select-all"]', { timeout: 30_000 });
    const business = await page.evaluate(async () => {
      const response = await fetch("/api/businesses", { credentials: "include" });
      const businesses = await response.json();
      return businesses[0] ?? null;
    });
    if (!business) throw new Error("No existing business was returned for the selection check");
    await page.click(`[data-testid="business-select-${business.id}"]`);
    await page.waitForFunction(name =>
      document.querySelector('[data-testid="business-context-desktop"]')?.getAttribute("aria-label") === name,
    { timeout: 30_000 }, business.name);
    const selectedContext = await page.$eval('[data-testid="business-context-desktop"]', element => ({
      name: element.getAttribute("aria-label"),
      text: element.textContent?.replace(/\s+/g, " ").trim() ?? "",
    }));
    record(
      "Individual selection keeps its existing business name without a read-only badge",
      selectedContext.name === business.name
        && selectedContext.text.includes(business.name)
        && !selectedContext.text.includes("Read-only"),
      JSON.stringify(selectedContext),
    );
    const selectedMode = await page.evaluate(() => localStorage.getItem("buildpro_selection_mode"));
    record("Individual business selection persists using its existing ID", selectedMode === String(business.id), selectedMode ?? "missing");
    await page.reload({ waitUntil: "networkidle2", timeout: 60_000 });
    await page.waitForFunction(name =>
      document.querySelector('[data-testid="business-context-desktop"]')?.getAttribute("aria-label") === name,
    { timeout: 30_000 }, business.name);
    record("Individual business context remains selected after reload", true, business.name);

    await page.click('[data-testid="business-context-desktop"]');
    await page.waitForSelector('[data-testid="business-select-all"]', { timeout: 30_000 });
    await page.click('[data-testid="business-select-all"]');
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="business-context-desktop"]')?.getAttribute("aria-label") === "All Businesses, read-only",
    { timeout: 30_000 });
    const jobsLink = await page.$('a[href="/jobs"]');
    if (!jobsLink) throw new Error("Jobs navigation link was not found");
    await jobsLink.click();
    await page.waitForFunction(() => location.pathname === "/jobs", { timeout: 30_000 });
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="business-context-desktop"]')?.getAttribute("aria-label") === "All Businesses, read-only",
    { timeout: 30_000 });
    record("All Businesses context remains clear after in-app navigation", true);

    await page.setViewport({ width: 390, height: 844 });
    await page.waitForFunction(() => {
      const element = document.querySelector('[data-testid="business-context-mobile"]');
      return Boolean(element && element.getClientRects().length);
    }, { timeout: 20_000 });
    const mobileContext = await page.$eval('[data-testid="business-context-mobile"]', element => ({
      name: element.getAttribute("aria-label"),
      text: element.textContent?.replace(/\s+/g, " ").trim() ?? "",
    }));
    record(
      "Mobile combined context is visibly read-only and accessible",
      mobileContext.name === "All Businesses, read-only"
        && mobileContext.text.includes("All Businesses")
        && mobileContext.text.includes("Read-only"),
      JSON.stringify(mobileContext),
    );
    await page.screenshot({ path: "/tmp/e2e-business-context-clarity-mobile.png" });

    await page.click('[data-testid="business-context-mobile"]');
    await page.waitForSelector('[data-testid="business-select-all"]', { timeout: 30_000 });
    await page.click('[data-testid="business-select-all"]');
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="business-context-mobile"]')?.getAttribute("aria-label") === "All Businesses, read-only",
    { timeout: 30_000 });
    await page.reload({ waitUntil: "networkidle2", timeout: 60_000 });
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="business-context-mobile"]')?.getAttribute("aria-label") === "All Businesses, read-only",
    { timeout: 30_000 });
    record("Mobile All Businesses context persists after switching and reload", true);

    record("Authenticated check made no writes", writes.length === 0, writes.join("; "));
  } finally {
    if (sessionId) await deleteSession(sessionId).catch(() => undefined);
    await browser.close();
  }
  const failed = results.filter(result => !result.pass);
  console.log(`\n${results.length - failed.length}/${results.length} business-context checks passed.`);
  if (failed.length) process.exitCode = 1;
}

main().catch(error => {
  console.error("Business-context verification failed:", error);
  process.exit(1);
});
