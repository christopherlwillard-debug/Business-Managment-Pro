/* Authenticated browser regression check for the Job Financials mileage waterfall.
 *
 * Run:
 *   pnpm --filter @workspace/api-server run verify:job-financials
 *
 * The check creates a temporary "Grubb" job with a saved reimbursement, serves
 * the differing current fuel estimate through the real authenticated API
 * response consumed by the page, and removes the fixture and test session in
 * all exit paths.
 */
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Page } from "puppeteer";
import { db } from "@workspace/db";
import {
  businessesTable,
  jobMileageReimbursementsTable,
  jobsTable,
  sessionsTable,
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

type ProfitFixture = {
  grossInvoiced: number;
  collected: number;
  jobExpenses: number;
  netProfit: number;
  mileageReimbursement: {
    id: number;
    amount: number;
    estimatedAmount: number;
    recipientType: "owner";
    recipientName: string;
    status: "owed";
  };
  mileageReimbursementApplied: true;
  estimatedFuelCost: number;
  includeMileageInJobCosts: true;
  actualFuelCost: null;
  fuelReconciliation: "reimbursement_differs_from_estimate";
  subLaborCost: number;
  allocPaid: number;
  totalSubHours: number;
  ownerDrawTaken: number;
  growthReservePct: number;
  ownerSplitPct: number;
  taxReservePct: number;
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

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });

  let jobId: number | undefined;
  let reimbursementId: number | undefined;
  let sessionId: string | undefined;
  let profitFixture: ProfitFixture | undefined;
  const unexpectedWrites: string[] = [];
  const interceptedProfitRequests: string[] = [];
  const browser = await launchBrowser();

  try {
    const [business] = await db
      .select({ id: businessesTable.id, slug: businessesTable.slug })
      .from(businessesTable)
      .orderBy(businessesTable.id)
      .limit(1);
    if (!business) throw new Error("No development business is available for the browser fixture");

    const [job] = await db.insert(jobsTable).values({
      title: `Grubb`,
      status: "scheduled",
      businessLine: business.slug,
      businessId: business.id,
      planningState: "ready",
      priority: "normal",
      resourceDemand: "standard",
    }).returning({ id: jobsTable.id });
    jobId = job.id;

    const [reimbursement] = await db.insert(jobMileageReimbursementsTable).values({
      jobId: job.id,
      businessId: business.id,
      amount: "177.80",
      estimatedAmount: "35.56",
      recipientType: "owner",
      recipientName: "Business owner",
      status: "owed",
      notes: "Temporary browser verification fixture",
    }).returning({ id: jobMileageReimbursementsTable.id });
    reimbursementId = reimbursement.id;

    profitFixture = {
      grossInvoiced: 1000,
      collected: 1000,
      jobExpenses: 177.8,
      netProfit: 822.2,
      mileageReimbursement: {
        id: reimbursement.id,
        amount: 177.8,
        estimatedAmount: 35.56,
        recipientType: "owner",
        recipientName: "Business owner",
        status: "owed",
      },
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
    };

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1200 });
    await page.setRequestInterception(true);
    page.on("request", request => {
      if (request.isInterceptResolutionHandled()) return;
      const method = request.method().toUpperCase();
      if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
        unexpectedWrites.push(`${method} ${request.url()}`);
        void request.abort();
        return;
      }

      const url = new URL(request.url());
      const isProfitRequest =
        url.pathname.endsWith(`/api/jobs/${job.id}/profit`)
        || url.pathname.endsWith("/api/jobs/profit-summary");
      if (!isProfitRequest) {
        void request.continue();
        return;
      }

      interceptedProfitRequests.push(request.url());
      const body = url.pathname.endsWith("/profit-summary")
        ? JSON.stringify({ [job.id]: profitFixture })
        : JSON.stringify(profitFixture);
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
      title => document.body.innerText.includes(title),
      { timeout: 30_000 },
      "Grubb",
    );
    record(
      "Authenticated Jobs page loads the Grubb fixture",
      page.url().endsWith("/jobs") && (await page.title()).length > 0,
      page.url(),
    );
    await page.screenshot({ path: `${SHOTS}/01-grubb-jobs.png`, fullPage: true });

    const expandedJobCard = await clickButtonInJobCard(page, "Grubb", "Open Job Card");
    record("Grubb job card opens", expandedJobCard);
    record(
      "Profit summary API response reaches the browser",
      interceptedProfitRequests.some(url => url.includes("/api/jobs/profit-summary")),
    );
    const clickedPnl = await clickButtonInJobCard(page, "Grubb", "Job P&L");
    record("Grubb Job Financials panel opens", clickedPnl);
    await page.waitForFunction(
      () => [...document.querySelectorAll("h2")].some(element => element.textContent?.trim() === "Job Financials"),
      { timeout: 10_000 },
    );

    const clickedExpenses = await clickButtonContaining(page, "Expense details");
    record("Job Costs expense details open", clickedExpenses);
    await page.waitForFunction(
      () => document.body.innerText.includes("Included cost total"),
      { timeout: 10_000 },
    );

    const panelText = await page.evaluate(() => {
      const heading = [...document.querySelectorAll("h2")]
        .find(element => element.textContent?.trim() === "Job Financials");
      return heading?.closest("div.fixed")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    });
    const normalizedPanelText = panelText.replace(/\s+/g, " ");
    const includedTotal = normalizedPanelText.match(/Included cost total\s*\$([0-9,]+\.[0-9]{2})/)?.[1] ?? "";
    const jobCosts = normalizedPanelText.match(/Job Costs\s*−?\$([0-9,]+\.[0-9]{2})/)?.[1] ?? "";
    const expenseCategories = await page.evaluate(() => {
      const totalLabel = [...document.querySelectorAll("span")]
        .find(element => element.textContent?.trim() === "Included cost total");
      const expenseList = totalLabel?.parentElement?.parentElement;
      return [...(expenseList?.children ?? [])]
        .filter(element => !element.textContent?.includes("Included cost total"))
        .map(element => element.querySelector("span")?.textContent?.trim() ?? "");
    });
    const includedMileageRows = expenseCategories.filter(category => category === "Mileage Reimbursement").length;

    record(
      "Saved reimbursement is the sole included mileage cost",
      includedMileageRows === 1
        && includedTotal === "177.80",
      `includedMileageRows=${includedMileageRows}, included=${includedTotal || "missing"}`,
    );
    record(
      "Current fuel estimate is visibly reference-only",
      normalizedPanelText.includes("current route estimate is $35.56 and is reference-only"),
    );
    record(
      "Included cost total matches Job Costs without double-counting",
      includedTotal === "177.80"
        && jobCosts === "177.80"
        && !normalizedPanelText.includes("$213.36"),
      `jobCosts=${jobCosts || "missing"}, included=${includedTotal || "missing"}`,
    );
    record(
      "Authenticated browser made no unexpected writes",
      unexpectedWrites.length === 0,
      unexpectedWrites.join("; "),
    );

    await page.screenshot({ path: `${SHOTS}/02-grubb-job-financials.png`, fullPage: true });
  } finally {
    await browser.close();
    if (sessionId) {
      await db.delete(sessionsTable).where(eq(sessionsTable.sid, sessionId));
    }
    if (reimbursementId) {
      await db.delete(jobMileageReimbursementsTable)
        .where(eq(jobMileageReimbursementsTable.id, reimbursementId));
    }
    if (jobId) {
      await db.delete(jobsTable).where(eq(jobsTable.id, jobId));
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