/* Authenticated browser regression check for current and superseded Job
 * production component controls.
 *
 * Run:
 *   pnpm --filter @workspace/api-server run verify:job-production-components
 *
 * The fixture uses the real development database and the real Jobs page. All
 * browser writes are denied because this verifier only checks read-only UI.
 */
import fs from "node:fs";
import type { HTTPRequest, Page } from "puppeteer";
import { and, asc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import {
  db,
  businessesTable,
  jobProductionComponentsTable,
  jobsTable,
  productionServiceTypesTable,
} from "@workspace/db";
import { createTestLoginProof, deleteSession, SESSION_COOKIE } from "../src/lib/auth";
import { launchBrowser } from "../src/lib/launchBrowser";

const BASE = process.env.BUILDPRO_E2E_BASE_URL ?? "http://localhost:80";
const SHOTS = "/tmp/e2e-job-production-components";
const JOB_TITLE = "Job Production Components Browser Fixture";

if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
  throw new Error("Refusing to run Job Production Components E2E verification against a production deployment");
}

const baseUrl = new URL(BASE);
const baseHostname = baseUrl.hostname.replace(/^\[|\]$/g, "");
if (baseUrl.protocol !== "http:" || !["localhost", "127.0.0.1", "::1"].includes(baseHostname)) {
  throw new Error(
    `Refusing to run Job Production Components E2E verification against non-local target ${baseUrl.origin}. ` +
    "Set BUILDPRO_E2E_BASE_URL to a local development server.",
  );
}

type Fixture = {
  jobId: number;
  componentIds: number[];
  scopedBusinessId: number;
  otherBusinessId: number;
  sourceServiceId: number;
};

const results: { name: string; pass: boolean; detail?: string }[] = [];
const blockedWrites: string[] = [];

function recordResult(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
}

async function waitForText(page: Page, text: string) {
  await page.waitForFunction(
    expected => document.body.innerText.includes(expected),
    { timeout: 30_000 },
    text,
  );
}

async function clickJobCardButton(page: Page, title: string, label: string) {
  await page.waitForFunction(
    ({ expectedTitle, expectedLabel }) => Array.from(document.querySelectorAll("h3"))
      .some(heading => {
        if (heading.textContent?.trim() !== expectedTitle) return false;
        let scope: HTMLElement | null = heading.parentElement;
        while (scope) {
          if (Array.from(scope.querySelectorAll("button"))
            .some(button => button.textContent?.trim() === expectedLabel)) return true;
          scope = scope.parentElement;
        }
        return false;
      }),
    { timeout: 30_000 },
    { expectedTitle: title, expectedLabel: label },
  );

  await page.evaluate(
    ({ expectedTitle, expectedLabel }) => {
      const heading = Array.from(document.querySelectorAll("h3"))
        .find(candidate => candidate.textContent?.trim() === expectedTitle);
      if (!heading) throw new Error(`Could not find job heading: ${expectedTitle}`);
      let scope: HTMLElement | null = heading.parentElement;
      while (scope) {
        const button = Array.from(scope.querySelectorAll("button"))
          .find(candidate => candidate.textContent?.trim() === expectedLabel);
        if (button) {
          button.click();
          return;
        }
        scope = scope.parentElement;
      }
      throw new Error(`Could not find ${expectedLabel} for job: ${expectedTitle}`);
    },
    { expectedTitle: title, expectedLabel: label },
  );
}

async function createFixture(): Promise<Partial<Fixture>> {
  const fixture: Partial<Fixture> = {};
  const [scopedBusiness] = await db
    .select({ id: businessesTable.id, slug: businessesTable.slug })
    .from(businessesTable)
    .where(eq(businessesTable.slug, "general_contracting"))
    .limit(1);
  if (!scopedBusiness) throw new Error("The General Contracting business fixture is missing");
  fixture.scopedBusinessId = scopedBusiness.id;

  const [otherBusiness] = await db
    .select({ id: businessesTable.id })
    .from(businessesTable)
    .where(ne(businessesTable.id, scopedBusiness.id))
    .orderBy(asc(businessesTable.id))
    .limit(1);
  if (!otherBusiness) throw new Error("A second business fixture is required for scope verification");
  fixture.otherBusinessId = otherBusiness.id;

  const [service] = await db
    .select({
      id: productionServiceTypesTable.id,
      name: productionServiceTypesTable.name,
      itemKey: productionServiceTypesTable.itemKey,
      category: productionServiceTypesTable.category,
      appliesTo: productionServiceTypesTable.appliesTo,
    })
    .from(productionServiceTypesTable)
    .where(and(
      eq(productionServiceTypesTable.active, true),
      eq(productionServiceTypesTable.appliesTo, "production"),
      isNotNull(productionServiceTypesTable.itemKey),
    ))
    .orderBy(asc(productionServiceTypesTable.id))
    .limit(1);
  if (!service) throw new Error("An active production service fixture is required");
  fixture.sourceServiceId = service.id;

  const [job] = await db
    .insert(jobsTable)
    .values({
      title: JOB_TITLE,
      status: "scheduled",
      workflow: "mh_production",
      businessLine: scopedBusiness.slug,
      businessId: scopedBusiness.id,
      planningState: "ready",
      startDate: "2099-01-15",
      endDate: "2099-01-16",
      daysOnJob: 2,
      mhProductionServices: [service.id],
    })
    .returning({ id: jobsTable.id });
  if (!job) throw new Error("Failed to create the production component browser fixture job");
  fixture.jobId = job.id;

  const sourceService = [{
    id: service.id,
    name: service.name,
    itemKey: service.itemKey,
    category: service.category,
    appliesTo: service.appliesTo,
  }];
  const [oldRow, currentRow] = await db
    .insert(jobProductionComponentsTable)
    .values([
      {
        jobId: job.id,
        businessId: scopedBusiness.id,
        componentKey: "siding",
        componentInstanceKey: "siding:unspecified",
        componentLabel: "Siding",
        variant: null,
        sourceServiceIds: [service.id],
        sourceServices: sourceService,
        snapshotVersion: 1,
        status: "planned",
        expectedDurationDays: 2,
        capturedAt: new Date("2026-09-10T12:00:00Z"),
        supersededAt: new Date("2026-09-11T12:00:00Z"),
        createdAt: new Date("2026-09-10T12:00:00Z"),
        updatedAt: new Date("2026-09-11T12:00:00Z"),
      },
      {
        jobId: job.id,
        businessId: scopedBusiness.id,
        componentKey: "siding",
        componentInstanceKey: "siding:unspecified",
        componentLabel: "Siding",
        variant: null,
        sourceServiceIds: [service.id],
        sourceServices: sourceService,
        snapshotVersion: 2,
        status: "in_progress",
        expectedDurationDays: 3,
        capturedAt: new Date("2026-09-11T12:00:00Z"),
        supersededAt: null,
        createdAt: new Date("2026-09-11T12:00:00Z"),
        updatedAt: new Date("2026-09-11T12:00:00Z"),
      },
    ])
    .returning({ id: jobProductionComponentsTable.id });
  fixture.componentIds = [oldRow.id, currentRow.id];

  return fixture;
}

async function cleanupFixture(fixture: Partial<Fixture>) {
  if (fixture.componentIds?.length) {
    await db.delete(jobProductionComponentsTable)
      .where(inArray(jobProductionComponentsTable.id, fixture.componentIds));
  }
  if (fixture.jobId != null) {
    await db.delete(jobsTable).where(eq(jobsTable.id, fixture.jobId));
  }
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  let fixture: Partial<Fixture> = {};
  let sessionId: string | undefined;
  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;

  try {
    fixture = await createFixture();
    console.log(`Created production component fixture job ${fixture.jobId}`);

    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1200 });
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem("buildpro_selection_mode", "all");
    });
    await page.setRequestInterception(true);
    page.on("request", (request: HTTPRequest) => {
      const method = request.method().toUpperCase();
      if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
        void request.continue();
        return;
      }
      blockedWrites.push(`${method} ${request.url()}`);
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
    await waitForText(page, JOB_TITLE);
    await clickJobCardButton(page, JOB_TITLE, "Open Job Card");
    await page.waitForSelector('select[aria-label="Siding status"]', { timeout: 30_000 });

    const currentStatus = await page.$eval(
      'select[aria-label="Siding status"]',
      element => ({
        value: (element as HTMLSelectElement).value,
        disabled: (element as HTMLSelectElement).disabled,
      }),
    );
    recordResult(
      "Current production component exposes its status selector",
      currentStatus.value === "in_progress" && !currentStatus.disabled,
      `value=${currentStatus.value} disabled=${currentStatus.disabled}`,
    );

    await clickJobCardButton(page, JOB_TITLE, "View history");
    await page.waitForFunction(
      title => Array.from(document.querySelectorAll("h3"))
        .some(heading => heading.textContent?.trim() === title
          && Array.from(heading.closest("div")?.parentElement?.parentElement?.parentElement?.querySelectorAll("button") ?? [])
            .some(button => button.textContent?.trim() === "Hide history")),
      { timeout: 30_000 },
      JOB_TITLE,
    );
    await waitForText(page, "SNAPSHOT HISTORY");
    const historyView = await page.evaluate(title => {
      const heading = Array.from(document.querySelectorAll("h3"))
        .find(candidate => candidate.textContent?.trim() === title);
      if (!heading) return null;
      let card: HTMLElement | null = heading.parentElement;
      while (card && !card.querySelector('select[aria-label="Siding status"]')) {
        card = card.parentElement;
      }
      const historyHeading = card
        ? Array.from(card.querySelectorAll("div"))
          .reverse()
          .find(candidate => candidate.textContent?.trim() === "Snapshot history")
        : null;
      const historyPanel = historyHeading?.parentElement?.parentElement;
      const supersededRow = historyPanel
        ? Array.from(historyPanel.querySelectorAll("div"))
          .filter(candidate => {
            const text = candidate.textContent ?? "";
            return text.includes("Version 1")
              && text.includes("Superseded")
              && text.includes("Source services");
          })
          .sort((a, b) => (a.textContent?.length ?? 0) - (b.textContent?.length ?? 0))[0]
        : null;
      return {
        currentSelectorCount: card?.querySelectorAll('select[aria-label="Siding status"]').length ?? 0,
        supersededRowSelectCount: supersededRow?.querySelectorAll("select").length ?? -1,
        text: historyPanel?.textContent ?? "",
      };
    }, JOB_TITLE);

    recordResult(
      "Snapshot history shows current and superseded state without historical controls",
      historyView != null
        && historyView.currentSelectorCount === 1
        && historyView.supersededRowSelectCount === 0
        && historyView.text.includes("Version 2")
        && historyView.text.includes("Version 1")
        && historyView.text.includes("Current")
        && historyView.text.includes("Superseded")
        && historyView.text.includes("Captured")
        && historyView.text.includes("Source services"),
      historyView
        ? `superseded row selects=${historyView.supersededRowSelectCount}`
        : "history panel not found",
    );
    await page.screenshot({ path: `${SHOTS}/01-production-component-history.png`, fullPage: true });

    const scopedHistory = await page.evaluate(async ({ jobId, businessId, otherBusinessId }) => {
      const scopedResponse = await fetch(`/api/jobs/${jobId}/production-components/history?businessId=${businessId}`);
      const otherResponse = await fetch(`/api/jobs/${jobId}/production-components/history?businessId=${otherBusinessId}`);
      return {
        scopedStatus: scopedResponse.status,
        scopedBody: await scopedResponse.text(),
        otherStatus: otherResponse.status,
      };
    }, {
      jobId: fixture.jobId,
      businessId: fixture.scopedBusinessId,
      otherBusinessId: fixture.otherBusinessId,
    });
    recordResult(
      "Production component history remains scoped to the selected business",
      scopedHistory.scopedStatus === 200
        && scopedHistory.scopedBody.includes('"snapshotVersion":2')
        && scopedHistory.scopedBody.includes('"snapshotVersion":1')
        && scopedHistory.otherStatus === 404,
      `selected=${scopedHistory.scopedStatus} other=${scopedHistory.otherStatus}`,
    );
    recordResult(
      "Browser writes stayed denied during this read-only regression",
      blockedWrites.length === 0,
      blockedWrites.length ? blockedWrites.join(", ") : "no browser writes",
    );
  } finally {
    if (browser) await browser.close();
    if (sessionId) await deleteSession(sessionId);
    await cleanupFixture(fixture);
  }

  const failures = results.filter(result => !result.pass);
  if (failures.length > 0 || blockedWrites.length > 0) {
    throw new Error(
      `Job Production Components E2E failed: ${failures.map(result => result.name).join(", ") || "unexpected browser writes"}`,
    );
  }
  console.log(`Job Production Components E2E passed (${results.length} checks)`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});