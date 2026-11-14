/* Read-only authenticated checks for retained owner routes and job navigation. */
import { createTestLoginProof, deleteSession, SESSION_COOKIE } from "../src/lib/auth";
import { launchBrowser } from "../src/lib/launchBrowser";

const BASE = process.env.BUILDPRO_E2E_BASE_URL ?? "http://localhost:80";
const url = new URL(BASE);
if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT
  || url.protocol !== "http:"
  || !["localhost", "127.0.0.1", "::1"].includes(url.hostname.replace(/^\[|\]$/g, ""))) {
  throw new Error(`Refusing navigation verification against non-local target ${url.origin}`);
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
      if (["GET", "HEAD", "OPTIONS"].includes(request.method().toUpperCase())) void request.continue();
      else {
        writes.push(`${request.method()} ${request.url()}`);
        void request.abort("blockedbyclient");
      }
    });

    const returnTo = "/jobs";
    const proof = createTestLoginProof(returnTo);
    const loginParams = new URLSearchParams({ returnTo, ...proof });
    await page.goto(`${BASE}/api/dev-test-login?${loginParams}`, { waitUntil: "networkidle2", timeout: 60_000 });
    sessionId = (await page.cookies()).find(cookie => cookie.name === SESSION_COOKIE)?.value;
    if (!sessionId) throw new Error("Development test login did not create a session");

    await page.goto(`${BASE}/jobs`, { waitUntil: "networkidle2", timeout: 60_000 });
    await page.waitForFunction(() => document.body.innerText.includes("Jobs"), { timeout: 20_000 });
    const sidebar = await page.evaluate(() => Array.from(document.querySelectorAll("nav a, aside a"))
      .map(anchor => ({ text: anchor.textContent?.trim() ?? "", href: anchor.getAttribute("href") ?? "" })));
    record("Home Knowledge Base is absent from the sidebar",
      !sidebar.some(item => /Home Knowledge Base/i.test(item.text)),
      sidebar.map(item => item.text).filter(Boolean).join(" | "));

    const trimOutLink = sidebar.find(item => item.href === "/trim-out-catalog");
    if (trimOutLink) {
      await page.click('a[href="/trim-out-catalog"]');
      await page.waitForFunction(() => location.pathname === "/trim-out-catalog", { timeout: 20_000 });
      const trimOutText = await page.evaluate(() => document.body.innerText);
      record("Trim-Out Catalog opens from the sidebar", trimOutText.includes("Trim-Out Catalog"));
    } else record("Trim-Out Catalog opens from the sidebar", false, "sidebar link not found");

    await page.goto(`${BASE}/mfh-homes`, { waitUntil: "networkidle2", timeout: 60_000 });
    const knowledgeText = await page.evaluate(() => document.body.innerText);
    record("Owner-only Home Knowledge Base route remains accessible",
      knowledgeText.includes("Home Knowledge Base"), knowledgeText.slice(0, 180).replace(/\n/g, " | "));

    await page.goto(`${BASE}/jobs`, { waitUntil: "networkidle2", timeout: 60_000 });
    const jobsText = await page.evaluate(() => document.body.innerText);
    record("Historical jobs list loads", /Closed Jobs|All Jobs|Jobs/i.test(jobsText), jobsText.slice(0, 220).replace(/\n/g, " | "));
    const openButton = await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll("button"))
        .find(element => /open job/i.test(element.textContent ?? ""));
      if (!button) return false;
      button.click();
      return true;
    });
    if (openButton) {
      await page.waitForFunction(() => /Photos & Documents/.test(document.body.innerText), { timeout: 20_000 }).catch(() => undefined);
      const workspaceText = await page.evaluate(() => document.body.innerText);
      record("Opened job workspace exposes Photos & Documents", workspaceText.includes("Photos & Documents"));
    } else record("Opened job workspace exposes Photos & Documents", false, "no open-job action was available");

    record("Read-only browser made no writes", writes.length === 0, writes.join("; "));
  } finally {
    if (sessionId) await deleteSession(sessionId).catch(() => undefined);
    await browser.close();
  }
  const failed = results.filter(result => !result.pass);
  console.log(`\n${results.length - failed.length}/${results.length} authenticated navigation checks passed.`);
  if (failed.length) process.exitCode = 1;
}

main().catch(error => {
  console.error("Navigation verification failed:", error);
  process.exit(1);
});
