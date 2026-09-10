/* Authenticated browser regression check for Schedule History daily presence.
 *
 * Run:
 *   SID=<approved-development-session-id> pnpm --filter @workspace/api-server run verify:production-presence
 *
 * Schedule History and presence responses are served as read-only in-memory
 * fixtures. The only browser write allowed is the presence PUT under test.
 */
import fs from "node:fs";
import type { Page } from "puppeteer";
import { launchBrowser } from "../src/lib/launchBrowser";

const BASE = "http://localhost:80";
const SHOTS = "/tmp/e2e-production-presence";
const SID = process.env.SID;
const JOB_ID = 9201;
const JOB_TITLE = "Production Presence Browser Fixture";
const DATES = ["2026-09-01", "2026-09-02", "2026-09-03"];

if (!SID) {
  console.error("FATAL: SID env var required");
  process.exit(1);
}

if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
  throw new Error("Refusing to run Production Presence E2E verification against a production deployment");
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

function scheduleFixture() {
  return {
    from: "2026-08-01",
    to: "2026-09-30",
    jobs: [{
      id: JOB_ID,
      title: JOB_TITLE,
      status: "completed",
      jobType: "general_contracting",
      startDate: DATES[0],
      endDate: DATES[2],
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

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1200 });
    await page.setCookie({ name: "sid", value: SID!, domain: "localhost", path: "/" });
    await page.setRequestInterception(true);
    page.on("request", request => {
      const url = request.url();
      const method = request.method().toUpperCase();

      if (url.includes("/api/jobs/schedule-history?")) {
        void request.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(scheduleFixture()),
        });
        return;
      }

      if (url.includes(`/api/jobs/production-presence?jobIds=${JOB_ID}`)) {
        void request.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ jobs: [snapshot()] }),
        });
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

    await page.goto(`${BASE}/jobs`, { waitUntil: "networkidle2", timeout: 60_000 });
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
    await page.screenshot({ path: `${SHOTS}/02-presence-error.png`, fullPage: true });
  } finally {
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