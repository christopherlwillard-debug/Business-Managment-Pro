/* Authenticated browser release check for business-scoped MFH component
 * baseline reviews.
 *
 * Run:
 *   pnpm --filter @workspace/api-server run verify:component-baseline-reviews
 *
 * The fixture is isolated in the development database. Browser requests are
 * default-deny for all non-read methods; only component-review mutations are
 * allowed through.
 */
import fs from "node:fs";
import type { HTTPRequest, Page } from "puppeteer";
import { eq, inArray } from "drizzle-orm";
import {
  businessesTable,
  db,
  jobComponentWorkSessionsTable,
  jobDailyPresenceTable,
  jobProductionComponentsTable,
  jobsTable,
  mfhComponentBaselineRevisionsTable,
  mfhConstructionTypesTable,
  mfhManufacturersTable,
  mfhModelsTable,
  productionServiceTypesTable,
} from "@workspace/db";
import { createTestLoginProof, deleteSession, SESSION_COOKIE } from "../src/lib/auth";
import { launchBrowser } from "../src/lib/launchBrowser";

const BASE = process.env.BUILDPRO_E2E_BASE_URL ?? "http://localhost:80";
const SHOTS = "/tmp/e2e-mfh-component-baseline-reviews";
const LEARNING_KEY = "siding";

if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
  throw new Error("Refusing to run component baseline review verification in production");
}

const baseUrl = new URL(BASE);
const baseHostname = baseUrl.hostname.replace(/^\[|\]$/g, "");
if (baseUrl.protocol !== "http:" || !["localhost", "127.0.0.1", "::1"].includes(baseHostname)) {
  throw new Error(`Refusing to run component baseline review verification against ${baseUrl.origin}`);
}

type Fixture = {
  businessId: number;
  modelId: number;
  modelName: string;
  serviceId: number;
  jobIds: number[];
  componentIds: number[];
  sessionIds: number[];
};

type ReviewResponse = {
  id: number;
  status: "pending" | "approved" | "rejected" | "superseded";
  sampleSize: number;
  sourceJobIds: number[];
  sourceEvidence: {
    businessId: number;
    learningKey: string;
    jobs: Array<{
      jobId: number;
      snapshotEvidence: Array<{
        snapshotId: number;
        snapshotVersion: number;
        sessionIds: number[];
      }>;
    }>;
  };
};

const results: Array<{ name: string; pass: boolean; detail?: string }> = [];
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

async function replaceInput(page: Page, selector: string, value: string) {
  await page.waitForSelector(selector, { timeout: 30_000 });
  await page.click(selector, { clickCount: 3 });
  await page.type(selector, value);
}

async function click(page: Page, selector: string) {
  await page.waitForSelector(selector, { timeout: 30_000, visible: true });
  await page.click(selector);
}

async function createFixture(): Promise<Fixture> {
  const partial: Partial<Fixture> = {};
  try {
    const [business] = await db.select({
      id: businessesTable.id,
      slug: businessesTable.slug,
    }).from(businessesTable)
      .where(eq(businessesTable.slug, "general_contracting"))
      .limit(1);
    const [constructionType] = await db.select({ id: mfhConstructionTypesTable.id })
      .from(mfhConstructionTypesTable)
      .limit(1);
    const [manufacturer] = await db.select({ id: mfhManufacturersTable.id })
      .from(mfhManufacturersTable)
      .where(eq(mfhManufacturersTable.active, true))
      .limit(1);
    if (!business || !constructionType || !manufacturer) {
      throw new Error("Required MFH component baseline fixture catalog rows are missing");
    }

    partial.businessId = business.id;
    const suffix = `${Date.now()}-${process.pid}`;
    const [service] = await db.insert(productionServiceTypesTable).values({
      businessId: business.id,
      itemKey: "siding",
      name: `E2E Siding ${suffix}`,
      billingType: "Fixed",
      category: "Exterior",
      appliesTo: "production",
      active: true,
    }).returning({
      id: productionServiceTypesTable.id,
      name: productionServiceTypesTable.name,
      itemKey: productionServiceTypesTable.itemKey,
      category: productionServiceTypesTable.category,
      appliesTo: productionServiceTypesTable.appliesTo,
    });
    if (!service) throw new Error("Failed to create component baseline service fixture");
    partial.serviceId = service.id;
    const modelName = `E2E Component Baseline ${suffix}`;
    const [model] = await db.insert(mfhModelsTable).values({
      manufacturerId: manufacturer.id,
      name: modelName,
      constructionTypeId: constructionType.id,
      active: true,
    }).returning({ id: mfhModelsTable.id });
    if (!model) throw new Error("Failed to create component baseline model fixture");
    partial.modelId = model.id;
    partial.modelName = modelName;

    const jobs = await db.insert(jobsTable).values(
      [1, 2, 3, 4, 5].map(index => ({
        title: `${modelName} Job ${index}`,
        status: "completed",
        businessId: business.id,
        businessLine: business.slug,
        workflow: "mh_production",
        mfhModelId: model.id,
        mhProductionServices: [service.id],
        startDate: `2026-08-${String(index * 3).padStart(2, "0")}`,
        endDate: `2026-08-${String(index * 3 + 1).padStart(2, "0")}`,
      })),
    ).returning({ id: jobsTable.id });
    partial.jobIds = jobs.map(job => job.id);

    await db.insert(jobDailyPresenceTable).values(jobs.map((job, index) => ({
      jobId: job.id,
      date: `2026-08-${String(index * 3 + 1).padStart(2, "0")}`,
      state: "here",
      source: "manual_presence",
      provenance: "confirmed",
    })));

    const sourceServices = [{
      id: service.id,
      name: service.name,
      itemKey: service.itemKey,
      category: service.category,
      appliesTo: service.appliesTo,
    }];
    const components = await db.insert(jobProductionComponentsTable).values(
      jobs.map((job, index) => ({
        jobId: job.id,
        businessId: business.id,
        componentKey: "siding",
        componentInstanceKey: "siding:unspecified",
        componentLabel: "Siding",
        variant: null,
        sourceServiceIds: [service.id],
        sourceServices,
        snapshotVersion: 1,
        status: "completed",
        expectedDurationDays: 2,
        capturedAt: new Date(`2026-08-${String(index * 3 + 1).padStart(2, "0")}T12:00:00Z`),
      })),
    ).returning({ id: jobProductionComponentsTable.id, jobId: jobProductionComponentsTable.jobId });
    partial.componentIds = components.map(component => component.id);

    const componentByJobId = new Map(components.map(component => [component.jobId, component]));
    const sessions = await db.insert(jobComponentWorkSessionsTable).values(
      jobs.flatMap((job, index) => {
        const component = componentByJobId.get(job.id);
        if (!component) throw new Error(`Missing component fixture for job ${job.id}`);
        const firstDay = index * 3 + 1;
        return [0, 1].map(offset => ({
          jobId: job.id,
          productionComponentId: component.id,
          workDate: `2026-08-${String(firstDay + offset).padStart(2, "0")}`,
          workerName: "E2E Component Reviewer",
          actualHours: "8.00",
        }));
      }),
    ).returning({ id: jobComponentWorkSessionsTable.id });
    partial.sessionIds = sessions.map(session => session.id);

    return {
      businessId: business.id,
      modelId: model.id,
      modelName,
      serviceId: service.id,
      jobIds: jobs.map(job => job.id),
      componentIds: components.map(component => component.id),
      sessionIds: sessions.map(session => session.id),
    };
  } catch (error) {
    await cleanupFixture(partial);
    throw error;
  }
}

async function cleanupFixture(fixture: Partial<Fixture>) {
  if (fixture.modelId != null) {
    await db.delete(mfhComponentBaselineRevisionsTable)
      .where(eq(mfhComponentBaselineRevisionsTable.mfhModelId, fixture.modelId));
  }
  if (fixture.sessionIds?.length) {
    await db.delete(jobComponentWorkSessionsTable)
      .where(inArray(jobComponentWorkSessionsTable.id, fixture.sessionIds));
  }
  if (fixture.componentIds?.length) {
    await db.delete(jobProductionComponentsTable)
      .where(inArray(jobProductionComponentsTable.id, fixture.componentIds));
  }
  if (fixture.jobIds?.length) {
    await db.delete(jobDailyPresenceTable)
      .where(inArray(jobDailyPresenceTable.jobId, fixture.jobIds));
    await db.delete(jobsTable).where(inArray(jobsTable.id, fixture.jobIds));
  }
  if (fixture.modelId != null) {
    await db.delete(mfhModelsTable).where(eq(mfhModelsTable.id, fixture.modelId));
  }
  if (fixture.serviceId != null) {
    await db.delete(productionServiceTypesTable)
      .where(eq(productionServiceTypesTable.id, fixture.serviceId));
  }
}

async function createReview(page: Page, fixture: Fixture, days: string): Promise<ReviewResponse> {
  const componentSelector = `[data-testid="mfh-component-learning-${LEARNING_KEY}"]`;
  const proposeSelector = `[data-testid="mfh-component-baseline-propose-${LEARNING_KEY}"]`;
  const inputSelector = `[data-testid="mfh-component-baseline-days-${LEARNING_KEY}"]`;
  const createSelector = `[data-testid="mfh-component-baseline-create-${LEARNING_KEY}"]`;
  await click(page, proposeSelector);
  await replaceInput(page, inputSelector, days);
  const responsePromise = page.waitForResponse(response =>
    response.request().method() === "POST"
    && response.url().includes(`/api/mfh/knowledge-base/${fixture.modelId}/component-baseline-reviews`),
  );
  await click(page, createSelector);
  const response = await responsePromise;
  const body = await response.json() as ReviewResponse;
  await page.waitForSelector(`${componentSelector} [data-review-id="${body.id}"]`, { timeout: 30_000 });
  return body;
}

async function decideReview(
  page: Page,
  fixture: Fixture,
  reviewId: number,
  action: "approve" | "reject",
) {
  const responsePromise = page.waitForResponse(response =>
    response.request().method() === "PATCH"
    && response.url().includes(`/component-baseline-reviews/${reviewId}/${action}`),
  );
  await click(page, `[data-testid="mfh-component-baseline-${action}-${LEARNING_KEY}"]`);
  return responsePromise;
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  let fixture: Partial<Fixture> = {};
  let sessionId: string | undefined;
  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;

  try {
    fixture = await createFixture();
    const completeFixture = fixture as Fixture;
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1200 });
    await page.evaluateOnNewDocument((businessId) => {
      localStorage.setItem("buildpro_selection_mode", String(businessId));
    }, completeFixture.businessId);
    await page.setRequestInterception(true);
    page.on("dialog", dialog => void dialog.accept());
    page.on("request", (request: HTTPRequest) => {
      const method = request.method().toUpperCase();
      const path = new URL(request.url()).pathname;
      const reviewPath = `/api/mfh/knowledge-base/${completeFixture.modelId}/component-baseline-reviews`;
      const expectedWrite = (
        (method === "POST" && path === reviewPath)
        || (method === "PATCH" && new RegExp(`^${reviewPath}/\\d+/(approve|reject)$`).test(path))
      );
      if (expectedWrite) {
        browserWrites.push(`${method} ${path}`);
        void request.continue();
      } else if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
        void request.continue();
      } else {
        blockedWrites.push(`${method} ${path}`);
        void request.abort("blockedbyclient");
      }
    });

    const returnTo = "/mfh-homes";
    const proof = createTestLoginProof(returnTo);
    await page.goto(`${BASE}/api/dev-test-login?${new URLSearchParams({ returnTo, ...proof })}`, {
      waitUntil: "networkidle2",
      timeout: 60_000,
    });
    sessionId = (await page.cookies()).find(cookie => cookie.name === SESSION_COOKIE)?.value;
    if (!sessionId) throw new Error("Development login did not create a session cookie");

    await page.goto(`${BASE}/mfh-homes`, { waitUntil: "networkidle2", timeout: 60_000 });
    await waitForText(page, completeFixture.modelName);
    await page.evaluate((modelName) => {
      const row = Array.from(document.querySelectorAll("tr"))
        .find(candidate => candidate.textContent?.includes(modelName)) as HTMLTableRowElement | undefined;
      if (!row) throw new Error(`Could not find model row: ${modelName}`);
      row.click();
    }, completeFixture.modelName);
    await waitForText(page, "Component production-day learning");
    await click(page, `[data-testid="mfh-component-learning-${LEARNING_KEY}"] > button`);

    const rejected = await createReview(page, completeFixture, "2.5");
    recordResult(
      "Five eligible jobs create a business-scoped pending proposal",
      rejected.status === "pending"
        && rejected.sampleSize === 5
        && rejected.sourceEvidence.businessId === completeFixture.businessId
        && rejected.sourceEvidence.learningKey === LEARNING_KEY
        && JSON.stringify(rejected.sourceJobIds) === JSON.stringify([...completeFixture.jobIds].sort((a, b) => a - b)),
      JSON.stringify({ sampleSize: rejected.sampleSize, sourceJobIds: rejected.sourceJobIds }),
    );
    const rejectResponse = await decideReview(page, completeFixture, rejected.id, "reject");
    await waitForText(page, "Component baseline review rejected");
    await click(page, `[data-testid="mfh-component-baseline-history-${rejected.id}"] button`);
    const rejectedHistory = await page.$eval(
      `[data-testid="mfh-component-baseline-history-${rejected.id}"]`,
      element => element.textContent ?? "",
    );
    const expectedSnapshots = rejected.sourceEvidence.jobs.flatMap(job =>
      job.snapshotEvidence.map(snapshot => `${snapshot.snapshotId} v${snapshot.snapshotVersion}`),
    );
    recordResult(
      "Rejected history preserves source jobs and immutable snapshot versions",
      rejectResponse.status() === 200
        && expectedSnapshots.length === 5
        && expectedSnapshots.every(snapshot => rejectedHistory.includes(snapshot)),
      rejectedHistory,
    );

    const firstApproved = await createReview(page, completeFixture, "2.0");
    const firstApproveResponse = await decideReview(page, completeFixture, firstApproved.id, "approve");
    await waitForText(page, "Component production-day baseline approved");
    await waitForText(page, "Current approved baseline: 2.0 production days");
    recordResult("A fresh component baseline can be approved", firstApproveResponse.status() === 200);

    const secondApproved = await createReview(page, completeFixture, "3.0");
    const secondApproveResponse = await decideReview(page, completeFixture, secondApproved.id, "approve");
    await waitForText(page, "Current approved baseline: 3.0 production days");
    await page.waitForSelector(
      `[data-testid="mfh-component-baseline-history-${firstApproved.id}"][data-review-status="superseded"]`,
      { timeout: 30_000 },
    );
    const postSupersession = await db.select({
      id: mfhComponentBaselineRevisionsTable.id,
      status: mfhComponentBaselineRevisionsTable.status,
    }).from(mfhComponentBaselineRevisionsTable)
      .where(eq(mfhComponentBaselineRevisionsTable.mfhModelId, completeFixture.modelId));
    recordResult(
      "A later approval supersedes the prior approved baseline",
      secondApproveResponse.status() === 200
        && postSupersession.some(row => row.id === firstApproved.id && row.status === "superseded")
        && postSupersession.some(row => row.id === secondApproved.id && row.status === "approved"),
      JSON.stringify(postSupersession),
    );

    const stale = await createReview(page, completeFixture, "4.0");
    const historyBeforeStaleApproval = await db.select({
      id: mfhComponentBaselineRevisionsTable.id,
      status: mfhComponentBaselineRevisionsTable.status,
    }).from(mfhComponentBaselineRevisionsTable)
      .where(eq(mfhComponentBaselineRevisionsTable.mfhModelId, completeFixture.modelId));
    await db.update(jobComponentWorkSessionsTable)
      .set({ workDate: "2026-08-31" })
      .where(eq(jobComponentWorkSessionsTable.id, completeFixture.sessionIds[0]));
    const staleResponse = await decideReview(page, completeFixture, stale.id, "approve");
    await waitForText(page, "Could not approve component baseline");
    await waitForText(page, "Component source evidence changed after this review was created");
    const historyAfterStaleApproval = await db.select({
      id: mfhComponentBaselineRevisionsTable.id,
      status: mfhComponentBaselineRevisionsTable.status,
    }).from(mfhComponentBaselineRevisionsTable)
      .where(eq(mfhComponentBaselineRevisionsTable.mfhModelId, completeFixture.modelId));
    recordResult(
      "Stale source evidence is visible and does not change review history",
      staleResponse.status() === 409
        && JSON.stringify(historyAfterStaleApproval) === JSON.stringify(historyBeforeStaleApproval)
        && historyAfterStaleApproval.some(row => row.id === stale.id && row.status === "pending")
        && historyAfterStaleApproval.some(row => row.id === secondApproved.id && row.status === "approved"),
      JSON.stringify(historyAfterStaleApproval),
    );

    recordResult(
      "Browser writes stayed inside the component-review allowlist",
      blockedWrites.length === 0
        && browserWrites.length === 8
        && browserWrites.every(write => write.includes("/component-baseline-reviews")),
      blockedWrites.length ? blockedWrites.join(", ") : browserWrites.join(", "),
    );
    await page.screenshot({ path: `${SHOTS}/component-baseline-stale-conflict.png`, fullPage: true });
  } finally {
    if (browser) await browser.close();
    if (sessionId) await deleteSession(sessionId);
    await cleanupFixture(fixture);
  }

  const failures = results.filter(result => !result.pass);
  if (failures.length > 0 || blockedWrites.length > 0) {
    throw new Error(
      `Component baseline review E2E failed: ${failures.map(result => result.name).join(", ") || "unexpected browser writes"}`,
    );
  }
  console.log(`Component baseline review E2E passed (${results.length} checks)`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});