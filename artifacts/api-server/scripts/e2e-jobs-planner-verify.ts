/* Authenticated browser regression check for the Jobs operations planner.
 * Run: SID=<session-id> pnpm --filter @workspace/api-server run verify:jobs-planner
 */
import fs from "node:fs";
import type { Page } from "puppeteer";
import { launchBrowser } from "../src/lib/launchBrowser";

const BASE = "http://localhost:80";
const SHOTS = "/tmp/e2e-jobs-planner";
const SID = process.env.SID;

if (!SID) {
  console.error("FATAL: SID env var required");
  process.exit(1);
}

const results: { name: string; pass: boolean; detail: string }[] = [];

function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
}

function localDateString(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(date: Date, amount: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function startOfWeek(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  result.setDate(result.getDate() - (day === 0 ? 6 : day - 1));
  result.setHours(12, 0, 0, 0);
  return result;
}

async function clickTestId(page: Page, testId: string) {
  await page.click(`[data-testid="${testId}"]`);
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });

  const monday = startOfWeek(new Date());
  const tuesday = localDateString(addDays(monday, 1));
  const wednesday = localDateString(addDays(monday, 2));
  const thursday = localDateString(addDays(monday, 3));

  const scheduleFixture = {
    jobs: [
      {
        id: 9001,
        title: "Planner Span Fixture",
        status: "in_progress",
        jobType: "general_contracting",
        startDate: tuesday,
        endDate: thursday,
        planningState: "scheduled",
        priority: "normal",
        resourceDemand: "standard",
        queuePosition: null,
        checklistItems: [],
        unscheduledChecklistItems: [],
      },
      {
        id: 9002,
        title: "Planner Queue Fixture",
        status: "scheduled",
        jobType: "lot_model",
        startDate: null,
        endDate: null,
        planningState: "queue",
        priority: "normal",
        resourceDemand: "standard",
        queuePosition: 1,
        checklistItems: [
          {
            id: 9101,
            title: "Planner Checklist Fixture",
            completed: false,
            skipped: false,
            scheduledDate: wednesday,
            assignedSubcontractorId: null,
            assignedSubcontractorName: null,
            sectionName: "Site prep",
          },
        ],
        unscheduledChecklistItems: [],
      },
      {
        id: 9003,
        title: "Planner Waiting Fixture",
        status: "scheduled",
        jobType: "general_contracting",
        startDate: null,
        endDate: null,
        planningState: "waiting",
        priority: "high",
        resourceDemand: "standard",
        queuePosition: null,
        activeReadinessCondition: {
          reason: "materials",
          detail: "Waiting on fixture materials",
        },
        checklistItems: [],
        unscheduledChecklistItems: [],
      },
    ],
  };

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1200 });
    await page.setCookie({ name: "sid", value: SID!, domain: "localhost", path: "/" });
    await page.setRequestInterception(true);
    page.on("request", request => {
      if (request.url().includes("/api/jobs/schedule-overview?")) {
        void request.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(scheduleFixture),
        });
        return;
      }
      void request.continue();
    });

    await page.goto(`${BASE}/jobs`, { waitUntil: "networkidle2", timeout: 60_000 });
    await page.waitForSelector('[data-testid="jobs-planner"][data-planner-view="week"]', { timeout: 20_000 });

    const authenticatedPage = await page.evaluate(() => ({
      heading: document.querySelector("h1")?.textContent?.trim() ?? "",
      hasPlanner: Boolean(document.querySelector('[data-testid="jobs-planner"]')),
      path: window.location.pathname,
    }));
    record(
      "Authenticated Jobs page loads",
      authenticatedPage.heading === "Jobs" &&
        authenticatedPage.hasPlanner &&
        authenticatedPage.path.endsWith("/jobs"),
      JSON.stringify(authenticatedPage),
    );

    const weekEvidence = await page.evaluate(() => {
      const span = document.querySelector<HTMLElement>('[data-planner-entry-key="job-9001"]');
      const checklist = document.querySelector<HTMLElement>('[data-planner-entry-key="item-9101"]');
      if (!span) return null;
      const gridColumn = span.style.gridColumn;
      const [start, end] = gridColumn.split("/").map(value => Number(value.trim()));
      return {
        spanCount: document.querySelectorAll('[data-planner-entry-key="job-9001"]').length,
        startDate: span.dataset.plannerStart,
        endDate: span.dataset.plannerEnd,
        gridColumn,
        gridWidth: end - start,
        checklistVisible: Boolean(checklist),
      };
    });

    record("Multi-day job renders once", weekEvidence?.spanCount === 1, JSON.stringify(weekEvidence));
    record(
      "Multi-day job uses only its real start and end dates",
      weekEvidence?.startDate === tuesday && weekEvidence?.endDate === thursday,
      `${weekEvidence?.startDate ?? "missing"} to ${weekEvidence?.endDate ?? "missing"}`,
    );
    record(
      "Multi-day job is one continuous three-day grid span",
      weekEvidence?.gridWidth === 3,
      weekEvidence?.gridColumn ?? "missing",
    );
    record("Dated checklist item remains visible", weekEvidence?.checklistVisible === true);

    const queueText = await page.$eval('[data-testid="planner-unscheduled"]', element => element.textContent ?? "");
    record("Unscheduled queue job remains visible", queueText.includes("Planner Queue Fixture"), queueText.trim());

    const waitingText = await page.$eval('[data-testid="planner-waiting"]', element => element.textContent ?? "");
    record(
      "Waiting job shows its blocker",
      waitingText.includes("Planner Waiting Fixture") && waitingText.includes("Waiting on fixture materials"),
      waitingText.trim(),
    );

    record(
      "Job Records section remains below the planner",
      await page.$eval('[data-testid="job-records-heading"]', element => element.textContent?.includes("Job records") ?? false),
    );
    await page.screenshot({ path: `${SHOTS}/01-week.png`, fullPage: true });

    await clickTestId(page, "planner-view-month");
    await page.waitForSelector('[data-testid="jobs-planner"][data-planner-view="month"]');
    record(
      "Month control switches views",
      await page.$eval('[data-testid="jobs-planner"]', element => element.textContent?.includes("Monthly view") ?? false),
    );

    await clickTestId(page, "planner-view-agenda");
    await page.waitForSelector('[data-testid="jobs-planner"][data-planner-view="agenda"]');
    record(
      "Agenda control switches views",
      await page.$eval('[data-testid="jobs-planner"]', element => element.textContent?.includes("Upcoming agenda") ?? false),
    );
    await page.screenshot({ path: `${SHOTS}/02-agenda.png`, fullPage: true });
  } finally {
    await browser.close();
  }

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