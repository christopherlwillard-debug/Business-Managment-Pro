/* Authenticated browser regression check for the all-business Production
 * Intelligence benchmark-review flow.
 *
 * Run:
 *   pnpm --filter @workspace/api-server run verify:production-reviews
 *
 * The fixture is isolated in the development database. Browser requests are
 * default-deny for all non-read methods; only the review mutations exercised
 * by this verifier are allowed through.
 */
import fs from "node:fs";
import type { HTTPRequest, Page } from "puppeteer";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import {
  db,
  businessesTable,
  jobDailyPresenceTable,
  jobTypeBenchmarkRevisionsTable,
  jobTypeBenchmarksTable,
  jobsTable,
  mfhConstructionTypesTable,
  mfhManufacturersTable,
  mfhModelsTable,
  productionServiceTypesTable,
} from "@workspace/db";
import { createTestLoginProof, deleteSession, SESSION_COOKIE } from "../src/lib/auth";
import { launchBrowser } from "../src/lib/launchBrowser";

const BASE = process.env.BUILDPRO_E2E_BASE_URL ?? "http://localhost:80";
const SHOTS = "/tmp/e2e-mfh-production-reviews";

if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
  throw new Error("Refusing to run Production Reviews E2E verification against a production deployment");
}

const baseUrl = new URL(BASE);
const baseHostname = baseUrl.hostname.replace(/^\[|\]$/g, "");
if (baseUrl.protocol !== "http:" || !["localhost", "127.0.0.1", "::1"].includes(baseHostname)) {
  throw new Error(
    `Refusing to run Production Reviews E2E verification against non-local target ${baseUrl.origin}. ` +
    "Set BUILDPRO_E2E_BASE_URL to a local development server.",
  );
}

type Fixture = {
  modelId: number;
  benchmarkId: number;
  jobIds: number[];
  excludedJobId: number;
  noPresenceJobId: number;
  modelName: string;
  benchmarkHours: string;
};

const results: { name: string; pass: boolean; detail?: string }[] = [];
const browserWrites: string[] = [];
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

async function clickButton(page: Page, label: string) {
  await page.waitForFunction(
    expected => Array.from(document.querySelectorAll("button"))
      .some(button => button.textContent?.trim() === expected && !(button as HTMLButtonElement).disabled),
    { timeout: 30_000 },
    label,
  );
  await page.evaluate(expected => {
    const button = Array.from(document.querySelectorAll("button"))
      .find(candidate => candidate.textContent?.trim() === expected) as HTMLButtonElement | undefined;
    if (!button) throw new Error(`Could not find button: ${expected}`);
    button.click();
  }, label);
}

async function fillInput(page: Page, selector: string, value: string) {
  await page.waitForSelector(selector, { timeout: 15_000 });
  await page.click(selector, { clickCount: 3 });
  await page.type(selector, value);
}

async function createFixture(): Promise<Fixture> {
  const partial: Partial<Fixture> = {};
  try {
    const [business] = await db
    .select({ id: businessesTable.id, slug: businessesTable.slug })
    .from(businessesTable)
    .where(eq(businessesTable.slug, "general_contracting"))
    .limit(1);
    if (!business) throw new Error("The General Contracting business fixture is missing");

    const [constructionType] = await db
    .select({ id: mfhConstructionTypesTable.id })
    .from(mfhConstructionTypesTable)
    .limit(1);
    const [manufacturer] = await db
    .select({ id: mfhManufacturersTable.id })
    .from(mfhManufacturersTable)
    .where(eq(mfhManufacturersTable.active, true))
    .limit(1);
    const [service] = await db
    .select({ id: productionServiceTypesTable.id })
    .from(productionServiceTypesTable)
    .where(and(
      eq(productionServiceTypesTable.active, true),
      eq(productionServiceTypesTable.appliesTo, "production"),
      isNotNull(productionServiceTypesTable.itemKey),
    ))
    .limit(1);
    if (!constructionType || !manufacturer || !service) {
      throw new Error("Required MFH fixture catalog rows are missing");
    }

    const suffix = `${Date.now()}-${process.pid}`;
    const modelName = `E2E Review Model ${suffix}`;
    const jobType = `E2E Review Benchmark ${suffix}`;
    const benchmarkHours = "10.00";

    const [benchmark] = await db.insert(jobTypeBenchmarksTable).values({
      jobType,
      estimatedHours: benchmarkHours,
    }).returning({ id: jobTypeBenchmarksTable.id });
    if (!benchmark) throw new Error("Failed to create benchmark fixture");
    partial.benchmarkId = benchmark.id;

    const [model] = await db.insert(mfhModelsTable).values({
      manufacturerId: manufacturer.id,
      name: modelName,
      constructionTypeId: constructionType.id,
      benchmarkId: benchmark.id,
      active: true,
    }).returning({ id: mfhModelsTable.id });
    if (!model) throw new Error("Failed to create model fixture");
    partial.modelId = model.id;

    const jobs = await db.insert(jobsTable).values([1, 2, 3, 4, 5].map(index => ({
      title: index === 4
        ? `${modelName} Excluded Job`
        : index === 5
          ? `${modelName} No Presence Job`
          : `${modelName} Job ${index}`,
      status: "completed",
      businessId: business.id,
      businessLine: business.slug,
      workflow: "mh_production",
      mfhModelId: model.id,
      mhProductionServices: [service.id],
      startDate: index === 4 ? "2025-01-21" : index === 5 ? "2025-01-24" : `2025-01-0${index}`,
      endDate: index === 4 ? "2025-01-23" : index === 5 ? "2025-01-25" : `2025-01-0${index}`,
    }))).returning({ id: jobsTable.id });
    if (jobs.length !== 5) throw new Error("Failed to create all job fixtures");
    partial.jobIds = jobs.map(job => job.id);
    partial.excludedJobId = jobs[3].id;
    partial.noPresenceJobId = jobs[4].id;

    await db.insert(jobDailyPresenceTable).values([
      ...jobs.slice(0, 3).map((job, index) => ({
      jobId: job.id,
      date: `2025-01-1${index + 1}`,
      state: "here",
      source: "manual_presence",
      provenance: "confirmed",
      })),
      {
        jobId: jobs[3].id,
        date: "2025-01-21",
        state: "not_here",
        notHereReason: "weather",
        notes: "Rain delay before the first workday",
        source: "manual_presence",
        provenance: "confirmed",
      },
      {
        jobId: jobs[3].id,
        date: "2025-01-22",
        state: "unrecorded",
        source: "manual_presence",
        provenance: "confirmed",
      },
      {
        jobId: jobs[3].id,
        date: "2025-01-23",
        state: "here",
        source: "job_schedule",
        provenance: "inferred",
      },
    ]);

    return {
      modelId: model.id,
      benchmarkId: benchmark.id,
      jobIds: jobs.map(job => job.id),
      excludedJobId: jobs[3].id,
      noPresenceJobId: jobs[4].id,
      modelName,
      benchmarkHours,
    };
  } catch (error) {
    await cleanupFixture(partial);
    throw error;
  }
}

async function cleanupFixture(fixture: Partial<Fixture>) {
  if (fixture.jobIds?.length) {
    await db.delete(jobDailyPresenceTable).where(inArray(jobDailyPresenceTable.jobId, fixture.jobIds));
    await db.delete(jobsTable).where(inArray(jobsTable.id, fixture.jobIds));
  }
  if (fixture.modelId != null) {
    await db.delete(jobTypeBenchmarkRevisionsTable)
      .where(eq(jobTypeBenchmarkRevisionsTable.mfhModelId, fixture.modelId));
    await db.delete(mfhModelsTable).where(eq(mfhModelsTable.id, fixture.modelId));
  }
  if (fixture.benchmarkId != null) {
    await db.delete(jobTypeBenchmarksTable).where(eq(jobTypeBenchmarksTable.id, fixture.benchmarkId));
  }
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  let fixture: Partial<Fixture> = {};
  let sessionId: string | undefined;
  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;

  try {
    fixture = await createFixture();
    console.log(`Created isolated benchmark-review fixture for model ${fixture.modelName} (${fixture.modelId})`);

    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1200 });
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem("buildpro_selection_mode", "all");
    });
    await page.setRequestInterception(true);
    page.on("dialog", dialog => void dialog.accept());
    page.on("request", (request: HTTPRequest) => {
      const url = new URL(request.url());
      const method = request.method().toUpperCase();
      const path = url.pathname;
      const reviewPath = `/api/mfh/knowledge-base/${fixture.modelId}/production-reviews`;
      const isExpectedReviewWrite = (
        (method === "POST" && path === reviewPath)
        || (method === "PATCH" && new RegExp(`^${reviewPath}/\\d+/(approve|reject)$`).test(path))
      );

      if (isExpectedReviewWrite) {
        browserWrites.push(`${method} ${path}`);
        void request.continue();
        return;
      }
      if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
        void request.continue();
        return;
      }

      blockedWrites.push(`${method} ${path}`);
      void request.abort("blockedbyclient");
    });

    const returnTo = "/mfh-homes";
    const proof = createTestLoginProof(returnTo);
    const loginParams = new URLSearchParams({ returnTo, ...proof });
    await page.goto(`${BASE}/api/dev-test-login?${loginParams}`, {
      waitUntil: "networkidle2",
      timeout: 60_000,
    });
    sessionId = (await page.cookies()).find(cookie => cookie.name === SESSION_COOKIE)?.value;
    if (!sessionId) throw new Error("Development login did not create a session cookie");

    await page.goto(`${BASE}/mfh-homes`, { waitUntil: "networkidle2", timeout: 60_000 });
    await waitForText(page, fixture.modelName);
    await page.evaluate(expected => {
      const row = Array.from(document.querySelectorAll("tr"))
        .find(candidate => candidate.textContent?.includes(expected)) as HTMLTableRowElement | undefined;
      if (!row) throw new Error(`Could not find model row: ${expected}`);
      row.click();
    }, fixture.modelName);
    await waitForText(page, "Observed Production History");
    await waitForText(page, "Benchmark review");
    const beforeObservationRead = {
      benchmark: await db.select({ estimatedHours: jobTypeBenchmarksTable.estimatedHours })
        .from(jobTypeBenchmarksTable)
        .where(eq(jobTypeBenchmarksTable.id, fixture.benchmarkId!))
        .limit(1),
      jobs: await db.select({
        id: jobsTable.id,
        status: jobsTable.status,
        startDate: jobsTable.startDate,
        endDate: jobsTable.endDate,
        workflow: jobsTable.workflow,
        mhProductionServices: jobsTable.mhProductionServices,
      }).from(jobsTable).where(inArray(jobsTable.id, fixture.jobIds!)).orderBy(jobsTable.id),
      presence: await db.select({
        jobId: jobDailyPresenceTable.jobId,
        date: jobDailyPresenceTable.date,
        state: jobDailyPresenceTable.state,
        notHereReason: jobDailyPresenceTable.notHereReason,
        notes: jobDailyPresenceTable.notes,
        provenance: jobDailyPresenceTable.provenance,
      }).from(jobDailyPresenceTable).where(inArray(jobDailyPresenceTable.jobId, fixture.jobIds!)).orderBy(jobDailyPresenceTable.jobId, jobDailyPresenceTable.date),
    };

    await clickButton(page, "Why this observation?");
    const excludedEvidence = await page.$eval(
      `#mfh-evidence-job-${fixture.excludedJobId}`,
      element => element.textContent ?? "",
    );
    recordResult(
      "Excluded job evidence shows confirmed not-here provenance",
      excludedEvidence.includes("Excluded Job")
        && excludedEvidence.includes("01/21/2025")
        && excludedEvidence.includes("Weather")
        && excludedEvidence.includes("Rain delay before the first workday")
        && excludedEvidence.includes("No confirmed here record was recorded"),
    );
    recordResult(
      "Excluded evidence does not promote inferred or unrecorded rows",
      !excludedEvidence.includes("01/22/2025")
        && !excludedEvidence.includes("01/23/2025")
        && excludedEvidence.includes("Unrecorded or inferred rows are not treated as here or not here"),
    );
    const noPresenceEvidence = await page.$eval(
      `#mfh-evidence-job-${fixture.noPresenceJobId}`,
      element => element.textContent ?? "",
    );
    recordResult(
      "Job with no presence rows stays separate from recorded delays",
      noPresenceEvidence.includes("No Presence Job")
        && noPresenceEvidence.includes("Confirmed here: None recorded")
        && noPresenceEvidence.includes("Confirmed not here: None recorded")
        && noPresenceEvidence.includes("No confirmed here record was recorded")
        && !noPresenceEvidence.includes("01/24/2025")
        && !noPresenceEvidence.includes("01/25/2025")
        && !noPresenceEvidence.includes("Weather")
        && !noPresenceEvidence.includes("Rain delay"),
    );
    recordResult(
      "Excluded evidence links to the source job",
      await page.$eval(
        `#mfh-evidence-job-${fixture.excludedJobId}`,
        element => (element.closest("a") as HTMLAnchorElement | null)?.getAttribute("href") ?? "",
      ) === `/jobs?openJob=${fixture.excludedJobId}`,
    );
    const afterObservationRead = {
      benchmark: await db.select({ estimatedHours: jobTypeBenchmarksTable.estimatedHours })
        .from(jobTypeBenchmarksTable)
        .where(eq(jobTypeBenchmarksTable.id, fixture.benchmarkId!))
        .limit(1),
      jobs: await db.select({
        id: jobsTable.id,
        status: jobsTable.status,
        startDate: jobsTable.startDate,
        endDate: jobsTable.endDate,
        workflow: jobsTable.workflow,
        mhProductionServices: jobsTable.mhProductionServices,
      }).from(jobsTable).where(inArray(jobsTable.id, fixture.jobIds!)).orderBy(jobsTable.id),
      presence: await db.select({
        jobId: jobDailyPresenceTable.jobId,
        date: jobDailyPresenceTable.date,
        state: jobDailyPresenceTable.state,
        notHereReason: jobDailyPresenceTable.notHereReason,
        notes: jobDailyPresenceTable.notes,
        provenance: jobDailyPresenceTable.provenance,
      }).from(jobDailyPresenceTable).where(inArray(jobDailyPresenceTable.jobId, fixture.jobIds!)).orderBy(jobDailyPresenceTable.jobId, jobDailyPresenceTable.date),
    };
    recordResult(
      "Reading excluded evidence does not write production or benchmark data",
      JSON.stringify(afterObservationRead) === JSON.stringify(beforeObservationRead)
        && blockedWrites.length === 0
        && browserWrites.length === 0,
      blockedWrites.length ? blockedWrites.join(", ") : "database snapshots unchanged",
    );
    await page.setViewport({ width: 390, height: 844 });
    const narrowEvidence = await page.$eval(
      `#mfh-evidence-job-${fixture.excludedJobId}`,
      element => {
        const rect = element.getBoundingClientRect();
        const link = element.closest("a") as HTMLAnchorElement | null;
        const linkRect = link?.getBoundingClientRect() ?? null;
        return {
          text: element.textContent ?? "",
          evidenceLeft: rect.left,
          evidenceRight: rect.right,
          evidenceWidth: rect.width,
          evidenceHeight: rect.height,
          evidenceScrollWidth: element.scrollWidth,
          evidenceClientWidth: element.clientWidth,
          linkHref: link?.getAttribute("href") ?? "",
          linkWidth: linkRect?.width ?? 0,
          linkHeight: linkRect?.height ?? 0,
        };
      },
    );
    recordResult(
      "Excluded provenance remains readable at a narrow viewport",
      narrowEvidence.evidenceLeft >= 0
        && narrowEvidence.evidenceRight <= 390
        && narrowEvidence.evidenceWidth > 0
        && narrowEvidence.evidenceHeight > 0
        && narrowEvidence.evidenceScrollWidth <= narrowEvidence.evidenceClientWidth + 1
        && narrowEvidence.linkWidth > 0
        && narrowEvidence.linkHeight > 0
        && narrowEvidence.linkHref === `/jobs?openJob=${fixture.excludedJobId}`
        && narrowEvidence.text.includes("01/21/2025")
        && narrowEvidence.text.includes("Weather")
        && narrowEvidence.text.includes("Rain delay before the first workday")
        && narrowEvidence.text.includes("No confirmed here record was recorded"),
      JSON.stringify(narrowEvidence),
    );
    const narrowNoPresenceEvidence = await page.$eval(
      `#mfh-evidence-job-${fixture.noPresenceJobId}`,
      element => {
        const rect = element.getBoundingClientRect();
        const link = element.closest("a") as HTMLAnchorElement | null;
        const linkRect = link?.getBoundingClientRect() ?? null;
        return {
          text: element.textContent ?? "",
          evidenceLeft: rect.left,
          evidenceRight: rect.right,
          evidenceWidth: rect.width,
          evidenceHeight: rect.height,
          evidenceScrollWidth: element.scrollWidth,
          evidenceClientWidth: element.clientWidth,
          linkHref: link?.getAttribute("href") ?? "",
          linkWidth: linkRect?.width ?? 0,
          linkHeight: linkRect?.height ?? 0,
        };
      },
    );
    recordResult(
      "No-presence evidence remains readable at a narrow viewport",
      narrowNoPresenceEvidence.evidenceLeft >= 0
        && narrowNoPresenceEvidence.evidenceRight <= 390
        && narrowNoPresenceEvidence.evidenceWidth > 0
        && narrowNoPresenceEvidence.evidenceHeight > 0
        && narrowNoPresenceEvidence.evidenceScrollWidth <= narrowNoPresenceEvidence.evidenceClientWidth + 1
        && narrowNoPresenceEvidence.linkWidth > 0
        && narrowNoPresenceEvidence.linkHeight > 0
        && narrowNoPresenceEvidence.linkHref === `/jobs?openJob=${fixture.noPresenceJobId}`
        && narrowNoPresenceEvidence.text.includes("Confirmed here: None recorded")
        && narrowNoPresenceEvidence.text.includes("Confirmed not here: None recorded")
        && narrowNoPresenceEvidence.text.includes("No confirmed here record was recorded")
        && !narrowNoPresenceEvidence.text.includes("01/24/2025")
        && !narrowNoPresenceEvidence.text.includes("01/25/2025")
        && !narrowNoPresenceEvidence.text.includes("Weather")
        && !narrowNoPresenceEvidence.text.includes("Rain delay"),
      JSON.stringify(narrowNoPresenceEvidence),
    );
    await page.screenshot({ path: `${SHOTS}/03-narrow-provenance.png`, fullPage: true });
    await page.setViewport({ width: 1440, height: 1200 });
    recordResult(
      "All-business Knowledge Center opens the benchmark review panel",
      await page.$eval("body", body => body.innerText.includes("Benchmark review"))
        && !await page.$eval("body", body => body.innerText.includes("Benchmark review is available from the all-business view only")),
    );
    await page.screenshot({ path: `${SHOTS}/01-review-panel.png`, fullPage: true });

    await clickButton(page, "Review baseline");
    await fillInput(page, 'input[type="number"]', "26");
    const createFirstResponse = page.waitForResponse(response =>
      response.request().method() === "POST" && response.url().includes(`/api/mfh/knowledge-base/${fixture.modelId}/production-reviews`),
    );
    await clickButton(page, "Create pending review");
    const firstResponse = await createFirstResponse;
    const firstReview = await firstResponse.json() as { id: number; sourceJobIds: number[] };
    const eligibleSourceJobIds = fixture.jobIds.filter(
      jobId => jobId !== fixture.excludedJobId && jobId !== fixture.noPresenceJobId,
    );
    recordResult(
      "Sufficient evidence creates a pending review",
      firstResponse.status() === 201 && Number.isInteger(firstReview.id),
    );
    recordResult(
      "Pending review sources include only eligible jobs",
      JSON.stringify(firstReview.sourceJobIds) === JSON.stringify(eligibleSourceJobIds)
        && !firstReview.sourceJobIds.includes(fixture.excludedJobId)
        && !firstReview.sourceJobIds.includes(fixture.noPresenceJobId),
      `sourceJobIds=${JSON.stringify(firstReview.sourceJobIds)}`,
    );
    await waitForText(page, "Pending approval: 26.0 hours");

    const rejectResponse = page.waitForResponse(response =>
      response.request().method() === "PATCH" && response.url().endsWith(`/production-reviews/${firstReview.id}/reject`),
    );
    await clickButton(page, "Reject");
    const rejected = await rejectResponse;
    await waitForText(page, "Baseline review rejected");
    recordResult(
      "Rejecting a review leaves the active benchmark unchanged",
      rejected.status() === 200
        && await page.$eval("body", body => body.innerText.includes("Existing benchmark: 10.0 hours")),
    );
    await clickButton(page, "Rejected 26.0 hours · 3 jobs");
    const rejectedSourceLabels = await page.$$eval(
      'button[title="Show this job in production evidence"]',
      buttons => buttons.map(button => button.textContent?.trim() ?? ""),
    );
    recordResult(
      "Review history links only eligible source jobs",
      rejectedSourceLabels.length === eligibleSourceJobIds.length
        && eligibleSourceJobIds.every(jobId => rejectedSourceLabels.some(label => label.startsWith(`Job #${jobId} ·`)))
        && !rejectedSourceLabels.some(label => label.startsWith(`Job #${fixture.excludedJobId} ·`))
        && !rejectedSourceLabels.some(label => label.startsWith(`Job #${fixture.noPresenceJobId} ·`)),
      JSON.stringify(rejectedSourceLabels),
    );
    recordResult(
      "No-presence job remains traceable as evidence only",
      await page.$eval(
        `#mfh-evidence-job-${fixture.noPresenceJobId}`,
        element => element.textContent?.includes("No Presence Job") ?? false,
      )
        && await page.$eval(
          `#mfh-evidence-job-${fixture.noPresenceJobId}`,
          element => (element.closest("a") as HTMLAnchorElement | null)?.getAttribute("href") ?? "",
        ) === `/jobs?openJob=${fixture.noPresenceJobId}`,
      `source link=/jobs?openJob=${fixture.noPresenceJobId}`,
    );

    await clickButton(page, "Review baseline");
    await fillInput(page, 'input[type="number"]', "26");
    const createSecondResponse = page.waitForResponse(response =>
      response.request().method() === "POST" && response.url().includes(`/api/mfh/knowledge-base/${fixture.modelId}/production-reviews`),
    );
    await clickButton(page, "Create pending review");
    const secondResponse = await createSecondResponse;
    const secondReview = await secondResponse.json() as { id: number };
    await waitForText(page, "Pending approval: 26.0 hours");

    const approveResponse = page.waitForResponse(response =>
      response.request().method() === "PATCH" && response.url().endsWith(`/production-reviews/${secondReview.id}/approve`),
    );
    await clickButton(page, "Approve");
    const approved = await approveResponse;
    const approvedBody = await approved.text();
    await waitForText(page, "Production benchmark approved");
    await waitForText(page, "Existing benchmark: 26.0 hours");
    recordResult(
      "A fresh review can be approved",
      approved.status() === 200
        && await page.$eval("body", body => body.innerText.includes("Existing benchmark: 26.0 hours")),
      `status=${approved.status()} response=${approvedBody.includes('"status":"approved') ? "approved" : approvedBody}`,
    );

    await clickButton(page, "Review baseline");
    await fillInput(page, 'input[type="number"]', "30");
    const createStaleResponse = page.waitForResponse(response =>
      response.request().method() === "POST" && response.url().includes(`/api/mfh/knowledge-base/${fixture.modelId}/production-reviews`),
    );
    await clickButton(page, "Create pending review");
    const staleCreated = await createStaleResponse;
    const staleReview = await staleCreated.json() as { id: number };
    await waitForText(page, "Pending approval: 30.0 hours");

    await db.update(jobTypeBenchmarksTable)
      .set({ estimatedHours: "31.00" })
      .where(eq(jobTypeBenchmarksTable.id, fixture.benchmarkId!));

    const staleApproveResponse = page.waitForResponse(response =>
      response.request().method() === "PATCH" && response.url().endsWith(`/production-reviews/${staleReview.id}/approve`),
    );
    await clickButton(page, "Approve");
    const staleResponse = await staleApproveResponse;
    await waitForText(page, "Could not approve benchmark");
    recordResult(
      "Stale benchmark update is visible to the reviewer",
      staleResponse.status() === 409
        && await page.$eval("body", body => body.innerText.includes("Benchmark changed after this review was created")),
    );
    recordResult(
      "Browser writes stayed within the review allowlist",
      blockedWrites.length === 0,
      blockedWrites.length ? blockedWrites.join(", ") : `${browserWrites.length} allowed review writes`,
    );
    await page.screenshot({ path: `${SHOTS}/02-stale-review.png`, fullPage: true });
  } finally {
    if (browser) await browser.close();
    if (sessionId) await deleteSession(sessionId);
    await cleanupFixture(fixture);
  }

  const failures = results.filter(result => !result.pass);
  if (failures.length > 0 || blockedWrites.length > 0) {
    throw new Error(
      `Production Reviews E2E failed: ${failures.map(result => result.name).join(", ") || "unexpected browser writes"}`,
    );
  }
  console.log(`Production Reviews E2E passed (${results.length} checks)`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});