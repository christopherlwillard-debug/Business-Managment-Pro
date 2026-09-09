/* Authenticated browser regression check for the Job Financials mileage waterfall
 * and allocation-pay status transitions.
 *
 * Run:
 *   pnpm --filter @workspace/api-server run verify:job-financials
 *
 * The check creates temporary jobs covering saved reimbursements, estimate-only
 * fuel, actual Fuel/Travel expenses, and a 50/50 allocation worker moving from
 * Scheduled to Awaiting Payment to Paid. It serves the fixture profit responses
 * through the real authenticated API requests consumed by the page, blocks
 * unexpected browser writes, and removes every fixture and test session.
 */
import fs from "node:fs";
import { eq } from "drizzle-orm";
import type { Page } from "puppeteer";
import { db } from "@workspace/db";
import {
  businessesTable,
  expensesTable,
  invoicesTable,
  jobMileageReimbursementsTable,
  jobSubcontractorsTable,
  jobsTable,
  mileageLogsTable,
  ownerCapitalEntriesTable,
  sessionsTable,
  subPaymentRecordsTable,
  subcontractorsTable,
} from "@workspace/db/schema";
import { createTestLoginProof } from "../src/lib/auth";
import { launchBrowser } from "../src/lib/launchBrowser";

const BASE = "http://localhost:80";
const SHOTS = "/tmp/e2e-job-financials";

if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
  throw new Error("Refusing to run Job Financials E2E verification against a production deployment");
}

const results: { name: string; pass: boolean; detail?: string }[] = [];

function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
}

function money(value: number): string {
  return value.toFixed(2);
}

type ProfitFixture = {
  grossInvoiced: number;
  collected: number;
  jobExpenses: number;
  netProfit: number;
  mileageReimbursement: {
    id: number;
    amount: number;
    estimatedAmount: number | null;
    recipientType: "owner" | "subcontractor" | "other";
    recipientName: string;
    status: "owed" | "paid";
  } | null;
  mileageReimbursementApplied: boolean;
  estimatedFuelCost: number | null;
  includeMileageInJobCosts: true;
  actualFuelCost: number | null;
  fuelReconciliation:
    | "estimate_only"
    | "reimbursement_differs_from_estimate"
    | "actual_fuel_expense_replaces_reimbursement";
  subLaborCost: number;
  allocPaid: number;
  totalSubHours: number;
  ownerDrawTaken: number;
  growthReservePct: number;
  ownerSplitPct: number;
  taxReservePct: number;
  splitPool?: number;
};

type JobFixture = {
  jobId: number;
  title: string;
  expenseId?: number;
  reimbursementId?: number;
  invoiceId?: number;
  subcontractorId?: number;
  subcontractorName?: string;
  profit: ProfitFixture;
};

async function clickButtonContaining(page: Page, text: string): Promise<boolean> {
  return page.evaluate(buttonText => {
    const button = [...document.querySelectorAll("button")]
      .find(candidate => (candidate.textContent ?? "").includes(buttonText));
    if (!button) return false;
    button.click();
    return true;
  }, text);
}

async function clickButtonInJobCard(page: Page, jobTitle: string, buttonText: string): Promise<boolean> {
  return page.evaluate(({ jobTitle: title, buttonText: label }) => {
    const buttons = [...document.querySelectorAll("button")]
      .filter(candidate => (candidate.textContent ?? "").includes(label));
    for (const button of buttons) {
      let ancestor: HTMLElement | null = button;
      while (ancestor) {
        const matchingTitles = [...ancestor.querySelectorAll("*")]
          .some(element => element.textContent?.trim() === title);
        const titleCount = [...ancestor.querySelectorAll("*")]
          .filter(element => element.textContent?.trim() === title).length;
        if (matchingTitles && titleCount === 1) {
          button.click();
          return true;
        }
        ancestor = ancestor.parentElement;
      }
    }
    return false;
  }, { jobTitle, buttonText });
}

async function openJobsSection(page: Page, heading: string): Promise<boolean> {
  return page.evaluate(sectionHeading => {
    const headingElement = [...document.querySelectorAll("h2")]
      .find(element => element.textContent?.trim() === sectionHeading);
    const button = headingElement?.closest("button");
    if (!button) return false;
    button.click();
    return true;
  }, heading);
}

async function openClosedJobFinancials(page: Page, jobTitle: string): Promise<boolean> {
  const expanded = await page.evaluate(title => {
    const titleCell = [...document.querySelectorAll("td")]
      .find(element => element.textContent?.trim() === title);
    const row = titleCell?.closest("tr");
    if (!row) return false;
    if (row.nextElementSibling?.textContent?.includes("Job P&L")) return true;
    (row as HTMLElement).click();
    return true;
  }, jobTitle);
  if (!expanded) return false;
  await page.waitForFunction(
    title => [...document.querySelectorAll("td")]
      .some(element => element.textContent?.trim() === title
        && element.closest("tr")?.nextElementSibling?.textContent?.includes("Job P&L")),
    { timeout: 10_000 },
    jobTitle,
  );
  return page.evaluate(title => {
    const titleCell = [...document.querySelectorAll("td")]
      .find(element => element.textContent?.trim() === title);
    const actionRow = titleCell?.closest("tr")?.nextElementSibling;
    const button = [...(actionRow?.querySelectorAll("button") ?? [])]
      .find(candidate => (candidate.textContent ?? "").includes("Job P&L"));
    if (!button) return false;
    (button as HTMLButtonElement).click();
    return true;
  }, jobTitle);
}

async function readCompactSubcontractorAmount(page: Page, jobTitle: string): Promise<string> {
  return page.evaluate(title => {
    let best = "";
    for (const titleElement of [...document.querySelectorAll("*")].filter(
      element => element.textContent?.trim() === title,
    )) {
      let current: HTMLElement | null = titleElement instanceof HTMLElement ? titleElement : null;
      while (current) {
        const text = current.textContent?.replace(/\s+/g, " ").trim() ?? "";
        if (text.includes("Payment snapshot") && text.includes("Subcontractors")
          && (!best || text.length < best.length)) {
          best = text;
        }
        current = current.parentElement;
      }
    }
    return best;
  }, jobTitle);
}

async function readFinancialPanel(page: Page) {
  return page.evaluate(() => {
    const heading = [...document.querySelectorAll("h2")]
      .find(element => element.textContent?.trim() === "Job Financials");
    const panel = heading?.closest("div.fixed");
    const text = panel?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const totalLabel = [...document.querySelectorAll("span")]
      .find(element => element.textContent?.trim() === "Included cost total");
    const expenseList = totalLabel?.parentElement?.parentElement;
    const categories = [...(expenseList?.children ?? [])]
      .filter(element => !element.textContent?.includes("Included cost total"))
      .map(element => element.querySelector("span")?.textContent?.trim() ?? "");
    return { text, categories };
  });
}

async function readMileageReimbursementEditor(page: Page) {
  return page.evaluate(() => {
    const panel = document.querySelector('[data-testid="job-financials-panel"]');
    if (!panel) {
      return { amount: "", recipientType: "", recipientName: "", status: "" };
    }
    const labels = [...panel.querySelectorAll("label")];
    const amountLabel = labels.find(element =>
      element.textContent?.replace(/\s+/g, " ").trim().startsWith("Reimbursement amount"));
    const statusLabel = labels.find(element =>
      element.textContent?.replace(/\s+/g, " ").trim().startsWith("Status"));
    const recipientTypeLabel = labels.find(element =>
      element.textContent?.replace(/\s+/g, " ").trim().startsWith("Paid to"));
    const amountInput = amountLabel?.querySelector("input") as HTMLInputElement | null;
    const statusSelect = statusLabel?.querySelector("select") as HTMLSelectElement | null;
    const recipientTypeSelect = recipientTypeLabel?.querySelector("select") as HTMLSelectElement | null;
    const recipientNameInput = panel.querySelector(
      'input[placeholder="Name of person who paid"]',
    ) as HTMLInputElement | null;
    const recipientType = recipientTypeSelect?.value ?? "";
    return {
      amount: amountInput?.value ?? "",
      recipientType,
      recipientName: recipientType === "owner" ? "Business owner" : recipientNameInput?.value ?? "",
      status: statusSelect?.value ?? "",
    };
  });
}

async function updateMileageReimbursementEditor(page: Page, values: {
  amount: string;
  recipientType: "owner" | "subcontractor" | "other";
  recipientName: string;
  status: "owed" | "paid";
}): Promise<boolean> {
  const recipientTypeUpdated = await page.evaluate(next => {
    const panel = document.querySelector('[data-testid="job-financials-panel"]');
    if (!panel) return false;
    const labels = [...panel.querySelectorAll("label")];
    const recipientTypeLabel = labels.find(element =>
      element.textContent?.replace(/\s+/g, " ").trim().startsWith("Paid to"));
    const recipientTypeSelect = recipientTypeLabel?.querySelector("select") as HTMLSelectElement | null;
    if (!recipientTypeSelect) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    if (!setter) return false;
    setter.call(recipientTypeSelect, next);
    recipientTypeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, values.recipientType);
  if (!recipientTypeUpdated) return false;

  await page.waitForSelector(
    '[data-testid="job-financials-panel"] input[placeholder="Name of person who paid"]',
    { timeout: 10_000 },
  );
  return page.evaluate(next => {
    const panel = document.querySelector('[data-testid="job-financials-panel"]');
    if (!panel) return false;
    const labels = [...panel.querySelectorAll("label")];
    const amountLabel = labels.find(element =>
      element.textContent?.replace(/\s+/g, " ").trim().startsWith("Reimbursement amount"));
    const statusLabel = labels.find(element =>
      element.textContent?.replace(/\s+/g, " ").trim().startsWith("Status"));
    const amountInput = amountLabel?.querySelector("input") as HTMLInputElement | null;
    const statusSelect = statusLabel?.querySelector("select") as HTMLSelectElement | null;
    const recipientNameInput = panel.querySelector(
      'input[placeholder="Name of person who paid"]',
    ) as HTMLInputElement | null;
    if (!amountInput || !statusSelect || !recipientNameInput) return false;
    const amountSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    const selectSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    if (!amountSetter || !selectSetter) return false;
    amountSetter.call(amountInput, next.amount);
    amountInput.dispatchEvent(new Event("input", { bubbles: true }));
    amountInput.dispatchEvent(new Event("change", { bubbles: true }));
    selectSetter.call(statusSelect, next.status);
    statusSelect.dispatchEvent(new Event("change", { bubbles: true }));
    amountSetter.call(recipientNameInput, next.recipientName);
    recipientNameInput.dispatchEvent(new Event("input", { bubbles: true }));
    recipientNameInput.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, values);
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });

  const fixtureJobs: JobFixture[] = [];
  const jobIds: number[] = [];
  const expenseIds: number[] = [];
  const reimbursementIds: number[] = [];
  const invoiceIds: number[] = [];
  const subcontractorIds: number[] = [];
  const jobSubcontractorJobIds: number[] = [];
  let sessionId: string | undefined;
  const unexpectedWrites: string[] = [];
  const interceptedProfitRequests: string[] = [];
  const respondedProfitByJob = new Map<number, ProfitFixture>();
  const browser = await launchBrowser();

  try {
    const [business] = await db
      .select({ id: businessesTable.id, slug: businessesTable.slug })
      .from(businessesTable)
      .orderBy(businessesTable.id)
      .limit(1);
    if (!business) throw new Error("No development business is available for the browser fixture");

    async function createFixture(input: {
      title: string;
      status?: "scheduled" | "closed";
      reimbursement?: {
        amount: string;
        estimatedAmount: string;
        recipientType?: "owner" | "subcontractor" | "other";
        recipientName?: string;
        status?: "owed" | "paid";
      };
      expense?: {
        amount: string;
        category: string;
        description: string;
      };
      profit: Omit<ProfitFixture, "mileageReimbursement">;
    }): Promise<JobFixture> {
      const [job] = await db.insert(jobsTable).values({
        title: input.title,
        status: input.status ?? "scheduled",
        businessLine: business.slug,
        businessId: business.id,
        planningState: "ready",
        priority: "normal",
        resourceDemand: "standard",
      }).returning({ id: jobsTable.id });
      jobIds.push(job.id);

      let reimbursementId: number | undefined;
      let expenseId: number | undefined;
      let mileageReimbursement: ProfitFixture["mileageReimbursement"] = null;

      if (input.reimbursement) {
        const [reimbursement] = await db.insert(jobMileageReimbursementsTable).values({
          jobId: job.id,
          businessId: business.id,
          amount: input.reimbursement.amount,
          estimatedAmount: input.reimbursement.estimatedAmount,
          recipientType: input.reimbursement.recipientType ?? "owner",
          recipientName: input.reimbursement.recipientName ?? "Business owner",
          status: input.reimbursement.status ?? "owed",
          notes: "Temporary browser verification fixture",
        }).returning({ id: jobMileageReimbursementsTable.id });
        reimbursementId = reimbursement.id;
        reimbursementIds.push(reimbursement.id);
        mileageReimbursement = {
          id: reimbursement.id,
          amount: Number(input.reimbursement.amount),
          estimatedAmount: Number(input.reimbursement.estimatedAmount),
          recipientType: input.reimbursement.recipientType ?? "owner",
          recipientName: input.reimbursement.recipientName ?? "Business owner",
          status: input.reimbursement.status ?? "owed",
        };
      }

      if (input.expense) {
        const [expense] = await db.insert(expensesTable).values({
          description: input.expense.description,
          amount: input.expense.amount,
          category: input.expense.category,
          date: "2026-08-31",
          jobId: job.id,
          businessLine: business.slug,
          businessId: business.id,
          countsTowardJobProfit: true,
        }).returning({ id: expensesTable.id });
        expenseId = expense.id;
        expenseIds.push(expense.id);
      }

      const profit: ProfitFixture = {
        ...input.profit,
        mileageReimbursement,
      };
      const fixture = {
        jobId: job.id,
        title: input.title,
        expenseId,
        reimbursementId,
        profit,
      };
      fixtureJobs.push(fixture);
      respondedProfitByJob.set(job.id, profit);
      return fixture;
    }

    async function createAllocationFixture(): Promise<JobFixture> {
      const jobTitle = `E2E Split Status ${Date.now()}`;
      const [subcontractor] = await db.insert(subcontractorsTable).values({
        name: `E2E Split Worker ${Date.now()}`,
        trade: "Automated verification",
        role: "member",
        notes: "Temporary development-only split-pay status fixture",
      }).returning({ id: subcontractorsTable.id, name: subcontractorsTable.name });
      subcontractorIds.push(subcontractor.id);

      const [job] = await db.insert(jobsTable).values({
        title: jobTitle,
        status: "scheduled",
        businessLine: business.slug,
        businessId: business.id,
        subcontractorIds: [subcontractor.id],
        planningState: "ready",
        priority: "normal",
        resourceDemand: "standard",
      }).returning({ id: jobsTable.id });
      jobIds.push(job.id);

      const [invoice] = await db.insert(invoicesTable).values({
        invoiceNumber: `E2E-SPLIT-${job.id}`,
        jobId: job.id,
        status: "approved",
        issueDate: new Date().toISOString().slice(0, 10),
        subtotal: "1000.00",
        total: "1000.00",
        amountPaid: "0.00",
        businessLine: business.slug,
        businessId: business.id,
        lineItems: [{ id: 1, description: "Verification work", quantity: 1, unitPrice: 1000, total: 1000 }],
      }).returning({ id: invoicesTable.id });
      invoiceIds.push(invoice.id);

      await db.insert(jobSubcontractorsTable).values({
        jobId: job.id,
        subcontractorId: subcontractor.id,
        compensationType: "allocation",
        allocationPct: "50.00",
        paymentStatus: "unpaid",
      });
      jobSubcontractorJobIds.push(job.id);

      const profit: ProfitFixture = {
        grossInvoiced: 1000,
        collected: 0,
        jobExpenses: 35.56,
        netProfit: 964.44,
        mileageReimbursementApplied: false,
        estimatedFuelCost: 35.56,
        includeMileageInJobCosts: true,
        actualFuelCost: null,
        fuelReconciliation: "estimate_only",
        subLaborCost: 0,
        allocPaid: 0,
        totalSubHours: 0,
        ownerDrawTaken: 0,
        growthReservePct: 5,
        ownerSplitPct: 50,
        taxReservePct: 25,
        splitPool: 950,
      };
      const fixture = {
        jobId: job.id,
        title: jobTitle,
        invoiceId: invoice.id,
        subcontractorId: subcontractor.id,
        subcontractorName: subcontractor.name,
        profit: { ...profit, mileageReimbursement: null },
      };
      fixtureJobs.push(fixture);
      respondedProfitByJob.set(job.id, fixture.profit);
      return fixture;
    }

    const reimbursementFixture = await createFixture({
      title: `E2E Saved Reimbursement ${Date.now()}`,
      status: "closed",
      reimbursement: {
        amount: "177.80",
        estimatedAmount: "35.56",
        recipientType: "owner",
        recipientName: "Business owner",
        status: "owed",
      },
      profit: {
        grossInvoiced: 1000,
        collected: 1000,
        jobExpenses: 177.8,
        netProfit: 822.2,
        mileageReimbursementApplied: true,
        estimatedFuelCost: 35.56,
        includeMileageInJobCosts: true,
        actualFuelCost: null,
        fuelReconciliation: "reimbursement_differs_from_estimate",
        subLaborCost: 0,
        allocPaid: 0,
        totalSubHours: 0,
        ownerDrawTaken: 0,
        growthReservePct: 5,
        ownerSplitPct: 50,
        taxReservePct: 25,
      },
    });

    const estimateFixture = await createFixture({
      title: "E2E Estimate Only",
      profit: {
        grossInvoiced: 1000,
        collected: 1000,
        jobExpenses: 35.56,
        netProfit: 964.44,
        mileageReimbursementApplied: true,
        estimatedFuelCost: 35.56,
        includeMileageInJobCosts: true,
        actualFuelCost: null,
        fuelReconciliation: "estimate_only",
        subLaborCost: 0,
        allocPaid: 0,
        totalSubHours: 0,
        ownerDrawTaken: 0,
        growthReservePct: 5,
        ownerSplitPct: 50,
        taxReservePct: 25,
      },
    });

    const actualFixture = await createFixture({
      title: "E2E Actual Fuel",
      reimbursement: {
        amount: "177.80",
        estimatedAmount: "35.56",
      },
      expense: {
        amount: "52.00",
        category: "Fuel/Travel",
        description: "Temporary actual Fuel/Travel fixture",
      },
      profit: {
        grossInvoiced: 1000,
        collected: 1000,
        jobExpenses: 52,
        netProfit: 948,
        mileageReimbursementApplied: false,
        estimatedFuelCost: 35.56,
        includeMileageInJobCosts: true,
        actualFuelCost: 52,
        fuelReconciliation: "actual_fuel_expense_replaces_reimbursement",
        subLaborCost: 0,
        allocPaid: 0,
        totalSubHours: 0,
        ownerDrawTaken: 0,
        growthReservePct: 5,
        ownerSplitPct: 50,
        taxReservePct: 25,
      },
    });
    const allocationFixture = await createAllocationFixture();

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1200 });
    await page.setRequestInterception(true);
    const reimbursementSavePath = `/api/jobs/${reimbursementFixture.jobId}/mileage-reimbursement`;
    let allowedReimbursementSaveCount = 0;
    page.on("request", request => {
      if (request.isInterceptResolutionHandled()) return;
      const method = request.method().toUpperCase();
      const url = new URL(request.url());
      if (method === "PUT" && url.pathname === reimbursementSavePath) {
        allowedReimbursementSaveCount += 1;
        const saved = reimbursementFixture.profit.mileageReimbursement;
        if (!saved) {
          void request.abort();
          return;
        }
        let body: Record<string, unknown>;
        try {
          body = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
        } catch {
          void request.abort();
          return;
        }
        const nextAmount = Number(body.amount);
        if (!Number.isFinite(nextAmount) || nextAmount < 0) {
          void request.abort();
          return;
        }
        const previousAmount = saved.amount;
        const nextRecipientType = body.recipientType === "owner"
          || body.recipientType === "subcontractor"
          || body.recipientType === "other"
          ? body.recipientType
          : saved.recipientType;
        const nextStatus = body.status === "paid" ? "paid" : "owed";
        const nextRecipientName = typeof body.recipientName === "string" && body.recipientName.trim()
          ? body.recipientName.trim()
          : saved.recipientName;
        reimbursementFixture.profit.mileageReimbursement = {
          ...saved,
          amount: nextAmount,
          estimatedAmount: body.estimatedAmount == null ? null : Number(body.estimatedAmount),
          recipientType: nextRecipientType,
          recipientName: nextRecipientName,
          status: nextStatus,
        };
        reimbursementFixture.profit.jobExpenses += nextAmount - previousAmount;
        reimbursementFixture.profit.netProfit -= nextAmount - previousAmount;
        void request.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ...reimbursementFixture.profit.mileageReimbursement,
            paidAt: nextStatus === "paid" ? body.paidAt ?? null : null,
            recipientSubcontractorId: null,
            notes: body.notes ?? null,
          }),
        });
        return;
      }
      if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
        unexpectedWrites.push(`${method} ${request.url()}`);
        void request.abort();
        return;
      }

      const jobProfitMatch = url.pathname.match(/\/api\/jobs\/(\d+)\/profit$/);
      const isSummaryRequest = url.pathname.endsWith("/api/jobs/profit-summary");
      if (!jobProfitMatch && !isSummaryRequest) {
        void request.continue();
        return;
      }

      interceptedProfitRequests.push(request.url());
      const body = isSummaryRequest
        ? JSON.stringify(Object.fromEntries(
            fixtureJobs.map(fixture => [
              fixture.jobId,
              {
                ...fixture.profit,
                mileageReimbursement: fixture.profit.mileageReimbursement?.amount ?? null,
              },
            ]),
          ))
        : JSON.stringify(respondedProfitByJob.get(Number(jobProfitMatch?.[1])));
      void request.respond({
        status: 200,
        contentType: "application/json",
        body,
      });
    });

    const proof = createTestLoginProof("/jobs");
    const loginParams = new URLSearchParams({
      returnTo: "/jobs",
      ...proof,
    });
    await page.goto(`${BASE}/api/dev-test-login?${loginParams.toString()}`, {
      waitUntil: "networkidle2",
      timeout: 60_000,
    });

    const cookies = await page.cookies();
    sessionId = cookies.find(cookie => cookie.name === "sid")?.value;
    await page.waitForFunction(
      title => document.body.innerText.includes(title) || document.body.innerText.includes("Closed Jobs"),
      { timeout: 30_000 },
      reimbursementFixture.title,
    );
    record(
      "Authenticated Jobs page loads the temporary fixtures",
      page.url().endsWith("/jobs") && (await page.title()).length > 0,
      page.url(),
    );
    await page.screenshot({ path: `${SHOTS}/01-job-financials-fixtures.png`, fullPage: true });

    async function verifyFixture(
      fixture: JobFixture,
      checks: {
        name: string;
        flow?: "active" | "closed";
        requiredCategories: string[];
        forbiddenCategories: string[];
        requiredText?: string;
        forbiddenText?: string;
      },
      screenshotName: string,
    ) {
      await page.goto(`${BASE}/jobs`, {
        waitUntil: "networkidle2",
        timeout: 60_000,
      });
      await page.waitForFunction(
        title => document.body.innerText.includes(title)
          || (document.body.innerText.includes("Closed Jobs") && document.body.innerText.includes("Jobs")),
        { timeout: 30_000 },
        fixture.title,
      );

      let clickedPnl: boolean;
      if (checks.flow === "closed") {
        const openedClosedJobs = await openJobsSection(page, "Closed Jobs");
        record(`${checks.name}: Closed Jobs section opens`, openedClosedJobs);
        clickedPnl = await openClosedJobFinancials(page, fixture.title);
      } else {
        const expandedJobCard = await clickButtonInJobCard(page, fixture.title, "Open Job Card");
        record(`${checks.name}: job card opens`, expandedJobCard);
        clickedPnl = await clickButtonInJobCard(page, fixture.title, "Job P&L");
      }
      record(`${checks.name}: Job Financials panel opens`, clickedPnl);
      await page.waitForFunction(
        () => [...document.querySelectorAll("h2")]
          .some(element => element.textContent?.trim() === "Job Financials"),
        { timeout: 10_000 },
      );
      record(
        `${checks.name}: per-job profit API response reaches the browser`,
        interceptedProfitRequests.some(url => url.includes(`/api/jobs/${fixture.jobId}/profit`)),
      );

      const apiProfit = respondedProfitByJob.get(fixture.jobId);
      const expectedJobCosts = apiProfit ? money(apiProfit.jobExpenses) : "";
      if (expectedJobCosts !== "0.00") {
        await page.waitForFunction(
          () => [...document.querySelectorAll("button")]
            .some(element => element.textContent?.includes("Expense details")),
          { timeout: 10_000 },
        );
        const clickedExpenses = await clickButtonContaining(page, "Expense details");
        record(`${checks.name}: expense details open`, clickedExpenses);
        await page.waitForFunction(
          () => document.body.innerText.includes("Included cost total"),
          { timeout: 10_000 },
        );
      } else {
        record(`${checks.name}: expense details not applicable`, true);
      }

      const panel = await readFinancialPanel(page);
      const includedTotal = panel.text.match(/Included cost total\s*\$([0-9,]+\.[0-9]{2})/)?.[1] ?? "";
      const jobCosts = panel.text.match(/Job Costs\s*−?\$([0-9,]+\.[0-9]{2})/)?.[1] ?? "";
      const missingCategories = checks.requiredCategories
        .filter(category => !panel.categories.includes(category));
      const presentForbiddenCategories = checks.forbiddenCategories
        .filter(category => panel.categories.includes(category));

      record(
        `${checks.name}: Included cost total matches API value`,
        includedTotal === expectedJobCosts,
        `api=${expectedJobCosts || "missing"}, included=${includedTotal || "missing"}`,
      );
      record(
        `${checks.name}: Job Costs matches API value`,
        jobCosts === expectedJobCosts,
        `api=${expectedJobCosts || "missing"}, jobCosts=${jobCosts || "missing"}`,
      );
      record(
        `${checks.name}: expense sources are not duplicated`,
        missingCategories.length === 0 && presentForbiddenCategories.length === 0,
        `categories=${panel.categories.join(", ") || "none"}`,
      );
      if (checks.requiredText) {
        record(
          `${checks.name}: expected reconciliation text is visible`,
          panel.text.includes(checks.requiredText),
        );
      }
      if (checks.forbiddenText) {
        record(
          `${checks.name}: reimbursement is not added again`,
          !panel.text.includes(checks.forbiddenText),
          `forbidden=${checks.forbiddenText}`,
        );
      }
      await page.screenshot({ path: `${SHOTS}/${screenshotName}`, fullPage: true });
    }

    async function readAllocationAmounts(section: "Scheduled" | "Awaiting Payment" | "Paid") {
      await page.goto(`${BASE}/jobs`, {
        waitUntil: "networkidle2",
        timeout: 60_000,
      });
      if (section !== "Scheduled") {
        const opened = await openJobsSection(page, section);
        record(`Allocation fixture: ${section} section opens`, opened);
      }
      const foundTitle = await page.waitForFunction(
        title => document.body.innerText.includes(title),
        { timeout: 10_000 },
        allocationFixture.title,
      ).then(() => true).catch(() => false);
      record(
        `Allocation fixture ${section}: job is visible`,
        foundTitle,
        foundTitle ? "" : (await page.evaluate(() => document.body.innerText)).slice(0, 500),
      );
      if (!foundTitle) return { compactAmount: "", fullAmount: "" };
      await new Promise(resolve => setTimeout(resolve, 1_000));
      const cardText = await readCompactSubcontractorAmount(page, allocationFixture.title);
      const compactAmount = cardText.match(/Subcontractors\s*\$([0-9,]+\.[0-9]{2})/)?.[1] ?? "";
      record(
        `Allocation fixture ${section}: compact payment snapshot is available`,
        cardText.includes("Payment snapshot"),
        `amount=${compactAmount || "missing"}`,
      );
      const openedCard = section === "Scheduled"
        ? await clickButtonInJobCard(page, allocationFixture.title, "Open Job Card")
        : true;
      record(`Allocation fixture ${section}: compact Job Card opens`, openedCard);
      const openedPanel = await clickButtonInJobCard(page, allocationFixture.title, "Job P&L");
      record(`Allocation fixture ${section}: Job Financials opens`, openedPanel);
      await page.waitForFunction(
        () => [...document.querySelectorAll("h2")]
          .some(element => element.textContent?.trim() === "Job Financials"),
        { timeout: 10_000 },
      );
      await page.waitForFunction(
        expected => {
          const panel = document.querySelector('[data-testid="job-financials-panel"]');
          const text = panel?.textContent?.replace(/\s+/g, " ").trim() ?? "";
          return text.includes(`${expected.name} (50.0%)`)
            && text.includes("$475.00");
        },
        { timeout: 10_000 },
        { name: allocationFixture.subcontractorName, amount: "475.00" },
      );
      const panel = await page.evaluate(() => {
        const heading = [...document.querySelectorAll("h2")]
          .find(element => element.textContent?.trim() === "Job Financials");
        return heading?.closest("div.fixed")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      });
      const workerName = allocationFixture.subcontractorName?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") ?? "";
      const fullAmount = panel.match(new RegExp(`${workerName}\\s*\\(50\\.0%\\)\\s*\\$([0-9,]+\\.[0-9]{2})`))?.[1] ?? "";
      record(
        `Allocation fixture ${section}: compact and full worker amounts match`,
        compactAmount === fullAmount && compactAmount === "475.00",
        `compact=${compactAmount || "missing"}, full=${fullAmount || "missing"}`,
      );
      return { compactAmount, fullAmount };
    }

    const scheduledAmounts = await readAllocationAmounts("Scheduled");
    await db.update(jobsTable).set({ status: "completed" }).where(eq(jobsTable.id, allocationFixture.jobId));
    const awaitingAmounts = await readAllocationAmounts("Awaiting Payment");
    await db.update(invoicesTable).set({
      status: "paid",
      amountPaid: "1000.00",
      lastManualPaidAt: new Date(),
    }).where(eq(invoicesTable.id, allocationFixture.invoiceId!));
    allocationFixture.profit.collected = 1000;
    const paidAmounts = await readAllocationAmounts("Paid");
    record(
      "Allocation fixture: worker amount stays stable across status transitions",
      [scheduledAmounts, awaitingAmounts, paidAmounts]
        .every(amounts => amounts.compactAmount === "475.00" && amounts.fullAmount === "475.00"),
    );

    const [forbiddenCounts] = await Promise.all([
      Promise.all([
        db.select({ id: expensesTable.id }).from(expensesTable).where(eq(expensesTable.jobId, allocationFixture.jobId)),
        db.select({ id: mileageLogsTable.id }).from(mileageLogsTable).where(eq(mileageLogsTable.jobId, allocationFixture.jobId)),
        db.select({ id: subPaymentRecordsTable.id }).from(subPaymentRecordsTable).where(eq(subPaymentRecordsTable.jobId, allocationFixture.jobId)),
        db.select({ id: ownerCapitalEntriesTable.id }).from(ownerCapitalEntriesTable).where(eq(ownerCapitalEntriesTable.jobId, allocationFixture.jobId)),
      ]),
    ]);
    record(
      "Allocation fixture: estimate remains job-only with no ledger rows",
      forbiddenCounts.every(rows => rows.length === 0),
      `expenses=${forbiddenCounts[0].length}, mileage=${forbiddenCounts[1].length}, payroll=${forbiddenCounts[2].length}, owner=${forbiddenCounts[3].length}`,
    );

    await verifyFixture(
      reimbursementFixture,
      {
        name: "Saved reimbursement",
        flow: "closed",
        requiredCategories: ["Mileage Reimbursement"],
        forbiddenCategories: ["Estimated Fuel", "Fuel/Travel"],
        requiredText: "current route estimate is $35.56 and is reference-only",
      },
      "02-saved-reimbursement.png",
    );

    const initialSavedReimbursement = reimbursementFixture.profit.mileageReimbursement;
    if (!initialSavedReimbursement) {
      throw new Error("Saved reimbursement fixture did not include a reimbursement object");
    }
    const initialEditor = await readMileageReimbursementEditor(page);
    record(
      "Saved reimbursement: object response populates the scoped editor",
      initialEditor.amount === money(initialSavedReimbursement.amount)
        && initialEditor.recipientType === initialSavedReimbursement.recipientType
        && initialEditor.recipientName === initialSavedReimbursement.recipientName
        && initialEditor.status === initialSavedReimbursement.status,
      JSON.stringify(initialEditor),
    );

    const editedReimbursement = {
      amount: "244.18",
      recipientType: "other" as const,
      recipientName: "Alex Rivera",
      status: "paid" as const,
    };
    const editorUpdated = await updateMileageReimbursementEditor(page, editedReimbursement);
    record("Saved reimbursement edit: amount, recipient, and status can be changed", editorUpdated);
    const clickedSave = await clickButtonContaining(page, "Save reimbursement changes");
    record("Saved reimbursement edit: save button submits", clickedSave);
    for (let attempt = 0; attempt < 100 && allowedReimbursementSaveCount === 0; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    await page.waitForFunction(
      expected => {
        const panel = document.querySelector('[data-testid="job-financials-panel"]');
        const amount = panel?.querySelector('input[type="number"]') as HTMLInputElement | null;
        const status = [...(panel?.querySelectorAll("select") ?? [])]
          .find(select => [...select.options].some(option => option.value === "paid")) as HTMLSelectElement | undefined;
        const recipientType = [...(panel?.querySelectorAll("select") ?? [])]
          .find(select => [...select.options].some(option => option.value === "other")) as HTMLSelectElement | undefined;
        const recipient = panel?.querySelector(
          'input[placeholder="Name of person who paid"]',
        ) as HTMLInputElement | null;
        const saveButton = [...(panel?.querySelectorAll("button") ?? [])]
          .find(button => (button.textContent ?? "").includes("Save reimbursement changes"));
        return saveButton != null
          && amount?.value === expected.amount
          && status?.value === expected.status
          && recipientType?.value === expected.recipientType
          && recipient?.value === expected.recipientName;
      },
      { timeout: 10_000 },
      editedReimbursement,
    );
    record(
      "Saved reimbursement edit: refreshed detail response contains updated fields",
      allowedReimbursementSaveCount === 1
        && reimbursementFixture.profit.mileageReimbursement?.amount === Number(editedReimbursement.amount)
        && reimbursementFixture.profit.mileageReimbursement?.recipientType === editedReimbursement.recipientType
        && reimbursementFixture.profit.mileageReimbursement?.recipientName === editedReimbursement.recipientName
        && reimbursementFixture.profit.mileageReimbursement?.status === editedReimbursement.status,
      JSON.stringify(reimbursementFixture.profit.mileageReimbursement),
    );
    const updatedEditor = await readMileageReimbursementEditor(page);
    record(
      "Saved reimbursement edit: updated editor values match the detail response",
      JSON.stringify(updatedEditor) === JSON.stringify({
        amount: editedReimbursement.amount,
        recipientType: editedReimbursement.recipientType,
        recipientName: editedReimbursement.recipientName,
        status: editedReimbursement.status,
      }),
      JSON.stringify(updatedEditor),
    );

    const closeFinancials = await page.$eval(
      '[data-testid="job-financials-panel"] button',
      button => {
        (button as HTMLButtonElement).click();
        return true;
      },
    ).catch(() => false);
    record("Saved reimbursement edit: financials panel closes", closeFinancials);
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="job-financials-panel"]'),
      { timeout: 10_000 },
    );
    const reopenedFinancialsAfterEdit = await openClosedJobFinancials(page, reimbursementFixture.title);
    record("Saved reimbursement edit: financials panel reopens", reopenedFinancialsAfterEdit);
    await page.waitForFunction(
      () => Boolean(document.querySelector('[data-testid="job-financials-panel"]')),
      { timeout: 10_000 },
    );
    await page.waitForFunction(
      expected => {
        const panel = document.querySelector('[data-testid="job-financials-panel"]');
        const recipient = panel?.querySelector(
          'input[placeholder="Name of person who paid"]',
        ) as HTMLInputElement | null;
        return recipient?.value === expected.recipientName;
      },
      { timeout: 10_000 },
      editedReimbursement,
    );
    record(
      "Saved reimbursement after close and reopen: all edited fields persist",
      JSON.stringify(await readMileageReimbursementEditor(page)) === JSON.stringify({
        amount: editedReimbursement.amount,
        recipientType: editedReimbursement.recipientType,
        recipientName: editedReimbursement.recipientName,
        status: editedReimbursement.status,
      }),
      JSON.stringify(await readMileageReimbursementEditor(page)),
    );

    const updatedSavedReimbursement = reimbursementFixture.profit.mileageReimbursement;
    if (!updatedSavedReimbursement) {
      throw new Error("Edited reimbursement fixture did not include an updated reimbursement object");
    }
    await page.reload({ waitUntil: "networkidle2", timeout: 60_000 });
    await page.waitForFunction(
      title => document.body.innerText.includes(title) || document.body.innerText.includes("Closed Jobs"),
      { timeout: 30_000 },
      reimbursementFixture.title,
    );
    record(
      "Saved reimbursement: browser reload returns to the Jobs page",
      page.url().endsWith("/jobs"),
      page.url(),
    );
    record(
      "Saved reimbursement: no write occurred during reload",
      unexpectedWrites.length === 0,
      unexpectedWrites.join("; "),
    );
    const openedClosedJobsAfterRefresh = await openJobsSection(page, "Closed Jobs");
    record("Saved reimbursement after refresh: Closed Jobs section opens", openedClosedJobsAfterRefresh);
    const reopenedFinancials = await openClosedJobFinancials(page, reimbursementFixture.title);
    record("Saved reimbursement after refresh: Job Financials panel opens", reopenedFinancials);
    await page.waitForFunction(
      () => Boolean(document.querySelector('[data-testid="job-financials-panel"]')),
      { timeout: 10_000 },
    );
    await page.waitForFunction(
      expectedName => {
        const panel = document.querySelector('[data-testid="job-financials-panel"]');
        return (panel?.querySelector(
          'input[placeholder="Name of person who paid"]',
        ) as HTMLInputElement | null)?.value === expectedName;
      },
      { timeout: 10_000 },
      updatedSavedReimbursement.recipientName,
    );
    const refreshedEditor = await readMileageReimbursementEditor(page);
    record(
      "Saved reimbursement after refresh: amount, recipient, and status persist",
      refreshedEditor.amount === money(updatedSavedReimbursement.amount)
        && refreshedEditor.recipientType === updatedSavedReimbursement.recipientType
        && refreshedEditor.recipientName === updatedSavedReimbursement.recipientName
        && refreshedEditor.status === updatedSavedReimbursement.status,
      JSON.stringify(refreshedEditor),
    );
    record(
      "Saved reimbursement after refresh: numeric batch value does not overwrite detail fields",
      refreshedEditor.recipientName === updatedSavedReimbursement.recipientName
        && refreshedEditor.recipientType === updatedSavedReimbursement.recipientType
        && refreshedEditor.status === updatedSavedReimbursement.status,
      `batch=${initialSavedReimbursement.amount}, editor=${JSON.stringify(refreshedEditor)}`,
    );

    await verifyFixture(
      estimateFixture,
      {
        name: "Estimate-only fuel",
        requiredCategories: ["Estimated Fuel"],
        forbiddenCategories: ["Mileage Reimbursement", "Fuel/Travel"],
        requiredText: "Estimate only — not in accounting reports",
      },
      "03-estimate-only.png",
    );

    await verifyFixture(
      actualFixture,
      {
        name: "Actual Fuel/Travel expense",
        requiredCategories: ["Fuel/Travel"],
        forbiddenCategories: ["Mileage Reimbursement", "Estimated Fuel"],
        forbiddenText: "$229.80",
      },
      "04-actual-fuel-replaces-reimbursement.png",
    );

    record(
      "Authenticated browser made no unexpected writes",
      unexpectedWrites.length === 0,
      unexpectedWrites.join("; "),
    );
  } finally {
    await browser.close();
    if (sessionId) {
      await db.delete(sessionsTable).where(eq(sessionsTable.sid, sessionId));
    }
    for (const id of expenseIds) {
      await db.delete(expensesTable).where(eq(expensesTable.id, id));
    }
    for (const id of reimbursementIds) {
      await db.delete(jobMileageReimbursementsTable)
        .where(eq(jobMileageReimbursementsTable.id, id));
    }
    for (const jobId of jobSubcontractorJobIds) {
      await db.delete(subPaymentRecordsTable).where(eq(subPaymentRecordsTable.jobId, jobId));
      await db.delete(jobSubcontractorsTable).where(eq(jobSubcontractorsTable.jobId, jobId));
    }
    for (const id of invoiceIds) {
      await db.delete(invoicesTable).where(eq(invoicesTable.id, id));
    }
    for (const id of jobIds) {
      await db.delete(jobsTable).where(eq(jobsTable.id, id));
    }
    for (const id of subcontractorIds) {
      await db.delete(subcontractorsTable).where(eq(subcontractorsTable.id, id));
    }
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