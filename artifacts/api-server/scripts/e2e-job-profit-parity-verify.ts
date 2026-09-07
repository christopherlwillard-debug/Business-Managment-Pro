/* Authenticated browser regression check for canonical job-profit wiring.
 *
 * Run:
 *   pnpm --filter @workspace/api-server run verify:job-profit-parity
 *
 * The browser uses read-only fixture responses for two jobs and two route
 * stops. This keeps the check deterministic while exercising the real Jobs,
 * Job Payroll, and Route Planner screens through the authenticated app shell.
 * Every browser write is aborted and the temporary test session is removed.
 */
import fs from "node:fs";
import type { Page } from "puppeteer";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { sessionsTable } from "@workspace/db/schema";
import { createTestLoginProof } from "../src/lib/auth";
import { launchBrowser } from "../src/lib/launchBrowser";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:80";
const SHOTS = "/tmp/e2e-job-profit-parity";

if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
  throw new Error("Refusing to run job-profit parity verification against a production deployment");
}

const baseUrl = new URL(BASE);
const baseHostname = baseUrl.hostname.replace(/^\[|\]$/g, "");
if (baseUrl.protocol !== "http:" || !["localhost", "127.0.0.1", "::1"].includes(baseHostname)) {
  throw new Error(
    `Refusing to run job-profit parity verification against non-local target ${baseUrl.origin}. ` +
    "Set E2E_BASE_URL to a local development server.",
  );
}

const results: { name: string; pass: boolean; detail?: string }[] = [];

function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
}

function localDateString(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function readMoneyAfter(text: string, label: string): number | null {
  const normalized = text.replace(/−/g, "-").replace(/\s+/g, " ");
  const labelIndex = normalized.toLowerCase().indexOf(label.toLowerCase());
  if (labelIndex < 0) return null;
  const snippet = normalized.slice(labelIndex + label.length, labelIndex + label.length + 40);
  const match = snippet.match(/\$[0-9,]+(?:\.\d{2})?/);
  if (!match) return null;
  const amount = Number(match[0].replace(/[$,]/g, ""));
  const dollarIndex = snippet.indexOf("$");
  const signAfterLabel = snippet.slice(0, dollarIndex).includes("-");
  const signBeforeCostLabel = label.toLowerCase().includes("cost")
    && normalized.slice(Math.max(0, labelIndex - 12), labelIndex).includes("-");
  return signAfterLabel || signBeforeCostLabel ? -amount : amount;
}

function nearlyEqual(left: number | null, right: number | null): boolean {
  return left != null && right != null && Math.abs(left - right) < 0.01;
}

type ProfitFixture = {
  grossInvoiced: number;
  collected: number;
  jobExpenses: number;
  subLaborCost: number;
  allocPaid: number;
  totalSubHours: number;
  netProfit: number;
  splitPool: number;
  includeMileageInJobCosts: true;
  mileageReimbursementApplied: false;
  mileageReimbursement: null;
  estimatedFuelCost: null;
  actualFuelCost: null;
  ownerDrawTaken: number;
  growthReservePct: number;
  ownerSplitPct: number;
  taxReservePct: number;
  profitBreakdown: {
    includedCosts: {
      directExpenses: number;
      allocatedExpenses: number;
      subLabor: number;
      splitPayouts: number;
      mileageReimbursement: number;
      estimatedFuel: number;
      total: number;
    };
    excludedFromProfit: {
      ownerWithdrawals: number;
      auditTrail: number;
      payrollLinkedExpenses: number;
      legacySubcontractorExpense: number;
    };
  };
};

type JobFixture = {
  id: number;
  title: string;
  profit: ProfitFixture;
  job: Record<string, unknown>;
};

async function clickJobCardAction(page: Page, title: string, action: string): Promise<boolean> {
  return page.evaluate(({ jobTitle, buttonText }) => {
    const matchingTitles = [...document.querySelectorAll<HTMLElement>("*")]
      .filter(element => element.textContent?.trim() === jobTitle);
    for (const titleElement of matchingTitles) {
      let ancestor: HTMLElement | null = titleElement;
      for (let depth = 0; ancestor && depth < 20; depth += 1, ancestor = ancestor.parentElement) {
        const button = [...ancestor.querySelectorAll<HTMLButtonElement>("button")]
          .find(candidate => (candidate.textContent ?? "").includes(buttonText));
        if (button) {
          button.click();
          return true;
        }
      }
    }
    return false;
  }, { jobTitle: title, buttonText: action });
}

async function waitForText(page: Page, text: string, timeout = 20_000): Promise<boolean> {
  return page.waitForFunction(
    expected => document.body.innerText.includes(expected),
    { timeout },
    text,
  ).then(() => true).catch(() => false);
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });

  const today = localDateString();
  const firstJobId = 92101;
  const secondJobId = 92102;
  const fixtures: JobFixture[] = [
    {
      id: firstJobId,
      title: "E2E Profit Parity One",
      profit: {
        grossInvoiced: 1200,
        collected: 1200,
        jobExpenses: 125,
        subLaborCost: 0,
        allocPaid: 0,
        totalSubHours: 0,
        netProfit: 1075,
        splitPool: 1012,
        includeMileageInJobCosts: true,
        mileageReimbursementApplied: false,
        mileageReimbursement: null,
        estimatedFuelCost: null,
        actualFuelCost: null,
        ownerDrawTaken: 0,
        growthReservePct: 5,
        ownerSplitPct: 50,
        taxReservePct: 25,
        profitBreakdown: {
          includedCosts: {
            directExpenses: 125,
            allocatedExpenses: 0,
            subLabor: 0,
            splitPayouts: 0,
            mileageReimbursement: 0,
            estimatedFuel: 0,
            total: 125,
          },
          excludedFromProfit: {
            ownerWithdrawals: 0,
            auditTrail: 0,
            payrollLinkedExpenses: 0,
            legacySubcontractorExpense: 0,
          },
        },
      },
      job: {},
    },
    {
      id: secondJobId,
      title: "E2E Profit Parity Two",
      profit: {
        grossInvoiced: 800,
        collected: 800,
        jobExpenses: 80,
        subLaborCost: 0,
        allocPaid: 0,
        totalSubHours: 0,
        netProfit: 720,
        splitPool: 678,
        includeMileageInJobCosts: true,
        mileageReimbursementApplied: false,
        mileageReimbursement: null,
        estimatedFuelCost: null,
        actualFuelCost: null,
        ownerDrawTaken: 0,
        growthReservePct: 5,
        ownerSplitPct: 50,
        taxReservePct: 25,
        profitBreakdown: {
          includedCosts: {
            directExpenses: 80,
            allocatedExpenses: 0,
            subLabor: 0,
            splitPayouts: 0,
            mileageReimbursement: 0,
            estimatedFuel: 0,
            total: 80,
          },
          excludedFromProfit: {
            ownerWithdrawals: 0,
            auditTrail: 0,
            payrollLinkedExpenses: 0,
            legacySubcontractorExpense: 0,
          },
        },
      },
      job: {},
    },
  ];

  for (const fixture of fixtures) {
    fixture.job = {
      id: fixture.id,
      title: fixture.title,
      status: "scheduled",
      businessLine: "general_contracting",
      businessId: 1,
      planningState: "ready",
      priority: "normal",
      resourceDemand: "standard",
      clientName: "E2E Profit Client",
      locationName: "E2E Profit Address",
      address: "100 Test Street",
      city: "Testville",
      state: "KY",
      startDate: today,
      endDate: today,
      sqFt: 1000,
      coats: 1,
      checklistItems: [],
      unscheduledChecklistItems: [],
    };
  }

  const jobById = new Map(fixtures.map(fixture => [fixture.id, fixture]));
  const jobs = fixtures.map(fixture => fixture.job);
  const schedule = {
    jobs: jobs.map(job => ({
      ...job,
      checklistItems: [],
      unscheduledChecklistItems: [],
    })),
  };
  const routeStops = fixtures.map((fixture, index) => ({
    id: 93000 + index,
    title: fixture.title,
    address: "100 Test Street, Testville, KY",
    lat: null,
    lng: null,
    notes: null,
    scheduledDate: today,
    status: "scheduled",
    estimatedDurationMinutes: 60,
    sortOrder: index,
    blockNumber: null,
    crewLabel: null,
    clientId: null,
    prospectId: null,
    jobId: fixture.id,
    clientName: "E2E Profit Client",
    prospectContactName: null,
    prospectAddress: null,
    jobSqFt: 1000,
    jobCoats: 1,
    createdAt: new Date().toISOString(),
  }));

  const unexpectedWrites: string[] = [];
  const pageErrors: string[] = [];
  let delayedProfitJobId: number | null = null;
  let delayedProfitResponseUsed = false;
  let sessionId: string | undefined;
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1200 });
    page.on("pageerror", error => pageErrors.push(error.message));
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
      const path = url.pathname;
      const respondJson = (body: unknown) => {
        if (request.isInterceptResolutionHandled()) return;
        void request.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(body),
        });
      };

      if (path === "/api/jobs") {
        respondJson(jobs);
        return;
      }
      if (path === "/api/jobs/schedule-overview") {
        respondJson(schedule);
        return;
      }
      if (path === "/api/jobs/profit-summary") {
        const response = Object.fromEntries(
          fixtures.map(fixture => [fixture.id, fixture.profit]),
        );
        respondJson(response);
        return;
      }
      if (path === "/api/jobs/financials-summary") {
        respondJson({ jobs: [] });
        return;
      }
      if (path === "/api/jobs/outstanding-sub-balances") {
        respondJson({});
        return;
      }
      if (path === "/api/jobs/checklist-summaries") {
        respondJson({});
        return;
      }
      if (path === "/api/jobs/photo-counts") {
        respondJson({});
        return;
      }
      if (path === "/api/invoices/summaries") {
        const response = Object.fromEntries(
          fixtures.map(fixture => [fixture.id, {
            id: fixture.id * 10,
            jobId: fixture.id,
            status: "paid",
            total: fixture.profit.grossInvoiced,
            amountPaid: fixture.profit.collected,
          }]),
        );
        respondJson(response);
        return;
      }
      if (path === "/api/businesses") {
        respondJson([]);
        return;
      }
      if (path === "/api/settings") {
        respondJson({
          ownerSplitPct: 50,
          taxReservePct: 25,
          growthReservePct: 5,
          plStepOrder: JSON.stringify(["expenses", "labor", "growth"]),
        });
        return;
      }
      if (path === "/api/route-stops") {
        respondJson(routeStops);
        return;
      }
      if (path === "/api/mapbox-token") {
        respondJson({ token: null });
        return;
      }
      if (path === "/api/clients" || path === "/api/prospects") {
        respondJson([]);
        return;
      }

      const jobMatch = path.match(/^\/api\/jobs\/(\d+)$/);
      if (jobMatch) {
        respondJson(jobById.get(Number(jobMatch[1]))?.job ?? {});
        return;
      }

      const profitMatch = path.match(/^\/api\/jobs\/(\d+)\/profit$/);
      if (profitMatch) {
        const jobId = Number(profitMatch[1]);
        const fixture = jobById.get(jobId);
        if (!fixture) {
          respondJson({});
          return;
        }
        if (jobId === delayedProfitJobId && !delayedProfitResponseUsed) {
          delayedProfitResponseUsed = true;
          setTimeout(() => respondJson(fixture.profit), 900);
        } else {
          respondJson(fixture.profit);
        }
        return;
      }

      const subPaymentsMatch = path.match(/^\/api\/jobs\/(\d+)\/sub-payments$/);
      if (subPaymentsMatch) {
        respondJson([]);
        return;
      }
      const subHoursMatch = path.match(/^\/api\/jobs\/(\d+)\/sub-hours$/);
      if (subHoursMatch) {
        respondJson([]);
        return;
      }
      const expensesMatch = path.match(/^\/api\/jobs\/(\d+)\/expenses$/);
      if (expensesMatch) {
        respondJson([]);
        return;
      }
      if (path.startsWith("/api/owner-capital")) {
        respondJson([]);
        return;
      }

      void request.continue();
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
    sessionId = (await page.cookies()).find(cookie => cookie.name === "sid")?.value;

    const jobsLoaded = await waitForText(page, fixtures[0].title);
    record("Authenticated Jobs page loads the profit fixtures", jobsLoaded && page.url().endsWith("/jobs"));

    const openFinancials = async (fixture: JobFixture) => {
      await page.goto(`${BASE}/jobs`, { waitUntil: "networkidle2", timeout: 60_000 });
      const visible = await waitForText(page, fixture.title);
      const openedCard = visible && await clickJobCardAction(page, fixture.title, "Open Job Card");
      const openedPanel = openedCard && await clickJobCardAction(page, fixture.title, "Job P&L");
      record(`${fixture.title}: Job Financials opens from the job card`, Boolean(openedPanel));
      await waitForText(page, "Financial Summary");
      await page.waitForFunction(
        () => document.body.innerText.includes("Job Revenue") && document.body.innerText.includes("Net Business Profit"),
        { timeout: 20_000 },
      );
      return page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    };

    const financialsText = await openFinancials(fixtures[0]);
    const financialsValues = {
      revenue: readMoneyAfter(financialsText, "Job Revenue"),
      costs: readMoneyAfter(financialsText, "Job Costs"),
      splitPool: readMoneyAfter(financialsText, "Split Pool"),
      netProfit: readMoneyAfter(financialsText, "Net Business Profit"),
    };
    const firstExpected = fixtures[0].profit;
    record(
      "Job Financials displays the canonical revenue, costs, split pool, and net profit",
      nearlyEqual(financialsValues.revenue, firstExpected.grossInvoiced)
        && nearlyEqual(financialsValues.costs, -firstExpected.jobExpenses)
        && nearlyEqual(financialsValues.splitPool, firstExpected.splitPool)
        && nearlyEqual(financialsValues.netProfit, firstExpected.netProfit),
      JSON.stringify(financialsValues),
    );
    await page.screenshot({ path: `${SHOTS}/01-job-financials.png`, fullPage: true });

    await page.goto(`${BASE}/jobs/${firstJobId}/payroll`, {
      waitUntil: "networkidle2",
      timeout: 60_000,
    });
    const payrollLoaded = await waitForText(page, fixtures[0].title);
    const payrollValuesLoaded = await waitForText(page, "$1,200.00");
    if (!payrollValuesLoaded) {
      console.error(
        "PAYROLL DEBUG:",
        page.url(),
        (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").slice(0, 2000),
      );
      throw new Error("Job Payroll did not render the fixture profit summary");
    }
    const payrollText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    const payrollValues = {
      revenue: readMoneyAfter(payrollText, "Revenue"),
      costs: readMoneyAfter(payrollText, "Job Costs"),
      splitPool: readMoneyAfter(payrollText, "Split Pool"),
      netProfit: readMoneyAfter(payrollText, "Net Profit"),
    };
    record(
      "Job Payroll displays the canonical revenue, costs, split pool, and net profit",
      payrollLoaded
        && nearlyEqual(payrollValues.revenue, firstExpected.grossInvoiced)
        && nearlyEqual(payrollValues.costs, -firstExpected.jobExpenses)
        && nearlyEqual(payrollValues.splitPool, firstExpected.splitPool)
        && nearlyEqual(payrollValues.netProfit, firstExpected.netProfit),
      JSON.stringify(payrollValues),
    );
    record(
      "Job Financials and Job Payroll agree for the same job",
      nearlyEqual(financialsValues.revenue, payrollValues.revenue)
        && nearlyEqual(financialsValues.costs, payrollValues.costs)
        && nearlyEqual(financialsValues.splitPool, payrollValues.splitPool)
        && nearlyEqual(financialsValues.netProfit, payrollValues.netProfit),
      `financials=${JSON.stringify(financialsValues)} payroll=${JSON.stringify(payrollValues)}`,
    );
    await page.screenshot({ path: `${SHOTS}/02-job-payroll.png`, fullPage: true });

    await page.goto(`${BASE}/route-planner`, {
      waitUntil: "networkidle2",
      timeout: 60_000,
    });
    const routeProfitLoaded = await waitForText(page, "Route Profit");
    await page.waitForFunction(
      () => document.body.innerText.includes("Net Profit") && document.body.innerText.includes("+$1,795"),
      { timeout: 20_000 },
    );
    const routeText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    const routeNetProfit = readMoneyAfter(routeText, "Net Profit");
    const expectedRouteNetProfit = fixtures.reduce((total, fixture) => total + fixture.profit.netProfit, 0);
    record(
      "Route Planner displays the sum of the included jobs' canonical net profit",
      nearlyEqual(routeNetProfit, expectedRouteNetProfit),
      `loaded=${routeProfitLoaded}, displayed=${routeNetProfit ?? "missing"}, expected=${expectedRouteNetProfit}`,
    );
    await page.screenshot({ path: `${SHOTS}/03-route-profit.png`, fullPage: true });

    delayedProfitJobId = firstJobId;
    delayedProfitResponseUsed = false;
    await page.goto(`${BASE}/jobs/${firstJobId}/payroll`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    const firstRapidHeadingLoaded = await waitForText(page, fixtures[0].title);
    await new Promise(resolve => setTimeout(resolve, 100));
    await page.evaluate(path => {
      window.history.pushState({}, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, `${BASE}/jobs/${secondJobId}/payroll`);
    const secondRapidHeadingLoaded = await waitForText(page, fixtures[1].title);
    await page.waitForFunction(
      () => document.body.innerText.includes("$720.00"),
      { timeout: 20_000 },
    );
    await new Promise(resolve => setTimeout(resolve, 1_000));
    const rapidText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    const rapidNetProfit = readMoneyAfter(rapidText, "Net Profit");
    record(
      "Rapid payroll navigation keeps the second job's title and profit",
      firstRapidHeadingLoaded
        && secondRapidHeadingLoaded
        && nearlyEqual(rapidNetProfit, fixtures[1].profit.netProfit)
        && rapidText.includes(fixtures[1].title)
        && !rapidText.includes(fixtures[0].title),
      `displayed=${rapidNetProfit ?? "missing"}, path=${page.url()}`,
    );
    await page.screenshot({ path: `${SHOTS}/04-rapid-navigation.png`, fullPage: true });

    record(
      "Authenticated browser made no unexpected writes",
      unexpectedWrites.length === 0,
      unexpectedWrites.join("; "),
    );
    record(
      "Browser flow completed without page errors",
      pageErrors.length === 0,
      pageErrors.join("; "),
    );
  } finally {
    await browser.close();
    if (sessionId) {
      await db.delete(sessionsTable).where(eq(sessionsTable.sid, sessionId));
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