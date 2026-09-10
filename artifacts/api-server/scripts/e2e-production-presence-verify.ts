/* Authenticated browser regression check for planner and Schedule History daily presence.
 *
 * Run:
 *   pnpm --filter @workspace/api-server run verify:production-presence
 *
 * Active Schedule, Schedule History, and presence responses are served as
 * read-only in-memory fixtures. The only browser write allowed is the
 * presence PUT under test.
 */
import fs from "node:fs";
import type { HTTPRequest, Page } from "puppeteer";
import { createTestLoginProof, deleteSession, SESSION_COOKIE } from "../src/lib/auth";
import { launchBrowser } from "../src/lib/launchBrowser";

const BASE = process.env.BUILDPRO_E2E_BASE_URL ?? "http://localhost:80";
const SHOTS = "/tmp/e2e-production-presence";
const JOB_ID = 9201;
const JOB_TITLE = "Production Presence Browser Fixture";
const ALTERNATE_DATES = ["2026-07-01", "2026-07-02", "2026-07-03"];
const CHECKLIST_ONLY_JOB_ID = 9202;
const CHECKLIST_ONLY_JOB_TITLE = "Checklist-only Presence Browser Fixture";
const CHECKLIST_ONLY_ENTRY_ID = 92021;
const NOT_HERE_JOB_ID = 9203;
const UNRECORDED_JOB_ID = 9204;
const DATES = ["2026-09-01", "2026-09-02", "2026-09-03"];
const ACTIVE_DATE = (() => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
})();

if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
  throw new Error("Refusing to run Production Presence E2E verification against a production deployment");
}

const baseUrl = new URL(BASE);
const baseHostname = baseUrl.hostname.replace(/^\[|\]$/g, "");
if (baseUrl.protocol !== "http:" || !["localhost", "127.0.0.1", "::1"].includes(baseHostname)) {
  throw new Error(
    `Refusing to run Production Presence E2E verification against non-local target ${baseUrl.origin}. ` +
    "Set BUILDPRO_E2E_BASE_URL to a local development server.",
  );
}

type PresenceState = "unrecorded" | "here" | "not_here";
type PresenceReason =
  | "pulled_off"
  | "customer_delay"
  | "material_delay"
  | "weather"
  | "waiting_on_other_trade"
  | "other";

type PresenceRecord = {
  id: number;
  jobId: number;
  date: string;
  state: PresenceState;
  notHereReason: PresenceReason | null;
  notes: string | null;
  source: "manual_presence";
  provenance: "confirmed";
  createdAt: string;
  createdByUserId: string;
  createdByName: string;
  updatedAt: string;
  updatedByUserId: string;
  updatedByName: string;
};

const records = new Map<string, PresenceRecord>();
const allowedWrites: { method: string; url: string; body: Record<string, unknown> }[] = [];
const blockedWrites: string[] = [];
let nextRecordId = 1;
let failNextSave = false;
let failNextPresenceRefresh = false;
let failNextHistoryLoad = false;
let delayNextHistoryRange: string | null = null;
let failDelayedHistoryRange = false;
let remoteRefreshState: PresenceState | null = null;
let remoteRefreshDate = ACTIVE_DATE;
let presenceRefreshRequests = 0;

const results: { name: string; pass: boolean; detail?: string }[] = [];

function recordResult(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
}

function timing() {
  const hereDates = [...records.values()]
    .filter(record => record.state === "here")
    .map(record => record.date)
    .sort();
  const pausedNotHereDays = [...records.values()].filter(record => record.state === "not_here").length;
  const actualProductionDays = hereDates.length;
  const actualProductionStartDate = hereDates[0] ?? null;
  const lastWorkDate = hereDates.at(-1) ?? null;
  const calendarSpanDays = actualProductionStartDate && lastWorkDate
    ? Math.round((new Date(`${lastWorkDate}T00:00:00`).getTime() - new Date(`${actualProductionStartDate}T00:00:00`).getTime()) / 86_400_000) + 1
    : null;
  return {
    expectedDurationDays: 3,
    actualProductionStartDate,
    lastWorkDate,
    calendarSpanDays,
    actualProductionDays,
    pausedNotHereDays,
    productionDayVariance: actualProductionDays - 3,
  };
}

function snapshot() {
  return {
    jobId: JOB_ID,
    records: [...records.values()].sort((a, b) => a.date.localeCompare(b.date)),
    timing: timing(),
  };
}

function scheduleFixture(dates = DATES) {
  return {
    from: "2026-08-01",
    to: "2026-09-30",
    jobs: [{
      id: JOB_ID,
      title: JOB_TITLE,
      status: "completed",
      jobType: "general_contracting",
       startDate: dates[0],
       endDate: dates[2],
      daysOnJob: 3,
      planningState: "completed",
      priority: "normal",
      resourceDemand: "standard",
      queuePosition: null,
      checklistItems: [],
      unscheduledChecklistItems: [],
    }],
  };
}

function activeScheduleFixture() {
  const fixture = scheduleFixture();
  const job = fixture.jobs[0];
  const activeJob = {
    ...job,
    status: "in_progress",
    startDate: ACTIVE_DATE,
    endDate: ACTIVE_DATE,
  };
  return {
    from: ACTIVE_DATE,
    to: ACTIVE_DATE,
    jobs: [
      activeJob,
      { ...activeJob, id: NOT_HERE_JOB_ID, title: "Not-here Presence Browser Fixture" },
      { ...activeJob, id: UNRECORDED_JOB_ID, title: "Unrecorded Presence Browser Fixture" },
      {
        ...job,
        id: CHECKLIST_ONLY_JOB_ID,
        title: CHECKLIST_ONLY_JOB_TITLE,
        startDate: null,
        endDate: null,
        daysOnJob: 0,
        checklistItems: [{
          id: CHECKLIST_ONLY_ENTRY_ID,
          title: "Checklist-only scheduled work",
          completed: false,
          skipped: false,
          scheduledDate: ACTIVE_DATE,
          assignedSubcontractorId: null,
          assignedSubcontractorName: null,
          sectionName: "Checklist work",
        }],
        unscheduledChecklistItems: [],
      },
    ],
  };
}

function activeStatusSnapshot(jobId: number, state: PresenceState, date = ACTIVE_DATE) {
  const record: PresenceRecord = {
    id: 10_000 + jobId,
    jobId,
    date,
    state,
    notHereReason: state === "not_here" ? "weather" : null,
    notes: state === "not_here" ? "Weather stopped production" : null,
    source: "manual_presence",
    provenance: "confirmed",
    createdAt: "2026-09-10T00:00:00.000Z",
    createdByUserId: "browser-test-user",
    createdByName: "Browser Test",
    updatedAt: "2026-09-10T00:00:00.000Z",
    updatedByUserId: "browser-test-user",
    updatedByName: "Browser Test",
  };
  return {
    jobId,
    records: state === "unrecorded" ? [] : [record],
    timing: {
      expectedDurationDays: 3,
      actualProductionStartDate: state === "here" ? date : null,
      lastWorkDate: state === "here" ? date : null,
      calendarSpanDays: state === "here" ? 1 : null,
      actualProductionDays: state === "here" ? 1 : 0,
      pausedNotHereDays: state === "not_here" ? 1 : 0,
      productionDayVariance: state === "here" ? -2 : -3,
    },
  };
}

function buildRecord(date: string, body: Record<string, unknown>): PresenceRecord {
  const now = new Date().toISOString();
  const state = body.state as PresenceState;
  return {
    id: records.get(date)?.id ?? nextRecordId++,
    jobId: JOB_ID,
    date,
    state,
    notHereReason: state === "not_here" ? (body.notHereReason as PresenceReason | null) : null,
    notes: state === "not_here" ? (body.notes as string | null) : null,
    source: "manual_presence",
    provenance: "confirmed",
    createdAt: records.get(date)?.createdAt ?? now,
    createdByUserId: "browser-test-user",
    createdByName: "Browser Test",
    updatedAt: now,
    updatedByUserId: "browser-test-user",
    updatedByName: "Browser Test",
  };
}

async function waitForText(page: Page, text: string) {
  await page.waitForFunction(
    expectedText => document.body.innerText.includes(expectedText),
    { timeout: 15_000 },
    text,
  );
}

async function clickVisible(page: Page, selector: string) {
  const elements = await page.$$(selector);
  for (const element of elements) {
    const box = await element.boundingBox();
    if (box && box.width > 0 && box.height > 0) {
      await element.evaluate(target => (target as HTMLElement).click());
      return;
    }
  }
  throw new Error(`No visible element found for ${selector}`);
}

async function setDateInput(page: Page, selector: string, value: string) {
  await page.$eval(
    selector,
    (element, nextValue) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(element, nextValue);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    },
    value,
  );
}

async function verifyOpenPanelRefresh(page: Page) {
  const presenceToggle = `[data-testid="job-presence-toggle-${JOB_ID}"]`;
  const panel = `[data-testid="job-presence-panel-${JOB_ID}"]`;
  const day = `[data-testid="job-presence-day-${ACTIVE_DATE}"]`;
  const notes = '[data-testid="job-presence-notes"]';

  await clickVisible(page, presenceToggle);
  await page.waitForSelector(panel, { timeout: 20_000 });

  remoteRefreshState = "not_here";
  const refreshCountBeforeFocus = presenceRefreshRequests;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await waitForText(page, "Weather stopped production");
  recordResult(
    "Open presence panel refreshes after window focus",
    presenceRefreshRequests > refreshCountBeforeFocus &&
      await page.$eval(day, element => element.textContent?.includes("Not here") ?? false),
  );

  const refreshCountBeforeHidden = presenceRefreshRequests;
  remoteRefreshState = "here";
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
  await new Promise(resolve => setTimeout(resolve, 250));
  recordResult(
    "Hidden presence panel skips focus refreshes",
    presenceRefreshRequests === refreshCountBeforeHidden &&
      await page.$eval(day, element => element.querySelector('button[data-state="not_here"]')?.className.includes("bg-orange-600") ?? false),
  );

  const refreshCountBeforeVisible = presenceRefreshRequests;
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForFunction(
    selector => document.querySelector(`${selector} button[data-state="here"]`)?.className.includes("bg-emerald-600") ?? false,
    { timeout: 15_000 },
    day,
  );
  recordResult(
    "Visible presence panel resumes with an immediate refresh",
    presenceRefreshRequests > refreshCountBeforeVisible,
  );

  await page.click(`${day} button[data-state="not_here"]`);
  await page.click(notes);
  await page.keyboard.down("Control");
  await page.keyboard.press("A");
  await page.keyboard.up("Control");
  await page.type(notes, "Local draft");

  const refreshCountBeforeEditFocus = presenceRefreshRequests;
  remoteRefreshState = "here";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await new Promise(resolve => setTimeout(resolve, 250));
  recordResult(
    "Presence refresh pauses while a local edit is in progress",
    presenceRefreshRequests === refreshCountBeforeEditFocus &&
      await page.$eval(notes, element => (element as HTMLInputElement).value === "Local draft"),
  );

  await page.click('[aria-label="Close not-here editor"]');
  await clickVisible(page, presenceToggle);
  await page.waitForSelector(panel, { hidden: true, timeout: 20_000 });
  remoteRefreshState = null;
}

async function verifyActivePlannerView(page: Page, view: "week" | "month" | "agenda", label: string) {
  await page.click(`[data-testid="planner-view-${view}"]`);
  await page.waitForFunction(
    expectedView => document.querySelector('[data-testid="jobs-planner"]')?.getAttribute("data-planner-view") === expectedView,
    { timeout: 15_000 },
    view,
  );

  const presenceToggle = `[data-testid="job-presence-toggle-${JOB_ID}"]`;
  const checklistToggle = `[data-testid="job-presence-toggle-${CHECKLIST_ONLY_JOB_ID}"]`;
  const checklistEntry = `[data-planner-entry-key="item-${CHECKLIST_ONLY_ENTRY_ID}"]`;
  await page.waitForFunction(
    selector => Array.from(document.querySelectorAll(selector)).some(element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }),
    { timeout: 20_000 },
    presenceToggle,
  );
  await waitForText(page, CHECKLIST_ONLY_JOB_TITLE);
  if (view === "week") await page.waitForSelector(checklistEntry, { timeout: 20_000 });
  if (view === "week") {
    for (const [jobId, expectedLabel] of [
      [JOB_ID, "Here today"],
      [NOT_HERE_JOB_ID, "Not here today"],
      [UNRECORDED_JOB_ID, "Unrecorded today"],
    ] as const) {
      const status = `[data-testid="job-presence-status-${jobId}"]`;
      await page.waitForSelector(status, { timeout: 20_000 });
      recordResult(
        `Active job card shows ${expectedLabel}`,
        await page.$eval(
          status,
          (element, expected) => element.textContent?.trim() === expected,
          expectedLabel,
        ),
      );
    }
  }
  recordResult(
    `${label} shows Presence for a job entry only`,
    await page.$(presenceToggle) !== null &&
      await page.$(checklistToggle) === null &&
      (view !== "week" || await page.$(checklistEntry) !== null),
  );

  await clickVisible(page, presenceToggle);
  const panel = `[data-testid="job-presence-panel-${JOB_ID}"]`;
  await page.waitForSelector(panel, { timeout: 20_000 });
  recordResult(
    `${label} opens the shared presence panel`,
    await page.$(panel) !== null &&
      await page.$eval(panel, element => element.textContent?.includes("Daily production presence") ?? false),
  );
  await clickVisible(page, presenceToggle);
  await page.waitForSelector(panel, { hidden: true, timeout: 20_000 });
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
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

      if (url.includes("/api/jobs/schedule-history?")) {
        if (failNextHistoryLoad) {
          failNextHistoryLoad = false;
          void request.respond({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: "simulated schedule history failure" }),
          });
          return;
        }
        const historyRange = new URL(url).searchParams.get("from");
        const historyResponse = {
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(scheduleFixture(historyRange === ALTERNATE_DATES[0] ? ALTERNATE_DATES : DATES)),
        };
        if (delayNextHistoryRange === historyRange) {
          delayNextHistoryRange = null;
          const shouldFail = failDelayedHistoryRange;
          failDelayedHistoryRange = false;
          setTimeout(() => {
            void request.respond(
              shouldFail
                ? {
                    status: 503,
                    contentType: "application/json",
                    body: JSON.stringify({ error: "simulated obsolete schedule history failure" }),
                  }
                : historyResponse,
            ).catch(() => undefined);
          }, 250);
          return;
        }
        void request.respond(historyResponse);
        return;
      }

      const presenceQuery = url.match(/\/api\/jobs\/production-presence\?jobIds=([^&]+)/);
      if (presenceQuery) {
        const requestedIds = decodeURIComponent(presenceQuery[1])
          .split(",")
          .map(value => Number(value))
          .filter(Number.isInteger);
        const isActiveScheduleBatch = requestedIds.length > 1;
        if (!isActiveScheduleBatch && failNextPresenceRefresh) {
          failNextPresenceRefresh = false;
          presenceRefreshRequests += 1;
          void request.respond({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: "simulated presence refresh failure" }),
          });
          return;
        }
        void request.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            jobs: isActiveScheduleBatch
              ? requestedIds.map(jobId => activeStatusSnapshot(
                jobId,
                jobId === JOB_ID ? "here" : jobId === NOT_HERE_JOB_ID ? "not_here" : "unrecorded",
              ))
              : [remoteRefreshState && requestedIds[0] === JOB_ID
                ? activeStatusSnapshot(JOB_ID, remoteRefreshState, remoteRefreshDate)
                : snapshot()],
          }),
        });
        if (!isActiveScheduleBatch) presenceRefreshRequests += 1;
        return;
      }

      const putMatch = url.match(new RegExp(`/api/jobs/${JOB_ID}/production-presence/(\\d{4}-\\d{2}-\\d{2})$`));
      if (method === "PUT" && putMatch) {
        const date = putMatch[1];
        const body = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
        allowedWrites.push({ method, url, body });
        if (failNextSave) {
          failNextSave = false;
          void request.respond({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "simulated presence save failure" }),
          });
          return;
        }
        const next = buildRecord(date, body);
        records.set(date, next);
        void request.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ jobId: JOB_ID, record: next, timing: timing() }),
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
    await page.goto(`${BASE}/api/dev-test-login?${loginParams}`, {
      waitUntil: "networkidle2",
      timeout: 60_000,
    });
    sessionId = (await page.cookies()).find(cookie => cookie.name === SESSION_COOKIE)?.value;
    if (!sessionId) throw new Error("Development login did not create a session cookie");

    await page.goto(`${BASE}/jobs`, { waitUntil: "networkidle2", timeout: 60_000 });
    await verifyActivePlannerView(page, "week", "Active Schedule week view");
    await verifyOpenPanelRefresh(page);
    await verifyActivePlannerView(page, "agenda", "Active Schedule agenda view");
    await verifyActivePlannerView(page, "month", "Active Schedule month view");

    await page.setViewport({ width: 390, height: 844 });
    await verifyActivePlannerView(page, "agenda", "Narrow Active Schedule agenda view");
    await page.setViewport({ width: 1440, height: 1200 });

    await page.waitForSelector('[data-testid="schedule-history-tab"]', { timeout: 20_000 });
    await page.click('[data-testid="schedule-history-tab"]');
    await page.waitForSelector(`[data-testid="job-presence-panel-${JOB_ID}"]`, { timeout: 20_000 });
    recordResult(
      "Authenticated Schedule History opens the presence panel",
      await page.$(`[data-testid="job-presence-panel-${JOB_ID}"]`) !== null &&
        (await page.$eval(
          `[data-testid="schedule-history-job-${JOB_ID}"]`,
          (element, title) => element.textContent?.includes(title) ?? false,
          JOB_TITLE,
        )),
    );
    await page.screenshot({ path: `${SHOTS}/01-history-presence.png`, fullPage: true });

    const dayOne = `[data-testid="job-presence-day-${DATES[0]}"]`;
    remoteRefreshDate = DATES[0];
    remoteRefreshState = "not_here";
    const historyRefreshCountBeforeFocus = presenceRefreshRequests;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await waitForText(page, "Weather stopped production");
    recordResult(
      "Schedule History presence panel refreshes after window focus",
      presenceRefreshRequests > historyRefreshCountBeforeFocus &&
        await page.$eval(dayOne, element => element.textContent?.includes("Not here") ?? false),
    );

    const historyRefreshCountBeforeFailure = presenceRefreshRequests;
    failNextPresenceRefresh = true;
    remoteRefreshState = "here";
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForSelector('[data-testid="job-presence-refresh-stale"]', { timeout: 15_000 });
    const retainedRefreshTimestamp = await page.$eval(
      '[data-testid="job-presence-last-refreshed"]',
      element => element.textContent?.trim() ?? "",
    );
    const retainedRefreshTimestampValue = await page.$eval(
      '[data-testid="job-presence-last-refreshed"] [data-last-refreshed-at]',
      element => element.getAttribute("data-last-refreshed-at") ?? "",
    );
    const retainedRefreshSemanticTime = await page.$eval(
      '[data-testid="job-presence-last-refreshed"] [data-last-refreshed-at]',
      element => ({
        tagName: element.tagName,
        dateTime: (element as HTMLTimeElement).dateTime,
      }),
    );
    recordResult(
      "Schedule History shows a stale warning after refresh failure",
      presenceRefreshRequests > historyRefreshCountBeforeFailure &&
        await page.$eval(
          dayOne,
          element => element.querySelector('button[data-state="not_here"]')?.className.includes("bg-orange-600") ?? false,
        ) &&
        await page.$eval(
          '[data-testid="job-presence-refresh-stale"]',
          element => element.textContent?.includes("last successful snapshot is still shown") ?? false,
        ) &&
        retainedRefreshTimestamp.includes("Last successful refresh:"),
    );
    recordResult(
      "Schedule History refresh time uses an ISO semantic time",
      retainedRefreshSemanticTime.tagName === "TIME" &&
        retainedRefreshSemanticTime.dateTime === new Date(Number(retainedRefreshTimestampValue)).toISOString(),
    );

    failNextPresenceRefresh = true;
    const historyRefreshCountBeforeRetryFailure = presenceRefreshRequests;
    await page.click('[data-testid="job-presence-refresh-retry"]');
    await page.waitForFunction(
      () => {
        const banner = document.querySelector('[data-testid="job-presence-refresh-stale"]');
        const retry = document.querySelector('[data-testid="job-presence-refresh-retry"]') as HTMLButtonElement | null;
        return Boolean(banner && retry && !retry.disabled);
      },
      { timeout: 15_000 },
    );
    recordResult(
      "Schedule History keeps stale warning after retry failure",
      presenceRefreshRequests > historyRefreshCountBeforeRetryFailure &&
        await page.$eval(
          dayOne,
          element => element.querySelector('button[data-state="not_here"]')?.className.includes("bg-orange-600") ?? false,
        ) &&
        await page.$eval(
          '[data-testid="job-presence-last-refreshed"]',
          (element, expected) => element.textContent?.trim() === expected,
          retainedRefreshTimestamp,
        ),
        await page.$eval(
          '[data-testid="job-presence-last-refreshed"] [data-last-refreshed-at]',
          (element, expected) => element.getAttribute("data-last-refreshed-at") === expected,
          retainedRefreshTimestampValue,
        ),
    );

    await page.click('[data-testid="job-presence-refresh-retry"]');
    await page.waitForFunction(
      selector => !document.querySelector(selector),
      { timeout: 15_000 },
      '[data-testid="job-presence-refresh-stale"]',
    );
    recordResult(
      "Schedule History retry clears the stale warning",
      await page.$eval(dayOne, element => element.querySelector('button[data-state="here"]')?.className.includes("bg-emerald-600") ?? false),
    );

    await new Promise(resolve => setTimeout(resolve, 25));
    failNextPresenceRefresh = true;
    remoteRefreshState = "not_here";
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForSelector('[data-testid="job-presence-refresh-stale"]', { timeout: 15_000 });
    recordResult(
      "Schedule History timestamp updates after a successful retry",
      await page.$eval(
        '[data-testid="job-presence-last-refreshed"] [data-last-refreshed-at]',
        (element, expected) => element.getAttribute("data-last-refreshed-at") !== expected,
        retainedRefreshTimestampValue,
      ),
    );

    remoteRefreshState = "here";
    await page.click('[data-testid="job-presence-refresh-retry"]');
    await page.waitForFunction(
      selector => !document.querySelector(selector),
      { timeout: 15_000 },
      '[data-testid="job-presence-refresh-stale"]',
    );

    const historyRefreshCountBeforeHidden = presenceRefreshRequests;
    remoteRefreshState = "not_here";
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });
    await new Promise(resolve => setTimeout(resolve, 250));
    recordResult(
      "Hidden Schedule History skips presence refreshes",
      presenceRefreshRequests === historyRefreshCountBeforeHidden &&
        await page.$eval(dayOne, element => element.querySelector('button[data-state="here"]')?.className.includes("bg-emerald-600") ?? false),
    );

    const historyRefreshCountBeforeVisible = presenceRefreshRequests;
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForFunction(
      selector => document.querySelector(`${selector} button[data-state="here"]`)?.className.includes("bg-emerald-600") ?? false,
      { timeout: 15_000 },
      dayOne,
    );
    recordResult(
      "Visible Schedule History resumes with an immediate refresh",
      presenceRefreshRequests > historyRefreshCountBeforeVisible,
    );

    await page.click(`${dayOne} button[data-state="not_here"]`);
    await page.click('[data-testid="job-presence-notes"]');
    await page.keyboard.down("Control");
    await page.keyboard.press("A");
    await page.keyboard.up("Control");
    await page.type('[data-testid="job-presence-notes"]', "History local draft");
    const historyRefreshCountBeforeEdit = presenceRefreshRequests;
    remoteRefreshState = "here";
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await new Promise(resolve => setTimeout(resolve, 250));
    recordResult(
      "Schedule History refresh preserves a local edit",
      presenceRefreshRequests === historyRefreshCountBeforeEdit &&
        await page.$eval(
          '[data-testid="job-presence-notes"]',
          element => (element as HTMLInputElement).value === "History local draft",
        ),
    );
    await page.click('[aria-label="Close not-here editor"]');
    remoteRefreshState = null;
    remoteRefreshDate = ACTIVE_DATE;

    await page.click(`${dayOne} button[data-state="here"]`);
    await waitForText(page, "1 production days");
    recordResult(
      "Here sends the expected presence write and updates timing",
      allowedWrites[0]?.body.state === "here" &&
        records.get(DATES[0])?.state === "here" &&
        await page.$eval(dayOne, element => element.textContent?.includes("Confirmed manually") ?? false) &&
        await page.$eval(`[data-testid="job-presence-panel-${JOB_ID}"]`, element => element.textContent?.includes("1 production days") ?? false),
      JSON.stringify(allowedWrites[0]),
    );

    const dayTwo = `[data-testid="job-presence-day-${DATES[1]}"]`;
    await page.click(`${dayTwo} button[data-state="not_here"]`);
    await page.select('[data-testid="job-presence-reason"]', "weather");
    await page.type('[data-testid="job-presence-notes"]', "Rain stopped production");
    await page.click('[data-testid="job-presence-save"]');
    await waitForText(page, "Weather · Rain stopped production");
    recordResult(
      "Not here persists its approved reason and note",
      allowedWrites[1]?.body.state === "not_here" &&
        allowedWrites[1]?.body.notHereReason === "weather" &&
        allowedWrites[1]?.body.notes === "Rain stopped production" &&
        records.get(DATES[1])?.notHereReason === "weather" &&
        await page.$eval(dayTwo, element => element.textContent?.includes("Weather · Rain stopped production") ?? false),
      JSON.stringify(allowedWrites[1]),
    );

    await page.click(`${dayTwo} button[data-state="unrecorded"]`);
    await waitForText(page, "Unrecorded");
    recordResult(
      "Unrecorded clears the day without treating it as absence",
      allowedWrites[2]?.body.state === "unrecorded" &&
        allowedWrites[2]?.body.notHereReason === null &&
        allowedWrites[2]?.body.notes === null &&
        records.get(DATES[1])?.state === "unrecorded" &&
        (await page.$eval(dayTwo, element => element.textContent?.includes("Unrecorded") ?? false)),
      JSON.stringify(allowedWrites[2]),
    );

    const timingBeforeFailure = await page.$eval(
      `[data-testid="job-presence-panel-${JOB_ID}"]`,
      element => element.textContent?.match(/\d+ production days/)?.[0] ?? "",
    );
    failNextSave = true;
    await page.click(`[data-testid="job-presence-day-${DATES[2]}"] button[data-state="here"]`);
    await page.waitForSelector('[data-testid="job-presence-save-error"]', { timeout: 15_000 });
    const timingAfterFailure = await page.$eval(
      `[data-testid="job-presence-panel-${JOB_ID}"]`,
      element => element.textContent?.match(/\d+ production days/)?.[0] ?? "",
    );
    recordResult(
      "Failed save shows an error without replacing timing",
      timingBeforeFailure === "1 production days" &&
        timingAfterFailure === timingBeforeFailure &&
        (await page.$eval('[data-testid="job-presence-save-error"]', element => element.textContent?.includes("Could not save this day") ?? false)),
      `${timingBeforeFailure} -> ${timingAfterFailure}`,
    );

    remoteRefreshDate = DATES[0];
    remoteRefreshState = "here";
    failNextPresenceRefresh = true;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForSelector('[data-testid="job-presence-refresh-stale"]', { timeout: 15_000 });
    const firstRangeRefreshTimestamp = await page.$eval(
      '[data-testid="job-presence-last-refreshed"] [data-last-refreshed-at]',
      element => element.getAttribute("data-last-refreshed-at") ?? "",
    );

    await setDateInput(page, '[data-testid="schedule-history-from"]', ALTERNATE_DATES[0]);
    await setDateInput(page, '[data-testid="schedule-history-to"]', ALTERNATE_DATES[2]);
    await page.click('[data-testid="schedule-history-load"]');
    await waitForText(page, "Jul 1, 2026");
    await page.waitForSelector(`[data-testid="job-presence-day-${ALTERNATE_DATES[0]}"]`, { timeout: 15_000 });
    await page.waitForFunction(
      () =>
        !document.querySelector('[data-testid="job-presence-refresh-stale"]') &&
        !document.querySelector('[data-testid="job-presence-last-refreshed"]'),
      { timeout: 15_000 },
    );
    recordResult(
      "Schedule History clears refresh age when a new range loads",
      firstRangeRefreshTimestamp !== "" &&
        await page.$('[data-testid="job-presence-refresh-stale"]') === null &&
        await page.$('[data-testid="job-presence-last-refreshed"]') === null,
    );

    remoteRefreshDate = ALTERNATE_DATES[0];
    remoteRefreshState = "not_here";
    failNextPresenceRefresh = true;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForSelector('[data-testid="job-presence-refresh-stale"]', { timeout: 15_000 });
    const secondRangeRefreshTimestamp = await page.$eval(
      '[data-testid="job-presence-last-refreshed"] [data-last-refreshed-at]',
      element => element.getAttribute("data-last-refreshed-at") ?? "",
    );
    recordResult(
      "Schedule History establishes a new refresh age for the new range",
      secondRangeRefreshTimestamp !== "" && secondRangeRefreshTimestamp !== firstRangeRefreshTimestamp,
    );
    remoteRefreshState = "here";
    await page.click('[data-testid="job-presence-refresh-retry"]');
    await page.waitForFunction(
      selector => !document.querySelector(selector),
      { timeout: 15_000 },
      '[data-testid="job-presence-refresh-stale"]',
    );

    remoteRefreshDate = DATES[0];
    remoteRefreshState = "here";
    failNextHistoryLoad = true;
    await setDateInput(page, '[data-testid="schedule-history-from"]', DATES[0]);
    await setDateInput(page, '[data-testid="schedule-history-to"]', DATES[2]);
    await page.click('[data-testid="schedule-history-load"]');
    await waitForText(page, "Could not load schedule history.");
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="schedule-history-error"]') !== null &&
        document.querySelector('[data-testid="schedule-history-loading-range"]') === null,
      { timeout: 15_000 },
    );
    recordResult(
      "Failed Schedule History range replaces loading status and keeps the applied range",
      await page.$('[data-testid="schedule-history-error"]') !== null &&
        await page.$('[data-testid="schedule-history-loading-range"]') === null &&
        await page.$eval(
          '[data-testid="schedule-history-applied-range"]',
          element => element.textContent?.includes("Sep 1, 2026") === true &&
            element.textContent?.includes("Sep 3, 2026") === true,
        ),
    );
    await page.waitForFunction(
      () =>
        !document.querySelector('[data-testid="job-presence-refresh-stale"]') &&
        !document.querySelector('[data-testid="job-presence-last-refreshed"]'),
      { timeout: 15_000 },
    );
    recordResult(
      "Failed Schedule History range clears the previous refresh age",
      secondRangeRefreshTimestamp !== "" &&
        await page.$('[data-testid="job-presence-refresh-stale"]') === null &&
        await page.$('[data-testid="job-presence-last-refreshed"]') === null,
    );

    await page.click('[data-testid="schedule-history-load"]');
    await waitForText(page, "Sep 1, 2026");
    await page.waitForSelector(`[data-testid="job-presence-day-${DATES[0]}"]`, { timeout: 15_000 });
    await waitForText(page, "Confirmed manually");
    await new Promise(resolve => setTimeout(resolve, 25));
    remoteRefreshState = "not_here";
    failNextPresenceRefresh = true;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForSelector('[data-testid="job-presence-refresh-stale"]', { timeout: 15_000 });
    const recoveredRangeRefreshTimestamp = await page.$eval(
      '[data-testid="job-presence-last-refreshed"] [data-last-refreshed-at]',
      element => element.getAttribute("data-last-refreshed-at") ?? "",
    );
    recordResult(
      "Successful Schedule History range establishes a new refresh age",
      recoveredRangeRefreshTimestamp !== "" && recoveredRangeRefreshTimestamp !== secondRangeRefreshTimestamp,
    );
    remoteRefreshState = "here";
    await page.click('[data-testid="job-presence-refresh-retry"]');
    await page.waitForFunction(
      selector => !document.querySelector(selector),
      { timeout: 15_000 },
      '[data-testid="job-presence-refresh-stale"]',
    );

    remoteRefreshDate = DATES[0];
    remoteRefreshState = "here";
    delayNextHistoryRange = ALTERNATE_DATES[0];
    await setDateInput(page, '[data-testid="schedule-history-from"]', ALTERNATE_DATES[0]);
    await setDateInput(page, '[data-testid="schedule-history-to"]', ALTERNATE_DATES[2]);
    await page.click('[data-testid="schedule-history-load"]');
    await page.waitForSelector('[data-testid="schedule-history-loading-range"]', { timeout: 15_000 });
    const duplicateRangeButtonDisabled = await page.$eval(
      '[data-testid="schedule-history-load"]',
      element => (element as HTMLButtonElement).disabled,
    );
    await setDateInput(page, '[data-testid="schedule-history-from"]', DATES[0]);
    await setDateInput(page, '[data-testid="schedule-history-to"]', DATES[2]);
    const newerRangeButtonEnabled = await page.$eval(
      '[data-testid="schedule-history-load"]',
      element => !(element as HTMLButtonElement).disabled,
    );
    recordResult(
      "Schedule History blocks duplicate loads but allows a newer range",
      duplicateRangeButtonDisabled && newerRangeButtonEnabled,
    );
    delayNextHistoryRange = DATES[0];
    await page.click('[data-testid="schedule-history-load"]');
    await page.waitForSelector('[data-testid="schedule-history-loading-range"]', { timeout: 15_000 });
    recordResult(
      "Schedule History loading status names the newest applied range",
      await page.$eval(
        '[data-testid="schedule-history-loading-range"]',
        element => element.textContent?.includes("Sep 1, 2026") === true &&
          element.textContent?.includes("Sep 3, 2026") === true,
      ),
    );
    await waitForText(page, "Sep 1, 2026");
    await waitForText(page, "Confirmed manually");
    await new Promise(resolve => setTimeout(resolve, 400));
    recordResult(
      "Rapid Schedule History changes keep the newest range",
      await page.$(`[data-testid="job-presence-day-${DATES[0]}"]`) !== null &&
        await page.$(`[data-testid="job-presence-day-${ALTERNATE_DATES[0]}"]`) === null &&
        await page.$eval(`[data-testid="schedule-history-job-${JOB_ID}"]`, element => element.textContent?.includes("Sep 1, 2026") ?? false) &&
        await page.$eval('[data-testid="schedule-history-applied-range"]', element => element.textContent?.includes("Sep 1, 2026") ?? false),
    );

    await new Promise(resolve => setTimeout(resolve, 25));
    remoteRefreshState = "not_here";
    failNextPresenceRefresh = true;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForSelector('[data-testid="job-presence-refresh-stale"]', { timeout: 15_000 });
    const rapidRangeRefreshTimestamp = await page.$eval(
      '[data-testid="job-presence-last-refreshed"] [data-last-refreshed-at]',
      element => element.getAttribute("data-last-refreshed-at") ?? "",
    );
    recordResult(
      "Rapid Schedule History changes re-establish newest-range refresh age",
      rapidRangeRefreshTimestamp !== "" &&
        rapidRangeRefreshTimestamp !== recoveredRangeRefreshTimestamp &&
        await page.$(`[data-testid="job-presence-day-${DATES[0]}"]`) !== null &&
        await page.$(`[data-testid="job-presence-day-${ALTERNATE_DATES[0]}"]`) === null,
    );
    remoteRefreshState = "here";
    await page.click('[data-testid="job-presence-refresh-retry"]');
    await page.waitForFunction(
      selector => !document.querySelector(selector),
      { timeout: 15_000 },
      '[data-testid="job-presence-refresh-stale"]',
    );

    remoteRefreshDate = DATES[0];
    remoteRefreshState = "here";
    delayNextHistoryRange = ALTERNATE_DATES[0];
    failDelayedHistoryRange = true;
    await setDateInput(page, '[data-testid="schedule-history-from"]', ALTERNATE_DATES[0]);
    await setDateInput(page, '[data-testid="schedule-history-to"]', ALTERNATE_DATES[2]);
    await page.click('[data-testid="schedule-history-load"]');
    await setDateInput(page, '[data-testid="schedule-history-from"]', DATES[0]);
    await setDateInput(page, '[data-testid="schedule-history-to"]', DATES[2]);
    await page.click('[data-testid="schedule-history-load"]');
    await waitForText(page, "Sep 1, 2026");
    await waitForText(page, "Confirmed manually");
    await new Promise(resolve => setTimeout(resolve, 400));
    await new Promise(resolve => setTimeout(resolve, 25));
    remoteRefreshState = "not_here";
    failNextPresenceRefresh = true;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForSelector('[data-testid="job-presence-refresh-stale"]', { timeout: 15_000 });
    const obsoleteFailureRangeRefreshTimestamp = await page.$eval(
      '[data-testid="job-presence-last-refreshed"] [data-last-refreshed-at]',
      element => element.getAttribute("data-last-refreshed-at") ?? "",
    );
    recordResult(
      "Failed obsolete History response does not replace the newest range",
      obsoleteFailureRangeRefreshTimestamp !== "" &&
        obsoleteFailureRangeRefreshTimestamp !== rapidRangeRefreshTimestamp &&
        await page.$('[data-testid="schedule-history-error"]') === null &&
        await page.$(`[data-testid="job-presence-day-${DATES[0]}"]`) !== null &&
        await page.$(`[data-testid="job-presence-day-${ALTERNATE_DATES[0]}"]`) === null,
    );
    remoteRefreshState = "here";
    await page.click('[data-testid="job-presence-refresh-retry"]');
    await page.waitForFunction(
      selector => !document.querySelector(selector),
      { timeout: 15_000 },
      '[data-testid="job-presence-refresh-stale"]',
    );

    await page.screenshot({ path: `${SHOTS}/02-presence-error.png`, fullPage: true });
  } finally {
    if (sessionId) await deleteSession(sessionId).catch(() => undefined);
    await browser.close();
  }

  recordResult("Browser writes stayed within the presence route under test", blockedWrites.length === 0, blockedWrites.join("; "));
  const failed = results.filter(result => !result.pass);
  console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
  if (failed.length > 0) {
    console.error("FAILED:", failed.map(result => result.name).join("; "));
    process.exit(1);
  }
}

main().catch(error => {
  console.error("SCRIPT ERROR:", error);
  process.exit(1);
});