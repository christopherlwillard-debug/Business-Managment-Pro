/* Authenticated browser regression check for the Phase 4.1 Ready to Start flow.
 *
 * The schedule and ready-to-start reads are served as in-memory fixtures. The
 * only browser write allowed is the start mutation under test; all other writes
 * are denied by default.
 */
import type { HTTPRequest } from "puppeteer";
import { createTestLoginProof, deleteSession, SESSION_COOKIE } from "../src/lib/auth";
import { launchBrowser } from "../src/lib/launchBrowser";

const BASE = process.env.BUILDPRO_E2E_BASE_URL ?? "http://localhost:80";
const READY_JOB_ID = 9401;
const WAITING_JOB_ID = 9402;
const READY_JOB_TITLE = "Ready to Start Browser Fixture";
const WAITING_JOB_TITLE = "Waiting Browser Fixture";
const START_DATE = "2026-09-12";

if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
  throw new Error("Refusing to run Ready to Start verification against a production deployment");
}

const baseUrl = new URL(BASE);
const baseHostname = baseUrl.hostname.replace(/^\[|\]$/g, "");
if (baseUrl.protocol !== "http:" || !["localhost", "127.0.0.1", "::1"].includes(baseHostname)) {
  throw new Error(`Refusing to run Ready to Start verification against non-local target ${baseUrl.origin}`);
}

const blockedWrites: string[] = [];
const allowedStartWrites: { method: string; url: string; body: Record<string, unknown> }[] = [];
const results: { name: string; pass: boolean; detail?: string }[] = [];
let started = false;

function recordResult(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
}

function activeScheduleFixture() {
  return {
    from: "2026-09-07",
    to: "2026-09-13",
    jobs: [{
      id: READY_JOB_ID,
      title: READY_JOB_TITLE,
      status: "in_progress",
      startDate: started ? START_DATE : null,
      endDate: "2026-09-20",
      planningState: started ? "scheduled" : "ready",
      priority: "normal",
      resourceDemand: "standard",
      queuePosition: null,
      checklistItems: [],
      unscheduledChecklistItems: [],
    }],
  };
}

function readyToStartFixture() {
  if (started) return { readyJobs: [], waitingJobs: [] };
  return {
    readyJobs: [{
      id: READY_JOB_ID,
      title: READY_JOB_TITLE,
      status: "scheduled",
      startDate: null,
      endDate: "2026-09-20",
      planningState: "ready",
      notes: null,
      productionComponents: [{
        componentInstanceKey: "siding:1",
        componentLabel: "Siding",
        variant: null,
      }],
      activeReadinessCondition: null,
    }],
    waitingJobs: [{
      id: WAITING_JOB_ID,
      title: WAITING_JOB_TITLE,
      status: "scheduled",
      startDate: null,
      endDate: null,
      planningState: "waiting",
      notes: null,
      productionComponents: [{
        componentInstanceKey: "plumbing:1",
        componentLabel: "Plumbing",
        variant: null,
      }],
      activeReadinessCondition: {
        id: 94021,
        jobId: WAITING_JOB_ID,
        businessId: 1,
        reason: "materials",
        detail: "Waiting for rough-in materials",
        expectedDate: START_DATE,
        clearedAt: null,
      },
    }],
  };
}

async function main() {
  const browser = await launchBrowser();
  let sessionId: string | undefined;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1200 });
    await page.setRequestInterception(true);
    page.on("request", (request: HTTPRequest) => {
      const url = request.url();
      const method = request.method().toUpperCase();

      if (url.includes("/api/jobs/schedule-overview?")) {
        void request.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(activeScheduleFixture()),
        });
        return;
      }
      if (url.includes("/api/jobs/ready-to-start")) {
        void request.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(readyToStartFixture()),
        });
        return;
      }
      if (url.includes("/api/jobs/production-presence?")) {
        void request.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ jobs: [] }),
        });
        return;
      }
      if (method === "POST" && url.endsWith(`/api/jobs/${READY_JOB_ID}/start`)) {
        const body = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
        allowedStartWrites.push({ method, url, body });
        started = body.startDate === START_DATE;
        void request.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: READY_JOB_ID,
            title: READY_JOB_TITLE,
            status: "scheduled",
            startDate: START_DATE,
            endDate: "2026-09-20",
            planningState: "scheduled",
          }),
        });
        return;
      }
      if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
        void request.continue();
        return;
      }
      blockedWrites.push(`${method} ${url}`);
      void request.abort("blockedbyclient");
    });

    const returnTo = "/jobs";
    const proof = createTestLoginProof(returnTo);
    const loginParams = new URLSearchParams({ returnTo, ...proof });
    await page.goto(`${BASE}/api/dev-test-login?${loginParams}`, { waitUntil: "networkidle2", timeout: 60_000 });
    sessionId = (await page.cookies()).find(cookie => cookie.name === SESSION_COOKIE)?.value;
    if (!sessionId) throw new Error("Development login did not create a session cookie");

    await page.goto(`${BASE}/jobs`, { waitUntil: "networkidle2", timeout: 60_000 });
    const area = '[data-testid="planner-ready-to-start"]';
    await page.waitForSelector(area, { timeout: 20_000 });
    recordResult("Ready to Start area is visible", await page.$(area) !== null);
    recordResult(
      "Ready job shows its production component",
      await page.$eval(
        area,
        (element, title) => element.textContent?.includes(title) === true && element.textContent?.includes("Siding") === true,
        READY_JOB_TITLE,
      ),
    );
    recordResult(
      "Waiting job shows dependency detail without a start action",
      await page.$eval(
        area,
        (element, title) => element.textContent?.includes(title) === true && element.textContent?.includes("Waiting for rough-in materials") === true,
        WAITING_JOB_TITLE,
      ) &&
        await page.$(`[data-testid="start-job-${WAITING_JOB_ID}"]`) === null,
    );

    await page.click(`[data-testid="start-job-${READY_JOB_ID}"]`);
    await page.waitForSelector('[data-testid="start-job-dialog"]', { timeout: 20_000 });
    const specificDateMode = (await page.$$('input[name="start-date-mode"]'))[1];
    await specificDateMode.click();
    const dateInput = await page.$('input[aria-label="Specific actual start date"]');
    if (!dateInput) throw new Error("Specific date input did not appear");
    await dateInput.evaluate((element, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }, START_DATE);
    recordResult("Specific date input accepts the selected date", await dateInput.evaluate((element, value) => (element as HTMLInputElement).value === value, START_DATE));
    await page.click('[data-testid="confirm-start-job"]');
    await page.waitForSelector('[data-testid="start-job-dialog"]', { hidden: true, timeout: 20_000 });

    recordResult(
      "Specific actual start date is sent to the start mutation",
      allowedStartWrites.length === 1 &&
        allowedStartWrites[0].body.startDate === START_DATE,
    );
    await page.waitForFunction(
      (selector, title) => document.querySelector(selector)?.textContent?.includes(title) === true,
      { timeout: 20_000 },
      area,
      "No ready jobs are waiting for a start date",
    );
    recordResult("Started job leaves the Ready to Start list", !(await page.$(`[data-testid="start-job-${READY_JOB_ID}"]`)));
    recordResult("Start flow did not write presence or unrelated data", blockedWrites.length === 0, blockedWrites.join("; "));
  } finally {
    await browser.close();
    if (sessionId) await deleteSession(sessionId).catch(() => undefined);
  }

  const failures = results.filter(result => !result.pass);
  if (failures.length > 0) {
    console.error(`Ready to Start browser verification failed: ${failures.length} check(s)`);
    process.exit(1);
  }
  console.log(`Ready to Start browser verification passed: ${results.length} checks`);
}

await main();