/* Authenticated browser API regression for business-scoped MFH component
 * baseline reviews.
 *
 * Run:
 *   pnpm --filter @workspace/api-server run verify:component-baseline-reviews
 *
 * The fixture is isolated in the development database. Browser requests are
 * default-deny for all non-read methods; only component-review mutations are
 * allowed through.
 */
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
  secondBusinessId: number;
  secondBusinessName: string;
  modelId: number;
  modelName: string;
  serviceId: number;
  secondServiceId: number;
  jobIds: number[];
  secondJobIds: number[];
  componentIds: number[];
  secondComponentIds: number[];
  sessionIds: number[];
  secondSessionIds: number[];
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
    const secondBusinessName = `E2E Baseline Business ${suffix}`;
    const [secondBusiness] = await db.insert(businessesTable).values({
      name: secondBusinessName,
      slug: `e2e-baseline-${suffix}`,
      type: "general_contracting",
      parentBusinessId: business.id,
      legalBusinessId: business.id,
      enabledFeatures: ["jobs"],
    }).returning({ id: businessesTable.id, slug: businessesTable.slug });
    if (!secondBusiness) throw new Error("Failed to create second business fixture");
    partial.secondBusinessId = secondBusiness.id;
    partial.secondBusinessName = secondBusinessName;
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
    const [secondService] = await db.insert(productionServiceTypesTable).values({
      businessId: secondBusiness.id,
      itemKey: "siding",
      name: `E2E Second Siding ${suffix}`,
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
    if (!secondService) throw new Error("Failed to create second component baseline service fixture");
    partial.secondServiceId = secondService.id;
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

    const secondJobs = await db.insert(jobsTable).values(
      [1, 2, 3, 4, 5].map(index => ({
        title: `${modelName} Second Job ${index}`,
        status: "completed",
        businessId: secondBusiness.id,
        businessLine: secondBusiness.slug,
        workflow: "mh_production",
        mfhModelId: model.id,
        mhProductionServices: [secondService.id],
        startDate: `2026-07-${String(index * 3).padStart(2, "0")}`,
        endDate: `2026-07-${String(index * 3 + 1).padStart(2, "0")}`,
      })),
    ).returning({ id: jobsTable.id });
    partial.secondJobIds = secondJobs.map(job => job.id);
    await db.insert(jobDailyPresenceTable).values(secondJobs.map((job, index) => ({
      jobId: job.id,
      date: `2026-07-${String(index * 3 + 1).padStart(2, "0")}`,
      state: "here",
      source: "manual_presence",
      provenance: "confirmed",
    })));
    const secondSourceServices = [{
      id: secondService.id,
      name: secondService.name,
      itemKey: secondService.itemKey,
      category: secondService.category,
      appliesTo: secondService.appliesTo,
    }];
    const secondComponents = await db.insert(jobProductionComponentsTable).values(
      secondJobs.map((job, index) => ({
        jobId: job.id,
        businessId: secondBusiness.id,
        componentKey: "siding",
        componentInstanceKey: "siding:unspecified",
        componentLabel: "Siding",
        variant: null,
        sourceServiceIds: [secondService.id],
        sourceServices: secondSourceServices,
        snapshotVersion: 1,
        status: "completed",
        expectedDurationDays: 2,
        capturedAt: new Date(`2026-07-${String(index * 3 + 1).padStart(2, "0")}T12:00:00Z`),
      })),
    ).returning({ id: jobProductionComponentsTable.id, jobId: jobProductionComponentsTable.jobId });
    partial.secondComponentIds = secondComponents.map(component => component.id);
    const secondComponentByJobId = new Map(secondComponents.map(component => [component.jobId, component]));
    const secondSessions = await db.insert(jobComponentWorkSessionsTable).values(
      secondJobs.flatMap((job, index) => {
        const component = secondComponentByJobId.get(job.id);
        if (!component) throw new Error(`Missing second component fixture for job ${job.id}`);
        const firstDay = index * 3 + 1;
        return [0, 1].map(offset => ({
          jobId: job.id,
          productionComponentId: component.id,
          workDate: `2026-07-${String(firstDay + offset).padStart(2, "0")}`,
          workerName: "E2E Second Component Reviewer",
          actualHours: "8.00",
        }));
      }),
    ).returning({ id: jobComponentWorkSessionsTable.id });
    partial.secondSessionIds = secondSessions.map(session => session.id);

    return {
      businessId: business.id,
      secondBusinessId: secondBusiness.id,
      secondBusinessName,
      modelId: model.id,
      modelName,
      serviceId: service.id,
      secondServiceId: secondService.id,
      jobIds: jobs.map(job => job.id),
      secondJobIds: secondJobs.map(job => job.id),
      componentIds: components.map(component => component.id),
      secondComponentIds: secondComponents.map(component => component.id),
      sessionIds: sessions.map(session => session.id),
      secondSessionIds: secondSessions.map(session => session.id),
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
  if (fixture.secondSessionIds?.length) {
    await db.delete(jobComponentWorkSessionsTable)
      .where(inArray(jobComponentWorkSessionsTable.id, fixture.secondSessionIds));
  }
  if (fixture.componentIds?.length) {
    await db.delete(jobProductionComponentsTable)
      .where(inArray(jobProductionComponentsTable.id, fixture.componentIds));
  }
  if (fixture.secondComponentIds?.length) {
    await db.delete(jobProductionComponentsTable)
      .where(inArray(jobProductionComponentsTable.id, fixture.secondComponentIds));
  }
  if (fixture.jobIds?.length) {
    await db.delete(jobDailyPresenceTable)
      .where(inArray(jobDailyPresenceTable.jobId, fixture.jobIds));
    await db.delete(jobsTable).where(inArray(jobsTable.id, fixture.jobIds));
  }
  if (fixture.secondJobIds?.length) {
    await db.delete(jobDailyPresenceTable)
      .where(inArray(jobDailyPresenceTable.jobId, fixture.secondJobIds));
    await db.delete(jobsTable).where(inArray(jobsTable.id, fixture.secondJobIds));
  }
  if (fixture.modelId != null) {
    await db.delete(mfhModelsTable).where(eq(mfhModelsTable.id, fixture.modelId));
  }
  if (fixture.serviceId != null) {
    await db.delete(productionServiceTypesTable)
      .where(eq(productionServiceTypesTable.id, fixture.serviceId));
  }
  if (fixture.secondServiceId != null) {
    await db.delete(productionServiceTypesTable)
      .where(eq(productionServiceTypesTable.id, fixture.secondServiceId));
  }
  if (fixture.secondBusinessId != null) {
    await db.delete(businessesTable).where(eq(businessesTable.id, fixture.secondBusinessId));
  }
}

type ApiResult<T> = { status: number; body: T };

async function reviewApi<T>(
  page: Page,
  input: { modelId: number; businessId: number; method: "GET" | "POST" | "PATCH"; suffix?: string; body?: unknown },
): Promise<ApiResult<T>> {
  return page.evaluate(async ({ modelId, businessId, method, suffix, body }) => {
    const response = await fetch(
      `/api/mfh/knowledge-base/${modelId}/component-baseline-reviews${suffix ?? ""}?businessId=${businessId}`,
      {
        method,
        credentials: "include",
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );
    return { status: response.status, body: await response.json() };
  }, input);
}

async function createReview(page: Page, fixture: Fixture, days: number, businessId = fixture.businessId) {
  return reviewApi<ReviewResponse>(page, {
    modelId: fixture.modelId,
    businessId,
    method: "POST",
    body: { learningKey: LEARNING_KEY, proposedProductionDays: days },
  });
}

async function decideReview(
  page: Page,
  fixture: Fixture,
  reviewId: number,
  action: "approve" | "reject",
  businessId = fixture.businessId,
) {
  return reviewApi<ReviewResponse>(page, {
    modelId: fixture.modelId,
    businessId,
    method: "PATCH",
    suffix: `/${reviewId}/${action}`,
    body: {},
  });
}

async function main() {
  let fixture: Partial<Fixture> = {};
  let sessionId: string | undefined;
  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;

  try {
    fixture = await createFixture();
    const completeFixture = fixture as Fixture;
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setRequestInterception(true);
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

    const returnTo = "/";
    const proof = createTestLoginProof(returnTo);
    await page.goto(`${BASE}/api/dev-test-login?${new URLSearchParams({ returnTo, ...proof })}`, {
      waitUntil: "networkidle2",
      timeout: 60_000,
    });
    sessionId = (await page.cookies()).find(cookie => cookie.name === SESSION_COOKIE)?.value;
    if (!sessionId) throw new Error("Development login did not create a session cookie");

    await page.goto(`${BASE}/`, { waitUntil: "networkidle2", timeout: 60_000 });

    const rejectedResult = await createReview(page, completeFixture, 2.5);
    const rejected = rejectedResult.body;
    recordResult(
      "Five eligible jobs create a business-scoped pending proposal",
      rejectedResult.status === 201
        && rejected.status === "pending"
        && rejected.sampleSize === 5
        && rejected.sourceEvidence.businessId === completeFixture.businessId
        && rejected.sourceEvidence.learningKey === LEARNING_KEY
        && JSON.stringify(rejected.sourceJobIds) === JSON.stringify([...completeFixture.jobIds].sort((a, b) => a - b)),
      JSON.stringify({ sampleSize: rejected.sampleSize, sourceJobIds: rejected.sourceJobIds }),
    );
    const rejectResponse = await decideReview(page, completeFixture, rejected.id, "reject");
    const rejectedHistory = await reviewApi<ReviewResponse[]>(page, {
      modelId: completeFixture.modelId,
      businessId: completeFixture.businessId,
      method: "GET",
    });
    const rejectedRecord = rejectedHistory.body.find(row => row.id === rejected.id);
    recordResult(
      "The API retains rejected history and immutable source evidence",
      rejectResponse.status === 200
        && rejectedHistory.status === 200
        && rejectedRecord?.status === "rejected"
        && rejected.sourceEvidence.jobs.length === 5
        && rejected.sourceEvidence.jobs.every(job => job.snapshotEvidence.length > 0
          && job.snapshotEvidence.every(snapshot => rejectedRecord?.sourceEvidence.jobs.some(recordJob =>
            recordJob.snapshotEvidence.some(recordSnapshot =>
              recordSnapshot.snapshotId === snapshot.snapshotId
              && recordSnapshot.snapshotVersion === snapshot.snapshotVersion,
            ),
          ),
        )),
      JSON.stringify(rejectedRecord),
    );

    const firstApprovedResult = await createReview(page, completeFixture, 2.0);
    const firstApproved = firstApprovedResult.body;
    const firstApproveResponse = await decideReview(page, completeFixture, firstApproved.id, "approve");
    recordResult("A fresh component baseline can be approved", firstApprovedResult.status === 201 && firstApproveResponse.status === 200);

    const secondApprovedResult = await createReview(page, completeFixture, 3.0);
    const secondApproved = secondApprovedResult.body;
    const secondApproveResponse = await decideReview(page, completeFixture, secondApproved.id, "approve");
    const postSupersession = await db.select({
      id: mfhComponentBaselineRevisionsTable.id,
      status: mfhComponentBaselineRevisionsTable.status,
    }).from(mfhComponentBaselineRevisionsTable)
      .where(eq(mfhComponentBaselineRevisionsTable.mfhModelId, completeFixture.modelId));
    recordResult(
      "A later approval supersedes the prior approved baseline",
      secondApproveResponse.status === 200
        && postSupersession.some(row => row.id === firstApproved.id && row.status === "superseded")
        && postSupersession.some(row => row.id === secondApproved.id && row.status === "approved"),
      JSON.stringify(postSupersession),
    );

    const staleResult = await createReview(page, completeFixture, 4.0);
    const stale = staleResult.body;
    const historyBeforeStaleApproval = await db.select({
      id: mfhComponentBaselineRevisionsTable.id,
      status: mfhComponentBaselineRevisionsTable.status,
    }).from(mfhComponentBaselineRevisionsTable)
      .where(eq(mfhComponentBaselineRevisionsTable.mfhModelId, completeFixture.modelId));
    await db.update(jobComponentWorkSessionsTable)
      .set({ workDate: "2026-08-31" })
      .where(eq(jobComponentWorkSessionsTable.id, completeFixture.sessionIds[0]));
    const staleResponse = await decideReview(page, completeFixture, stale.id, "approve");
    const historyAfterStaleApproval = await db.select({
      id: mfhComponentBaselineRevisionsTable.id,
      status: mfhComponentBaselineRevisionsTable.status,
    }).from(mfhComponentBaselineRevisionsTable)
      .where(eq(mfhComponentBaselineRevisionsTable.mfhModelId, completeFixture.modelId));
    recordResult(
      "Stale source evidence is visible and does not change review history",
      staleResponse.status === 409
        && JSON.stringify(historyAfterStaleApproval) === JSON.stringify(historyBeforeStaleApproval)
        && historyAfterStaleApproval.some(row => row.id === stale.id && row.status === "pending")
        && historyAfterStaleApproval.some(row => row.id === secondApproved.id && row.status === "approved"),
      JSON.stringify(historyAfterStaleApproval),
    );

    const primaryRowsInSecondScope = await reviewApi<ReviewResponse[]>(page, {
      modelId: completeFixture.modelId,
      businessId: completeFixture.secondBusinessId,
      method: "GET",
    });
    recordResult(
      "The second business cannot read the first business's review history",
      primaryRowsInSecondScope.status === 200
        && primaryRowsInSecondScope.body.length === 0,
    );

    const secondRejectedResult = await createReview(page, completeFixture, 5.5, completeFixture.secondBusinessId);
    const secondRejected = secondRejectedResult.body;
    await decideReview(page, completeFixture, secondRejected.id, "reject", completeFixture.secondBusinessId);
    const secondFirstApprovedResult = await createReview(page, completeFixture, 5.0, completeFixture.secondBusinessId);
    const secondFirstApproved = secondFirstApprovedResult.body;
    await decideReview(page, completeFixture, secondFirstApproved.id, "approve", completeFixture.secondBusinessId);
    const secondBusinessApprovedResult = await createReview(page, completeFixture, 6.0, completeFixture.secondBusinessId);
    const secondBusinessApproved = secondBusinessApprovedResult.body;
    await decideReview(page, completeFixture, secondBusinessApproved.id, "approve", completeFixture.secondBusinessId);
    const secondPendingResult = await createReview(page, completeFixture, 7.0, completeFixture.secondBusinessId);
    const secondPending = secondPendingResult.body;
    const secondHistory = await reviewApi<ReviewResponse[]>(page, {
      modelId: completeFixture.modelId,
      businessId: completeFixture.secondBusinessId,
      method: "GET",
    });
    recordResult(
      "The second business keeps its own pending, rejected, approved, and superseded history",
      secondHistory.status === 200
        && secondRejectedResult.status === 201
        && secondFirstApprovedResult.status === 201
        && secondBusinessApprovedResult.status === 201
        && secondPendingResult.status === 201
        && secondRejected.sourceEvidence.businessId === completeFixture.secondBusinessId
        && secondBusinessApproved.sourceEvidence.businessId === completeFixture.secondBusinessId
        && secondPending.sourceEvidence.businessId === completeFixture.secondBusinessId
        && secondHistory.body.some(row => row.id === secondRejected.id && row.status === "rejected")
        && secondHistory.body.some(row => row.id === secondFirstApproved.id && row.status === "superseded")
        && secondHistory.body.some(row => row.id === secondBusinessApproved.id && row.status === "approved")
        && secondHistory.body.some(row => row.id === secondPending.id && row.status === "pending"),
    );

    const crossBusinessMutation = await decideReview(
      page, completeFixture, stale.id, "reject", completeFixture.secondBusinessId,
    );
    const [primaryPendingAfterCrossMutation] = await db.select({
      status: mfhComponentBaselineRevisionsTable.status,
    }).from(mfhComponentBaselineRevisionsTable)
      .where(eq(mfhComponentBaselineRevisionsTable.id, stale.id))
      .limit(1);
    recordResult(
      "A review cannot be mutated through another business scope",
      crossBusinessMutation.status === 404 && primaryPendingAfterCrossMutation?.status === "pending",
      JSON.stringify(crossBusinessMutation),
    );

    const firstHistoryAfterSecondBusiness = await reviewApi<ReviewResponse[]>(page, {
      modelId: completeFixture.modelId,
      businessId: completeFixture.businessId,
      method: "GET",
    });
    recordResult(
      "The first business retains only its own review history",
      firstHistoryAfterSecondBusiness.status === 200
        && firstHistoryAfterSecondBusiness.body.some(row => row.id === rejected.id)
        && firstHistoryAfterSecondBusiness.body.some(row => row.id === firstApproved.id)
        && firstHistoryAfterSecondBusiness.body.some(row => row.id === secondApproved.id)
        && firstHistoryAfterSecondBusiness.body.some(row => row.id === stale.id && row.status === "pending")
        && firstHistoryAfterSecondBusiness.body.every(row =>
          ![secondRejected.id, secondFirstApproved.id, secondBusinessApproved.id, secondPending.id].includes(row.id)),
    );

    recordResult(
      "Browser writes stayed inside the component-review allowlist",
      blockedWrites.length === 0
        && browserWrites.length === 16
        && browserWrites.every(write => write.includes("/component-baseline-reviews")),
      blockedWrites.length ? blockedWrites.join(", ") : browserWrites.join(", "),
    );
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