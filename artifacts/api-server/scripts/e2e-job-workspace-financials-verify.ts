import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  businessesTable,
  expensesTable,
  invoicesTable,
  jobSubcontractorsTable,
  jobsTable,
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

async function main() {
  const [[business]] = await Promise.all([
    db.select({ id: businessesTable.id, slug: businessesTable.slug })
      .from(businessesTable).where(eq(businessesTable.slug, "general_contracting")).limit(1),
  ]);
  if (!business) throw new Error("General Contracting development business is required");

  let jobId: number | undefined;
  let subId: number | undefined;
  let invoiceId: number | undefined;
  let expenseId: number | undefined;
  let sid: string | undefined;
  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
  const blockedWrites: string[] = [];
  try {
    const [sub] = await db.insert(subcontractorsTable).values({
      name: `E2E Workspace Financial ${Date.now()}`,
      trade: "Automated verification",
      role: "member",
      notes: "Temporary development-only job workspace fixture",
    }).returning({ id: subcontractorsTable.id });
    subId = sub.id;

    const [job] = await db.insert(jobsTable).values({
      title: `E2E Workspace Financial ${Date.now()}`,
      status: "scheduled",
      businessId: business.id,
      businessLine: business.slug,
    }).returning({ id: jobsTable.id });
    jobId = job.id;

    const [invoice] = await db.insert(invoicesTable).values({
      invoiceNumber: `E2E-WORKSPACE-${job.id}`,
      jobId: job.id,
      status: "paid",
      issueDate: new Date().toISOString().slice(0, 10),
      subtotal: "1000.00",
      total: "1000.00",
      amountPaid: "1000.00",
      businessId: business.id,
      businessLine: business.slug,
      lineItems: [{ id: 1, description: "Temporary verification work", quantity: 1, unitPrice: 1000, total: 1000 }],
    }).returning({ id: invoicesTable.id });
    invoiceId = invoice.id;

    const [expense] = await db.insert(expensesTable).values({
      description: "Temporary workspace expense verification",
      amount: "125.00",
      category: "Materials",
      date: new Date().toISOString().slice(0, 10),
      jobId: job.id,
      businessId: business.id,
      businessLine: business.slug,
      countsTowardJobProfit: true,
    }).returning({ id: expensesTable.id });
    expenseId = expense.id;

    await db.insert(jobSubcontractorsTable).values({
      jobId: job.id,
      subcontractorId: sub.id,
      compensationType: "fixed",
      fixedAmount: "100.00",
      amountOwed: "100.00",
      amountPaid: "0.00",
      accruedAdvancement: "20.00",
      paymentStatus: "unpaid",
    });

    const returnTo = "/jobs";
    const loginParams = new URLSearchParams({ returnTo, ...createTestLoginProof(returnTo) });
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", request => {
      if (["GET", "HEAD", "OPTIONS"].includes(request.method().toUpperCase())) void request.continue();
      else { blockedWrites.push(`${request.method()} ${request.url()}`); void request.abort("blockedbyclient"); }
    });
    await page.evaluateOnNewDocument(() => localStorage.setItem("buildpro_selection_mode", "1"));
    await page.goto(`${BASE}/api/dev-test-login?${loginParams}`, { waitUntil: "networkidle2", timeout: 60_000 });
    sid = (await page.cookies()).find(cookie => cookie.name === SESSION_COOKIE)?.value;
    if (!sid) throw new Error("Development test login session was not created");

    let profitResponse: any = null;
    let resolveProfitResponse: (() => void) | undefined;
    const profitResponseReady = new Promise<void>(resolve => { resolveProfitResponse = resolve; });
    page.on("response", response => {
      if (new URL(response.url()).pathname === `/api/jobs/${jobId}/profit`) {
        void response.json().then(body => { profitResponse = body; resolveProfitResponse?.(); }).catch(() => undefined);
      }
    });
    await page.goto(`${BASE}/jobs/${jobId}/payroll`, { waitUntil: "networkidle2", timeout: 60_000 });
    await page.waitForFunction(() => document.body.innerText.includes("PAYROLL CHECKLIST"), { timeout: 30_000 });
    await Promise.race([
      profitResponseReady,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Job profit response was not received")), 20_000)),
    ]);
    const payrollText = await page.$eval("body", element => element.innerText.replace(/\s+/g, " ").trim());
    const advanceValue = await page.evaluate(() => {
      const label = [...document.querySelectorAll("label")]
        .find(element => element.textContent?.includes("Advancement deduction"));
      return (label?.parentElement?.querySelector("input") as HTMLInputElement | null)?.value ?? null;
    });

    await page.goto(`${BASE}/jobs`, { waitUntil: "networkidle2", timeout: 60_000 });
    await page.waitForSelector(`[data-testid="compact-job-row-${jobId}"]`, { timeout: 25_000 });
    await page.$eval(`[data-testid="compact-job-row-${jobId}"]`, element =>
      (element.querySelector('button[data-testid^="job-card-open-"]') as HTMLButtonElement).click());
    await page.waitForSelector(`[data-testid="job-workspace-overview-${jobId}"]`, { timeout: 20_000 });
    await page.evaluate(id => {
      const root = document.querySelector(`[data-testid="job-workspace-overview-${id}"]`);
      [...(root?.querySelectorAll("button") ?? [])].find(button => button.textContent?.trim() === "Details")?.click();
    }, jobId);
    await page.waitForSelector('[data-testid="job-financials-panel"]', { timeout: 20_000 });
    await page.waitForFunction(() => {
      const text = document.querySelector('[data-testid="job-financials-panel"]')?.innerText ?? "";
      return text.includes("Job Revenue") || text.includes("Unable to load job profit");
    }, { timeout: 20_000 });
    const financialText = await page.$eval('[data-testid="job-financials-panel"]', element => element.innerText.replace(/\s+/g, " ").trim());

    const results = {
      jobId,
      expenseApiMatchesFixture: profitResponse?.jobExpenses === 125,
      expenseUiVisible: financialText.includes("$125.00"),
      profitApiNet: profitResponse?.netProfit,
      advancementDraftVisible: Number(advanceValue) === 20,
      outstandingBalanceVisible: payrollText.includes("$100.00"),
      writesBlocked: blockedWrites.length === 0,
      financialText: financialText.slice(0, 700),
    };
    console.log(JSON.stringify(results));
    if (
      !results.expenseApiMatchesFixture || !results.expenseUiVisible
      || !results.advancementDraftVisible || !results.outstandingBalanceVisible
      || !results.writesBlocked
    ) throw new Error("One or more job workspace financial fixture checks failed");
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (sid) await deleteSession(sid).catch(() => undefined);
    if (jobId != null) await db.delete(jobSubcontractorsTable).where(eq(jobSubcontractorsTable.jobId, jobId)).catch(() => undefined);
    if (expenseId != null) await db.delete(expensesTable).where(eq(expensesTable.id, expenseId)).catch(() => undefined);
    if (invoiceId != null) await db.delete(invoicesTable).where(eq(invoicesTable.id, invoiceId)).catch(() => undefined);
    if (jobId != null) await db.delete(jobsTable).where(eq(jobsTable.id, jobId)).catch(() => undefined);
    if (subId != null) await db.delete(subcontractorsTable).where(eq(subcontractorsTable.id, subId)).catch(() => undefined);
    const remaining = await Promise.all([
      jobId != null ? db.select({ id: jobsTable.id }).from(jobsTable).where(eq(jobsTable.id, jobId)) : Promise.resolve([]),
      subId != null ? db.select({ id: subcontractorsTable.id }).from(subcontractorsTable).where(eq(subcontractorsTable.id, subId)) : Promise.resolve([]),
      expenseId != null ? db.select({ id: expensesTable.id }).from(expensesTable).where(eq(expensesTable.id, expenseId)) : Promise.resolve([]),
      invoiceId != null ? db.select({ id: invoicesTable.id }).from(invoicesTable).where(eq(invoicesTable.id, invoiceId)) : Promise.resolve([]),
    ]);
    if (remaining.some(rows => rows.length > 0)) throw new Error("Temporary job workspace fixture cleanup left records behind");
    console.log("PASS: Temporary financial fixture and session cleaned up");
  }
}

main().catch(error => { console.error(error); process.exit(1); });
