import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  businessesTable,
  expensesTable,
  invoicesTable,
  jobChecklistItemsTable,
  jobChecklistsTable,
  jobChecklistSectionsTable,
  jobDailyPresenceTable,
  jobSubHoursTable,
  jobSubcontractorsTable,
  jobsTable,
  sessionsTable,
  subcontractorsTable,
} from "@workspace/db/schema";
import { createTestLoginProof, deleteSession, SESSION_COOKIE } from "../src/lib/auth";
import { launchBrowser } from "../src/lib/launchBrowser";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:80";
const target = new URL(BASE);
if (
  process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT
  || target.protocol !== "http:"
  || !["localhost", "127.0.0.1", "::1"].includes(target.hostname.replace(/^\[|\]$/g, ""))
) throw new Error("This verifier only runs against the local development preview");

const fixtureKey = `E2E Start Job ${Date.now()}`;
const checklistTitle = `${fixtureKey} checklist item`;

async function rowsForJob(table: any, jobId: number) {
  return db.select().from(table).where(eq(table.jobId, jobId));
}

async function main() {
  const [business] = await db.select({ id: businessesTable.id, slug: businessesTable.slug })
    .from(businessesTable).where(eq(businessesTable.slug, "general_contracting")).limit(1);
  if (!business) throw new Error("General Contracting development business is required");

  let jobId: number | undefined;
  let subId: number | undefined;
  let invoiceId: number | undefined;
  let expenseId: number | undefined;
  let checklistId: number | undefined;
  let sectionId: number | undefined;
  let checklistItemId: number | undefined;
  let sessionId: string | undefined;
  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
  let page: any;
  const allowedWrites: { method: string; url: string; body: unknown }[] = [];
  const blockedWrites: string[] = [];
  let updateResponse: { status: number; body: string } | undefined;
  let resultError: unknown;

  try {
    const [sub] = await db.insert(subcontractorsTable).values({
      name: `${fixtureKey} subcontractor`,
      trade: "Verification fixture",
      role: "member",
    }).returning({ id: subcontractorsTable.id });
    subId = sub.id;

    const [job] = await db.insert(jobsTable).values({
      title: fixtureKey,
      description: "Temporary fixture to verify status-only Start Job behavior.",
      status: "scheduled",
      planningState: "ready",
      businessId: business.id,
      businessLine: business.slug,
    }).returning({ id: jobsTable.id });
    jobId = job.id;

    await db.insert(jobSubcontractorsTable).values({
      jobId,
      subcontractorId: sub.id,
      compensationType: "fixed",
      fixedAmount: "80.00",
      amountOwed: "80.00",
      amountPaid: "0.00",
      paymentStatus: "unpaid",
    });

    const [invoice] = await db.insert(invoicesTable).values({
      invoiceNumber: `E2E-START-${job.id}`,
      jobId,
      status: "paid",
      issueDate: new Date().toISOString().slice(0, 10),
      subtotal: "1000.00",
      total: "1000.00",
      amountPaid: "1000.00",
      businessId: business.id,
      businessLine: business.slug,
      lineItems: [{ id: 1, description: "Start verification fixture", quantity: 1, unitPrice: 1000, total: 1000 }],
    }).returning({ id: invoicesTable.id });
    invoiceId = invoice.id;

    const [expense] = await db.insert(expensesTable).values({
      description: `${fixtureKey} expense`,
      amount: "125.00",
      category: "Materials",
      date: new Date().toISOString().slice(0, 10),
      jobId,
      businessId: business.id,
      businessLine: business.slug,
      countsTowardJobProfit: true,
    }).returning({ id: expensesTable.id });
    expenseId = expense.id;

    const [checklist] = await db.insert(jobChecklistsTable).values({
      jobId,
      templateName: `${fixtureKey} checklist`,
      shareToken: crypto.randomUUID(),
      shareEnabled: false,
    }).returning({ id: jobChecklistsTable.id });
    checklistId = checklist.id;

    const [section] = await db.insert(jobChecklistSectionsTable).values({
      jobChecklistId: checklist.id,
      name: "Before Start",
      sortOrder: 1,
    }).returning({ id: jobChecklistSectionsTable.id });
    sectionId = section.id;

    const [checklistItem] = await db.insert(jobChecklistItemsTable).values({
      jobChecklistId: checklist.id,
      jobChecklistSectionId: section.id,
      title: checklistTitle,
      completed: false,
      sortOrder: 1,
    }).returning({ id: jobChecklistItemsTable.id });
    checklistItemId = checklistItem.id;

    const beforeJob = (await db.select({
      id: jobsTable.id,
      title: jobsTable.title,
      description: jobsTable.description,
      address: jobsTable.address,
      city: jobsTable.city,
      state: jobsTable.state,
      businessId: jobsTable.businessId,
      businessLine: jobsTable.businessLine,
      status: jobsTable.status,
      startDate: jobsTable.startDate,
      endDate: jobsTable.endDate,
      planningState: jobsTable.planningState,
      priority: jobsTable.priority,
      resourceDemand: jobsTable.resourceDemand,
      queuePosition: jobsTable.queuePosition,
      manHours: jobsTable.manHours,
      daysOnJob: jobsTable.daysOnJob,
      closedAt: jobsTable.closedAt,
    }).from(jobsTable).where(eq(jobsTable.id, job.id)))[0];
    const beforeAssignment = (await rowsForJob(jobSubcontractorsTable, job.id))[0];
    const beforeInvoice = (await db.select({
      id: invoicesTable.id, status: invoicesTable.status, total: invoicesTable.total,
      amountPaid: invoicesTable.amountPaid, invoiceNumber: invoicesTable.invoiceNumber,
    }).from(invoicesTable).where(eq(invoicesTable.id, invoice.id)))[0];
    const beforeExpense = (await db.select({
      id: expensesTable.id, amount: expensesTable.amount, category: expensesTable.category,
      jobId: expensesTable.jobId, countsTowardJobProfit: expensesTable.countsTowardJobProfit,
    }).from(expensesTable).where(eq(expensesTable.id, expense.id)))[0];
    const beforeChecklist = (await db.select({
      id: jobChecklistItemsTable.id, title: jobChecklistItemsTable.title,
      completed: jobChecklistItemsTable.completed, notes: jobChecklistItemsTable.notes,
    }).from(jobChecklistItemsTable).where(eq(jobChecklistItemsTable.id, checklistItem.id)))[0];
    const beforePresenceCount = (await rowsForJob(jobDailyPresenceTable, job.id)).length;
    const beforeHoursCount = (await rowsForJob(jobSubHoursTable, job.id)).length;

    const returnTo = "/jobs";
    const loginParams = new URLSearchParams({ returnTo, ...createTestLoginProof(returnTo) });
    browser = await launchBrowser();
    page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", request => {
      const method = request.method().toUpperCase();
      if (["GET", "HEAD", "OPTIONS"].includes(method)) {
        void request.continue();
        return;
      }
      const url = new URL(request.url());
      if (method === "PUT" && url.pathname === `/api/jobs/${job.id}`) {
        let body: unknown;
        try { body = JSON.parse(request.postData() ?? "{}"); } catch { body = request.postData(); }
        allowedWrites.push({ method, url: url.pathname, body });
        void request.continue();
        return;
      }
      blockedWrites.push(`${method} ${url.pathname}`);
      void request.abort("blockedbyclient");
    });
    page.on("response", (response: any) => {
      if (response.request().method().toUpperCase() === "PUT"
        && new URL(response.url()).pathname === `/api/jobs/${job.id}`) {
        void response.text().then((body: string) => { updateResponse = { status: response.status(), body }; }).catch(() => undefined);
      }
    });
    await page.evaluateOnNewDocument(() => localStorage.setItem("buildpro_selection_mode", "1"));
    await page.goto(`${BASE}/api/dev-test-login?${loginParams}`, { waitUntil: "networkidle2", timeout: 60_000 });
    sessionId = (await page.cookies()).find(cookie => cookie.name === SESSION_COOKIE)?.value;
    if (!sessionId) throw new Error("Development test login session was not created");

    await page.goto(`${BASE}/jobs`, { waitUntil: "networkidle2", timeout: 60_000 });
    const row = `[data-testid="compact-job-row-${job.id}"]`;
    await page.waitForSelector(row, { timeout: 30_000 });
    await page.$eval(`[data-testid="job-card-open-${job.id}"]`, element => (element as HTMLButtonElement).click());
    const workspace = `[data-testid="job-workspace-job-${job.id}"]`;
    await page.waitForSelector(workspace, { timeout: 20_000 });
    const activeButtonText = await page.$eval(workspace, element =>
      [...element.querySelectorAll("button")].find(button => button.textContent?.trim() === "MARK ACTIVE")?.textContent?.trim() ?? null,
    );
    if (activeButtonText !== "MARK ACTIVE") throw new Error("Start Job / Mark Active action is not visible for the eligible fixture");

    const profitBefore = await page.evaluate(async id => {
      const response = await fetch(`/api/jobs/${id}/profit`, { credentials: "include" });
      const data = await response.json();
      return { status: response.status, values: { jobExpenses: data.jobExpenses, subLaborCost: data.subLaborCost, netProfit: data.netProfit } };
    }, job.id);

    const buttons = await page.$$(`${workspace} button`);
    const markActiveIndex = await page.$$eval(`${workspace} button`, elements =>
      elements.findIndex(button => button.textContent?.trim() === "MARK ACTIVE"),
    );
    if (markActiveIndex < 0 || !buttons[markActiveIndex]) throw new Error("MARK ACTIVE button disappeared before click");
    const updateResponsePromise = page.waitForResponse(response =>
      response.request().method().toUpperCase() === "PUT"
      && new URL(response.url()).pathname === `/api/jobs/${job.id}`,
    { timeout: 20_000 });
    await buttons[markActiveIndex].click();
    const updateResponseObject = await updateResponsePromise;
    updateResponse = { status: updateResponseObject.status(), body: await updateResponseObject.text() };
    if (!updateResponseObject.ok()) throw new Error(`Status update returned ${updateResponseObject.status()}: ${updateResponse.body}`);
    await page.waitForFunction(id => {
      const root = document.querySelector(`[data-testid="job-workspace-job-${id}"]`);
      return !!root && root.querySelector("section h3")?.textContent?.trim() === "Active"
        && ![...root.querySelectorAll("button")].some(button => button.textContent?.trim() === "MARK ACTIVE");
    }, { timeout: 20_000 }, job.id);

    const profitAfter = await page.evaluate(async id => {
      const response = await fetch(`/api/jobs/${id}/profit`, { credentials: "include" });
      const data = await response.json();
      return { status: response.status, values: { jobExpenses: data.jobExpenses, subLaborCost: data.subLaborCost, netProfit: data.netProfit } };
    }, job.id);

    const afterJob = (await db.select({
      id: jobsTable.id,
      title: jobsTable.title,
      description: jobsTable.description,
      address: jobsTable.address,
      city: jobsTable.city,
      state: jobsTable.state,
      businessId: jobsTable.businessId,
      businessLine: jobsTable.businessLine,
      status: jobsTable.status,
      startDate: jobsTable.startDate,
      endDate: jobsTable.endDate,
      planningState: jobsTable.planningState,
      priority: jobsTable.priority,
      resourceDemand: jobsTable.resourceDemand,
      queuePosition: jobsTable.queuePosition,
      manHours: jobsTable.manHours,
      daysOnJob: jobsTable.daysOnJob,
      closedAt: jobsTable.closedAt,
    }).from(jobsTable).where(eq(jobsTable.id, job.id)))[0];
    const afterAssignment = (await rowsForJob(jobSubcontractorsTable, job.id))[0];
    const afterInvoice = (await db.select({
      id: invoicesTable.id, status: invoicesTable.status, total: invoicesTable.total,
      amountPaid: invoicesTable.amountPaid, invoiceNumber: invoicesTable.invoiceNumber,
    }).from(invoicesTable).where(eq(invoicesTable.id, invoice.id)))[0];
    const afterExpense = (await db.select({
      id: expensesTable.id, amount: expensesTable.amount, category: expensesTable.category,
      jobId: expensesTable.jobId, countsTowardJobProfit: expensesTable.countsTowardJobProfit,
    }).from(expensesTable).where(eq(expensesTable.id, expense.id)))[0];
    const afterChecklist = (await db.select({
      id: jobChecklistItemsTable.id, title: jobChecklistItemsTable.title,
      completed: jobChecklistItemsTable.completed, notes: jobChecklistItemsTable.notes,
    }).from(jobChecklistItemsTable).where(eq(jobChecklistItemsTable.id, checklistItem.id)))[0];
    const afterPresenceCount = (await rowsForJob(jobDailyPresenceTable, job.id)).length;
    const afterHoursCount = (await rowsForJob(jobSubHoursTable, job.id)).length;
    const body = allowedWrites[0]?.body as Record<string, unknown> | undefined;
    const result = {
      jobId: job.id,
      actionVisible: activeButtonText === "MARK ACTIVE",
      statusChangedToInProgress: afterJob?.status === "in_progress",
      onlyStatusWasSubmitted: allowedWrites.length === 1 && body?.status === "in_progress" && Object.keys(body).length === 1,
      datesAndPlanningUnchanged: afterJob?.startDate === beforeJob.startDate
        && afterJob?.endDate === beforeJob.endDate
        && afterJob?.planningState === beforeJob.planningState
        && afterJob?.priority === beforeJob.priority
        && afterJob?.resourceDemand === beforeJob.resourceDemand
        && afterJob?.queuePosition === beforeJob.queuePosition,
      noPresenceOrHoursAdded: afterPresenceCount === beforePresenceCount && afterPresenceCount === 0
        && afterHoursCount === beforeHoursCount && afterHoursCount === 0,
      jobDetailsPreserved: afterJob?.title === beforeJob.title
        && afterJob?.description === beforeJob.description
        && afterJob?.businessId === beforeJob.businessId
        && afterJob?.businessLine === beforeJob.businessLine
        && afterJob?.manHours === beforeJob.manHours
        && afterJob?.daysOnJob === beforeJob.daysOnJob
        && afterJob?.closedAt === beforeJob.closedAt,
      subcontractorAssignmentPreserved: JSON.stringify(afterAssignment) === JSON.stringify(beforeAssignment),
      invoicePreserved: JSON.stringify(afterInvoice) === JSON.stringify(beforeInvoice),
      expensePreserved: JSON.stringify(afterExpense) === JSON.stringify(beforeExpense),
      checklistPreserved: JSON.stringify(afterChecklist) === JSON.stringify(beforeChecklist),
      profitUnchanged: profitBefore.status === 200 && profitAfter.status === 200
        && JSON.stringify(profitAfter.values) === JSON.stringify(profitBefore.values),
      unifiedWorkspaceStillOpen: await page.$(workspace) !== null,
      browserWrites: allowedWrites.length,
      blockedWrites,
      profitBefore: profitBefore.values,
      profitAfter: profitAfter.values,
    };
    console.log(JSON.stringify(result));
    const booleanChecks = [
      result.actionVisible,
      result.statusChangedToInProgress,
      result.onlyStatusWasSubmitted,
      result.datesAndPlanningUnchanged,
      result.noPresenceOrHoursAdded,
      result.jobDetailsPreserved,
      result.subcontractorAssignmentPreserved,
      result.invoicePreserved,
      result.expensePreserved,
      result.checklistPreserved,
      result.profitUnchanged,
      result.unifiedWorkspaceStillOpen,
    ];
    if (booleanChecks.some(value => !value) || result.browserWrites !== 1 || result.blockedWrites.length > 0) {
      throw new Error("One or more Start Job workspace checks failed");
    }
  } catch (error) {
    const currentJob = jobId == null ? null : (await db.select({
      status: jobsTable.status,
      startDate: jobsTable.startDate,
      endDate: jobsTable.endDate,
      planningState: jobsTable.planningState,
    }).from(jobsTable).where(eq(jobsTable.id, jobId)))[0] ?? null;
    const pageText = page ? await page.$eval("body", element =>
      element.innerText.replace(/\s+/g, " ").trim().slice(-1200),
    ).catch(() => null) : null;
    console.error("Start Job diagnostic", JSON.stringify({ allowedWrites, blockedWrites, updateResponse, currentJob, pageText }));
    resultError = error;
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (sessionId) await deleteSession(sessionId).catch(() => undefined);
    if (checklistId != null) await db.delete(jobChecklistsTable).where(eq(jobChecklistsTable.id, checklistId)).catch(() => undefined);
    if (sectionId != null) await db.delete(jobChecklistSectionsTable).where(eq(jobChecklistSectionsTable.id, sectionId)).catch(() => undefined);
    if (checklistItemId != null) await db.delete(jobChecklistItemsTable).where(eq(jobChecklistItemsTable.id, checklistItemId)).catch(() => undefined);
    if (jobId != null) await db.delete(jobSubcontractorsTable).where(eq(jobSubcontractorsTable.jobId, jobId)).catch(() => undefined);
    if (expenseId != null) await db.delete(expensesTable).where(eq(expensesTable.id, expenseId)).catch(() => undefined);
    if (invoiceId != null) await db.delete(invoicesTable).where(eq(invoicesTable.id, invoiceId)).catch(() => undefined);
    if (jobId != null) await db.delete(jobsTable).where(eq(jobsTable.id, jobId)).catch(() => undefined);
    if (subId != null) await db.delete(subcontractorsTable).where(eq(subcontractorsTable.id, subId)).catch(() => undefined);
    const remaining = await Promise.all([
      jobId != null ? db.select({ id: jobsTable.id }).from(jobsTable).where(eq(jobsTable.id, jobId)) : Promise.resolve([]),
      subId != null ? db.select({ id: subcontractorsTable.id }).from(subcontractorsTable).where(eq(subcontractorsTable.id, subId)) : Promise.resolve([]),
      invoiceId != null ? db.select({ id: invoicesTable.id }).from(invoicesTable).where(eq(invoicesTable.id, invoiceId)) : Promise.resolve([]),
      expenseId != null ? db.select({ id: expensesTable.id }).from(expensesTable).where(eq(expensesTable.id, expenseId)) : Promise.resolve([]),
      checklistId != null ? db.select({ id: jobChecklistsTable.id }).from(jobChecklistsTable).where(eq(jobChecklistsTable.id, checklistId)) : Promise.resolve([]),
      sectionId != null ? db.select({ id: jobChecklistSectionsTable.id }).from(jobChecklistSectionsTable).where(eq(jobChecklistSectionsTable.id, sectionId)) : Promise.resolve([]),
      checklistItemId != null ? db.select({ id: jobChecklistItemsTable.id }).from(jobChecklistItemsTable).where(eq(jobChecklistItemsTable.id, checklistItemId)) : Promise.resolve([]),
      sessionId != null ? db.select({ sid: sessionsTable.sid }).from(sessionsTable).where(eq(sessionsTable.sid, sessionId)) : Promise.resolve([]),
    ]);
    if (remaining.some(rows => rows.length > 0)) resultError = new Error(`Fixture cleanup left records: ${JSON.stringify(remaining)}`);
    else console.log("PASS: Temporary job, linked records, and session cleaned up");
  }

  if (resultError) throw resultError;
}

main().catch(error => { console.error(error); process.exit(1); });
