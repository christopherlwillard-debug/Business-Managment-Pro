/* Read-only authenticated checks for retained owner routes and job navigation. */
import fs from "node:fs";
import { createTestLoginProof, deleteSession, SESSION_COOKIE } from "../src/lib/auth";
import { launchBrowser } from "../src/lib/launchBrowser";

const BASE = process.env.BUILDPRO_E2E_BASE_URL ?? "http://localhost:80";
const SHOTS = "/tmp/e2e-mfh-app-navigation";
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
  fs.mkdirSync(SHOTS, { recursive: true });
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
    record("Retired Knowledge Base is absent from navigation",
      !sidebar.some(item => /Home Knowledge Base|Knowledge Base/i.test(item.text)),
      sidebar.map(item => item.text).filter(Boolean).join(" | "));
    const desktopGroups = await page.evaluate(() => Array.from(
      document.querySelectorAll("div.fixed.inset-y-0.left-0 p"),
    ).map(node => node.textContent?.trim() ?? ""));
    const expectedGroups = ["Home", "Work", "People", "Money", "Tools", "Manage"];
    record("Desktop navigation shows the six approved groups in order",
      expectedGroups.every((group, index) => desktopGroups[index] === group),
      desktopGroups.join(" | "));

    const trimOutLink = sidebar.find(item => item.href === "/trim-out-catalog");
    if (trimOutLink) {
      await page.click('a[href="/trim-out-catalog"]');
      await page.waitForFunction(() => location.pathname === "/trim-out-catalog", { timeout: 20_000 });
      const trimOutText = await page.evaluate(() => document.body.innerText);
      record("Trim-Out Catalog opens from the sidebar", trimOutText.includes("Trim-Out Catalog"));
    } else record("Trim-Out Catalog opens from the sidebar", false, "sidebar link not found");

    await page.goto(`${BASE}/mfh-homes`, { waitUntil: "networkidle2", timeout: 60_000 });
    const knowledgeText = await page.evaluate(() => document.body.innerText);
    record("Retired Knowledge Base route no longer exposes its interface",
      !/Home Knowledge Base|Observed Production History|Knowledge Center/i.test(knowledgeText),
      knowledgeText.slice(0, 180).replace(/\n/g, " | "));

    await page.setViewport({ width: 390, height: 844 });
    await page.goto(`${BASE}/jobs`, { waitUntil: "networkidle2", timeout: 60_000 });
    const mobileItems = await page.evaluate(() => {
      const nav = document.querySelector("nav.fixed.bottom-0");
      return Array.from(nav?.querySelectorAll("a, button") ?? [])
        .map(node => node.textContent?.trim() ?? "");
    });
    const expectedMobileItems = ["Home", "Jobs", "Routes", "Accounting", "More"];
    record("Owner mobile navigation remains exactly five items",
      JSON.stringify(mobileItems) === JSON.stringify(expectedMobileItems),
      mobileItems.join(" | "));
    await page.evaluate(() => {
      const nav = document.querySelector("nav.fixed.bottom-0");
      const more = Array.from(nav?.querySelectorAll("button") ?? [])
        .find(button => button.textContent?.trim() === "More") as HTMLButtonElement | undefined;
      more?.click();
    });
    await page.waitForFunction(() => {
      const drawer = Array.from(document.querySelectorAll("div.fixed.inset-y-0.left-0"))
        .find(node => node.className.includes("bg-primary"));
      const left = drawer?.getBoundingClientRect().left;
      return Boolean(drawer?.classList.contains("translate-x-0") && left !== undefined && left >= -1);
    }, { timeout: 20_000 });
    const drawer = await page.evaluate(() => {
      const node = Array.from(document.querySelectorAll("div.fixed.inset-y-0.left-0"))
        .find(element => element.className.includes("bg-primary"));
      const rect = node?.getBoundingClientRect();
      return {
        isOpen: Boolean(node?.classList.contains("translate-x-0")),
        text: node?.textContent ?? "",
        width: rect?.width ?? 0,
        left: rect?.left ?? 0,
        right: rect?.right ?? 0,
        viewportWidth: window.innerWidth,
        scrollX: window.scrollX,
      };
    });
    record("Mobile More drawer shows all approved groups",
      drawer.isOpen && drawer.width >= 240 && expectedGroups.every(group => drawer.text.includes(group)),
      drawer.isOpen
        ? `width=${drawer.width}/${drawer.viewportWidth}; ${
          expectedGroups.filter(group => !drawer.text.includes(group)).join(", ") || "all groups present"
        }`
        : "drawer did not open");
    record("Mobile More drawer fits within the viewport",
      drawer.left >= -1 && drawer.right <= drawer.viewportWidth + 1,
      `left=${drawer.left}; right=${drawer.right}; viewport=${drawer.viewportWidth}; scrollX=${drawer.scrollX}`);
    await page.screenshot({ path: `${SHOTS}/mobile-more-drawer.png` });
    await page.mouse.move(100, 600);
    await page.mouse.wheel({ deltaY: 1_000 });
    const lowerGroupsVisible = await page.waitForFunction(() => {
      const node = Array.from(document.querySelectorAll("div.fixed.inset-y-0.left-0"))
        .find(element => element.className.includes("bg-primary"));
      const drawerRect = node?.getBoundingClientRect();
      if (!node || !drawerRect) return false;
      const labels = Array.from(node.querySelectorAll("p"))
        .filter(element => ["Tools", "Manage"].includes(element.textContent?.trim() ?? ""));
      return labels.length === 2 && labels.every(element => {
        const rect = element.getBoundingClientRect();
        return rect.top >= drawerRect.top && rect.bottom <= drawerRect.bottom;
      });
    }, { timeout: 8_000 }).then(() => true).catch(() => false);
    record("Mobile drawer scroll exposes Tools and Manage groups", lowerGroupsVisible);
    await page.screenshot({ path: `${SHOTS}/mobile-more-drawer-lower.png` });

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
