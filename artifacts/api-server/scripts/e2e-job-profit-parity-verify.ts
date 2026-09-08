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

function addDays(dateString: string, days: number): string {
  const [year, month, day] = dateString.split("-").map(Number);
  return localDateString(new Date(year, month - 1, day + days, 12));
}

function startOfWeekSunday(dateString: string): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  return localDateString(new Date(year, month - 1, day - date.getDay(), 12));
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

function formatMoneyLabel(value: number): string {
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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
          .find(candidate =>
            (candidate.textContent ?? "").includes(buttonText)
            || candidate.title === buttonText,
          );
        if (button) {
          button.click();
          return true;
        }
      }
    }
    return false;
  }, { jobTitle: title, buttonText: action });
}

async function clickRouteStopAction(page: Page, title: string, action: string): Promise<boolean> {
  return page.evaluate(({ stopTitle, buttonTitle }) => {
    const titleElement = [...document.querySelectorAll<HTMLElement>("span.text-sm.font-medium")]
      .find(element => element.textContent?.trim() === stopTitle)
      ?? [...document.querySelectorAll<HTMLElement>("*")]
        .find(element => element.textContent?.trim() === stopTitle);
    let ancestor: HTMLElement | null = titleElement ?? null;
    for (let depth = 0; ancestor && depth < 20; depth += 1, ancestor = ancestor.parentElement) {
      const button = ancestor.querySelector<HTMLButtonElement>(`button[title="${buttonTitle}"]`);
      if (button) {
        button.click();
        return true;
      }
    }
    return false;
  }, { stopTitle: title, buttonTitle: action });
}

async function dragRouteStop(page: Page, sourceTitle: string, targetTitle: string): Promise<boolean> {
  return page.evaluate(({ source, target }) => {
    const cards = [...document.querySelectorAll<HTMLElement>("[draggable='true']")];
    const titles = cards.map(card =>
      card.querySelector<HTMLElement>("span.text-sm.font-medium")?.textContent?.trim() ?? "",
    );
    const sourceIndex = titles.indexOf(source);
    const targetIndex = titles.indexOf(target);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return false;

    const dataTransfer = new DataTransfer();
    dataTransfer.effectAllowed = "move";
    dataTransfer.setData("text/plain", String(sourceIndex));
    const sourceCard = cards[sourceIndex];
    const targetCard = cards[targetIndex];
    sourceCard.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer }));
    targetCard.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer }));
    targetCard.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer }));
    targetCard.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
    sourceCard.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer }));
    return true;
  }, { source: sourceTitle, target: targetTitle });
}

async function waitForRouteStopOrder(page: Page, expectedTitles: string[]): Promise<boolean> {
  return page.waitForFunction(
    titles => {
      const actualTitles = [...document.querySelectorAll<HTMLElement>("[draggable='true']")]
        .map(card => card.querySelector<HTMLElement>("span.text-sm.font-medium")?.textContent?.trim() ?? "")
        .filter(Boolean);
      return JSON.stringify(actualTitles) === JSON.stringify(titles);
    },
    { timeout: 20_000 },
    expectedTitles,
  ).then(() => true).catch(() => false);
}

async function clickButtonByText(page: Page, text: string, scopeText?: string): Promise<boolean> {
  const index = await page.evaluate(({ buttonText, requiredScopeText }) => {
    const buttons = [...document.querySelectorAll<HTMLButtonElement>("button")];
    const candidate = buttons
      .filter(button => button.textContent?.trim() === buttonText)
      .find(button => {
        if (!requiredScopeText) return true;
        let ancestor: HTMLElement | null = button.parentElement;
        for (let depth = 0; ancestor && depth < 10; depth += 1, ancestor = ancestor.parentElement) {
          if (ancestor.textContent?.includes(requiredScopeText)) return true;
        }
        return false;
      });
    return candidate ? buttons.indexOf(candidate) : -1;
  }, { buttonText: text, requiredScopeText: scopeText });
  if (index < 0) return false;
  const buttons = await page.$$("button");
  const button = buttons[index];
  if (!button) return false;
  await button.click();
  await Promise.all(buttons.map(candidate => candidate.dispose()));
  return true;
}

async function clickButtonContainingText(page: Page, text: string): Promise<boolean> {
  return page.evaluate(buttonText => {
    const button = [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find(candidate => candidate.textContent?.includes(buttonText));
    if (!button) return false;
    button.click();
    return true;
  }, text);
}

async function setRouteControlValue(page: Page, selector: string, value: string): Promise<void> {
  await page.evaluate(({ controlSelector, nextValue }) => {
    const control = document.querySelector<HTMLInputElement | HTMLSelectElement>(controlSelector);
    if (!control) throw new Error(`Route control not found: ${controlSelector}`);
    const prototype = control instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (!setter) throw new Error(`Route control has no value setter: ${controlSelector}`);
    setter.call(control, nextValue);
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }, { controlSelector: selector, nextValue: value });
}

async function setRouteSelectOption(page: Page, value: string): Promise<void> {
  await page.evaluate(nextValue => {
    const select = [...document.querySelectorAll<HTMLSelectElement>("form select")]
      .find(candidate => [...candidate.options].some(option => option.value === nextValue));
    if (!select) throw new Error(`Route select option not found: ${nextValue}`);
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    if (!setter) throw new Error("Route select has no value setter");
    setter.call(select, nextValue);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function selectOptionByText(page: Page, optionText: string): Promise<boolean> {
  return page.evaluate(text => {
    const select = [...document.querySelectorAll<HTMLSelectElement>("select")]
      .find(candidate => [...candidate.options].some(option => option.textContent?.trim() === text));
    if (!select) return false;
    const option = [...select.options].find(candidate => candidate.textContent?.trim() === text);
    if (!option) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    if (!setter) return false;
    setter.call(select, option.value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, optionText);
}

async function readClosedJobTitles(page: Page): Promise<string[]> {
  return page.$$eval(
    "table tbody tr",
    rows => rows
      .map(row => row.querySelector("td:nth-child(3)")?.textContent?.trim() ?? "")
      .filter(Boolean),
  );
}

function routeProfitLabel(value: number): string {
  const amount = Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
  return `${value >= 0 ? "+" : "-"}$${amount}`;
}

async function waitForRouteProfit(page: Page, expected: number): Promise<boolean> {
  return page.waitForFunction(
    label => document.body.innerText.includes(label),
    { timeout: 20_000 },
    routeProfitLabel(expected),
  ).then(() => true).catch(() => false);
}

async function waitForCondition(
  predicate: () => boolean,
  timeout = 20_000,
): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (!predicate() && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return predicate();
}

async function selectCalendarDate(page: Page, date: string): Promise<boolean> {
  const [year, month, day] = date.split("-").map(Number);
  const targetMonthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, day, 12));

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const selected = await page.evaluate(({ targetDay, monthLabel }) => {
      const monthText = [...document.querySelectorAll<HTMLElement>("span")]
        .find(element => element.textContent?.trim() === monthLabel);
      const currentMonthText = [...document.querySelectorAll<HTMLElement>("span")]
        .find(element => /^[A-Za-z]+ \d{4}$/.test(element.textContent?.trim() ?? ""));
      const monthHeader = currentMonthText?.parentElement;
      if (!monthText && monthHeader) {
        const buttons = monthHeader.querySelectorAll<HTMLButtonElement>("button");
        buttons[buttons.length - 1]?.click();
        return false;
      }

      const dayButton = [...document.querySelectorAll<HTMLButtonElement>("button")]
        .find(button =>
          button.className.includes("relative flex flex-col")
          && !button.className.includes("opacity-25")
          && button.querySelector("span")?.textContent?.trim() === String(targetDay),
        );
      if (!dayButton) {
        const headerButtons = monthHeader?.querySelectorAll<HTMLButtonElement>("button");
        headerButtons?.[headerButtons.length - 1]?.click();
        return false;
      }
      dayButton.click();
      return true;
    }, { targetDay: day, monthLabel: targetMonthLabel });
    if (selected) return true;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return false;
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
  const firstRouteStopTitle = "E2E Profit Parity One - Stop A";
  const duplicateRouteStopTitle = "E2E Profit Parity One - Stop B";
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
      clientId: 100,
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
  const routeStopFixtures = [
    { fixture: fixtures[0], title: firstRouteStopTitle },
    { fixture: fixtures[1], title: fixtures[1].title },
    { fixture: fixtures[0], title: duplicateRouteStopTitle },
  ];
  const routeStops = routeStopFixtures.map(({ fixture, title }, index) => ({
    id: 93000 + index,
    title,
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
    clientId: 100,
    prospectId: null,
    jobId: fixture.id,
    clientName: "E2E Profit Client",
    prospectContactName: null,
    prospectAddress: null,
    jobSqFt: 1000,
    jobCoats: 1,
    createdAt: new Date().toISOString(),
  }));

  function canonicalBatchProfitSummary(jobIds: number[]): Record<number, ProfitFixture> {
    return Object.fromEntries(
      [...new Set(jobIds)]
        .map(jobId => [jobId, jobById.get(jobId)?.profit] as const)
        .filter((entry): entry is [number, ProfitFixture] => entry[1] != null),
    );
  }

  function expectedRouteProfitBetween(startDate: string, endDate: string) {
    const jobIds = routeStops
      .filter(stop =>
        stop.scheduledDate != null
        && stop.scheduledDate >= startDate
        && stop.scheduledDate <= endDate
        && stop.jobId != null,
      )
      .map(stop => stop.jobId!);
    const summary = canonicalBatchProfitSummary(jobIds);
    return {
      jobIds: [...new Set(jobIds)].sort((a, b) => a - b),
      netProfit: Object.values(summary).reduce((total, profit) => total + profit.netProfit, 0),
    };
  }

  function expectedRouteProfit(date: string) {
    return expectedRouteProfitBetween(date, date);
  }

  const unexpectedWrites: string[] = [];
  const routeWrites: string[] = [];
  const pageErrors: string[] = [];
  const profitSummaryRequests: Array<{
    mode: "failure" | "success";
    jobIds: number[];
  }> = [];
  const profitDetailRequests: number[] = [];
  let delayedProfitJobId: number | null = null;
  let delayedProfitResponseUsed = false;
  let profitSummaryFailureMode = false;
  let profitSummaryPartialMode = false;
  let profitSummaryResponseDelayMs = 0;
  let profitDetailFailureMode = false;
  let profitDetailFailureJobId: number | null = null;
  let sessionId: string | undefined;
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1200 });
    page.on("pageerror", error => pageErrors.push(error.message));
    let mainFrameNavigationCount = 0;
    page.on("framenavigated", frame => {
      if (frame === page.mainFrame()) mainFrameNavigationCount += 1;
    });
    await page.setRequestInterception(true);
    page.on("request", request => {
      if (request.isInterceptResolutionHandled()) return;
      const method = request.method().toUpperCase();
      const url = new URL(request.url());
      const path = url.pathname;
      const routeStopMatch = path.match(/^\/api\/route-stops(?:\/(\d+))?$/);
      const isRouteStopMutation = routeStopMatch != null
        && method !== "GET"
        && method !== "HEAD"
        && method !== "OPTIONS";
      if (isRouteStopMutation) {
        routeWrites.push(`${method} ${path}`);
      } else if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
        unexpectedWrites.push(`${method} ${request.url()}`);
        void request.abort();
        return;
      }

      const respondJson = (body: unknown, status = 200) => {
        if (request.isInterceptResolutionHandled()) return;
        void request.respond({
          status,
          contentType: "application/json",
          body: JSON.stringify(body),
        });
      };
      const respondError = (message: string) => {
        respondJson({ error: message }, 503);
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
        const jobIds = (url.searchParams.get("jobIds") ?? "")
          .split(",")
          .map(Number)
          .filter(jobId => Number.isInteger(jobId) && jobId > 0);
        profitSummaryRequests.push({
          mode: profitSummaryFailureMode ? "failure" : "success",
          jobIds,
        });
        if (profitSummaryFailureMode) {
          respondError("Profit service unavailable");
          return;
        }
        const summary = canonicalBatchProfitSummary(jobIds);
        if (profitSummaryPartialMode) {
          delete summary[secondJobId];
        }
        if (profitSummaryResponseDelayMs > 0) {
          setTimeout(() => respondJson(summary), profitSummaryResponseDelayMs);
        } else {
          respondJson(summary);
        }
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
      if (routeStopMatch && method === "GET") {
        respondJson([...routeStops].sort((left, right) => left.sortOrder - right.sortOrder));
        return;
      }
      if (routeStopMatch && method === "POST") {
        const body = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
        const jobId = typeof body.jobId === "number" ? body.jobId : null;
        const clientId = typeof body.clientId === "number" ? body.clientId : null;
        const fixture = jobId == null ? undefined : jobById.get(jobId);
        const created = {
          id: Math.max(...routeStops.map(stop => stop.id), 93000) + 1,
          title: typeof body.title === "string" ? body.title : null,
          address: typeof body.address === "string" ? body.address : "",
          lat: typeof body.lat === "number" ? body.lat : null,
          lng: typeof body.lng === "number" ? body.lng : null,
          notes: typeof body.notes === "string" ? body.notes : null,
          scheduledDate: typeof body.scheduledDate === "string" ? body.scheduledDate : today,
          status: typeof body.status === "string" ? body.status : "scheduled",
          estimatedDurationMinutes: typeof body.estimatedDurationMinutes === "number" ? body.estimatedDurationMinutes : 60,
          sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : routeStops.length,
          blockNumber: null,
          crewLabel: null,
          clientId,
          prospectId: typeof body.prospectId === "number" ? body.prospectId : null,
          jobId,
          clientName: clientId === 100 ? "E2E Profit Client" : null,
          prospectContactName: null,
          prospectAddress: null,
          jobSqFt: typeof fixture?.job.sqFt === "number" ? fixture.job.sqFt : null,
          jobCoats: typeof fixture?.job.coats === "number" ? fixture.job.coats : null,
          createdAt: new Date().toISOString(),
        };
        routeStops.push(created);
        respondJson(created, 201);
        return;
      }
      if (routeStopMatch && method === "PUT") {
        const stopId = Number(routeStopMatch[1]);
        const stop = routeStops.find(candidate => candidate.id === stopId);
        if (!stop) {
          respondJson({ error: "Route stop not found" }, 404);
          return;
        }
        const body = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
        Object.assign(stop, body);
        respondJson(stop);
        return;
      }
      if (routeStopMatch && method === "DELETE") {
        const stopId = Number(routeStopMatch[1]);
        const index = routeStops.findIndex(candidate => candidate.id === stopId);
        if (index >= 0) routeStops.splice(index, 1);
        if (!request.isInterceptResolutionHandled()) {
          void request.respond({ status: 204, body: "" });
        }
        return;
      }
      if (path === "/api/mapbox-token") {
        respondJson({ token: null });
        return;
      }
      if (path === "/api/geocode") {
        respondJson([]);
        return;
      }
      if (path === "/api/clients") {
        respondJson([{ id: 100, name: "E2E Profit Client", address: "100 Test Street", city: "Testville", state: "KY", zip: "" }]);
        return;
      }
      if (path === "/api/prospects") {
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
        profitDetailRequests.push(jobId);
        const fixture = jobById.get(jobId);
        if (!fixture) {
          respondJson({});
          return;
        }
        if (profitDetailFailureMode
          && (profitDetailFailureJobId == null || profitDetailFailureJobId === jobId)) {
          respondError("Profit service unavailable");
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
    const recoveredFirstExpected: ProfitFixture = {
      ...firstExpected,
      grossInvoiced: 1350,
      collected: 1350,
      jobExpenses: 200,
      netProfit: 1150,
      splitPool: 1092.5,
      profitBreakdown: {
        ...firstExpected.profitBreakdown,
        includedCosts: {
          ...firstExpected.profitBreakdown.includedCosts,
          directExpenses: 200,
          total: 200,
        },
      },
    };
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

    const beforeReorder = expectedRouteProfit(today);
    const beforeReorderOrder = [...routeStops]
      .filter(stop => stop.scheduledDate === today)
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map(stop => stop.jobId);
    const reorderWriteStart = routeWrites.length;
    const reorderDragged = await dragRouteStop(page, firstRouteStopTitle, fixtures[1].title);
    const reorderApplied = await waitForCondition(() => {
      const ordered = [...routeStops]
        .filter(stop => stop.scheduledDate === today)
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map(stop => stop.jobId);
      return ordered.join(",") === `${secondJobId},${firstJobId},${firstJobId}`;
    });
    const reorderAfter = expectedRouteProfit(today);
    const reorderUiApplied = await waitForRouteStopOrder(page, [
      fixtures[1].title,
      firstRouteStopTitle,
      duplicateRouteStopTitle,
    ]);
    const reorderRefreshed = await waitForRouteProfit(page, reorderAfter.netProfit);
    const reorderText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    const reorderDisplayed = readMoneyAfter(reorderText, "Net Profit");
    const afterReorderOrder = [...routeStops]
      .filter(stop => stop.scheduledDate === today)
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map(stop => stop.jobId);
    const afterReorderJobSet = [...new Set(afterReorderOrder)].sort((left, right) => (left ?? 0) - (right ?? 0));
    const reorderWrites = routeWrites.slice(reorderWriteStart);
    const expectedReorderWritePaths = new Set(
      routeStops
        .filter(stop => stop.scheduledDate === today)
        .map(stop => `/api/route-stops/${stop.id}`),
    );
    const actualReorderWritePaths = reorderWrites.map(write => write.split(" ")[1]);
    const reorderWritesAreExpected = reorderWrites.length === expectedReorderWritePaths.size
      && new Set(actualReorderWritePaths).size === expectedReorderWritePaths.size
      && reorderWrites.every(write => {
        const [method, path] = write.split(" ");
        return method === "PUT" && expectedReorderWritePaths.has(path);
      });
    const reorderPreservedJobSet =
      JSON.stringify(afterReorderJobSet) === JSON.stringify(beforeReorder.jobIds);
    record(
      "Dragging route stops preserves the canonical job set and net profit",
      reorderDragged
        && reorderApplied
        && reorderUiApplied
        && reorderRefreshed
        && reorderWritesAreExpected
        && reorderPreservedJobSet
        && beforeReorderOrder.join(",") === `${firstJobId},${secondJobId},${firstJobId}`
        && afterReorderOrder.join(",") === `${secondJobId},${firstJobId},${firstJobId}`
        && JSON.stringify(beforeReorder.jobIds) === JSON.stringify(reorderAfter.jobIds)
        && nearlyEqual(reorderDisplayed, beforeReorder.netProfit)
        && nearlyEqual(reorderDisplayed, reorderAfter.netProfit),
      `beforeJobs=${beforeReorder.jobIds.join(",")}, afterJobs=${reorderAfter.jobIds.join(",")}, ` +
      `order=${afterReorderOrder.join(",")}, displayed=${reorderDisplayed ?? "missing"}, ` +
      `canonicalBefore=${beforeReorder.netProfit}, canonicalAfter=${reorderAfter.netProfit}, ` +
      `writes=${reorderWrites.join(";")}, dragged=${reorderDragged}`,
    );
    await page.screenshot({ path: `${SHOTS}/03b-route-profit-reordered.png`, fullPage: true });

    const removedJobId = secondJobId;
    const deleted = await clickRouteStopAction(page, fixtures[1].title, "Delete");
    const removalApplied = await waitForCondition(
      () => !routeStops.some(stop => stop.jobId === removedJobId && stop.scheduledDate === today),
    );
    const afterRemoval = expectedRouteProfit(today);
    const removalRefreshed = await waitForRouteProfit(page, afterRemoval.netProfit);
    const removalText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    const removalDisplayed = readMoneyAfter(removalText, "Net Profit");
    record(
      "Removing a route job refreshes the displayed canonical net profit",
      deleted
        && removalApplied
        && removalRefreshed
        && nearlyEqual(removalDisplayed, afterRemoval.netProfit),
      `jobIds=${afterRemoval.jobIds.join(",")}, displayed=${removalDisplayed ?? "missing"}, canonical=${afterRemoval.netProfit}`,
    );

    await page.evaluate(() => {
      const addButton = [...document.querySelectorAll<HTMLButtonElement>("button")]
        .find(button => button.textContent?.trim() === "Add Stop");
      addButton?.click();
    });
    await page.waitForFunction(
      () => document.querySelector("form input[placeholder='Address or location *']") != null,
      { timeout: 20_000 },
    );
    await page.select("form select", "client:100");
    const linkedJobSelectorLoaded = await page.waitForFunction(
      jobId => [...document.querySelectorAll<HTMLSelectElement>("form select")]
        .some(select => [...select.options].some(option => option.value === String(jobId))),
      { timeout: 20_000 },
      removedJobId,
    ).then(() => true).catch(() => false);
    if (!linkedJobSelectorLoaded) {
      const diagnostic = await page.evaluate(() => ({
        selects: [...document.querySelectorAll<HTMLSelectElement>("form select")].map(select => ({
          value: select.value,
          options: [...select.options].map(option => option.value),
        })),
        body: document.body.innerText.slice(-2_000),
      }));
      throw new Error(`Linked job selector did not render: ${JSON.stringify(diagnostic)}`);
    }
    await setRouteSelectOption(page, String(removedJobId));
    await page.evaluate(() => {
      document.querySelector<HTMLButtonElement>("form button[type='submit']")?.click();
    });
    const additionApplied = await waitForCondition(
      () => routeStops.some(stop => stop.jobId === removedJobId && stop.scheduledDate === today),
    );
    const afterAddition = expectedRouteProfit(today);
    const additionRefreshed = await waitForRouteProfit(page, afterAddition.netProfit);
    const additionText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    const additionDisplayed = readMoneyAfter(additionText, "Net Profit");
    record(
      "Adding a route job refreshes the displayed canonical net profit",
      additionApplied
        && additionRefreshed
        && nearlyEqual(additionDisplayed, afterAddition.netProfit)
        && routeStops.some(stop => stop.jobId === removedJobId && stop.scheduledDate === today),
      `jobIds=${afterAddition.jobIds.join(",")}, displayed=${additionDisplayed ?? "missing"}, canonical=${afterAddition.netProfit}`,
    );

    const tomorrow = addDays(today, 1);
    const movedStopTitle = "E2E Profit Client";
    const clickedEdit = await clickRouteStopAction(page, movedStopTitle, "Edit");
    await page.waitForFunction(
      () => document.querySelector("input[type='date']") != null,
      { timeout: 20_000 },
    );
    await setRouteControlValue(page, "input[type='date']", tomorrow);
    await page.evaluate(() => {
      const saveButton = [...document.querySelectorAll<HTMLButtonElement>("button")]
        .find(button => button.textContent?.trim() === "Save");
      saveButton?.click();
    });
    const moveApplied = await waitForCondition(
      () => routeStops.some(stop => stop.jobId === removedJobId && stop.scheduledDate === tomorrow),
    );
    const afterMoveOldDay = expectedRouteProfit(today);
    const oldDayRefreshed = await waitForRouteProfit(page, afterMoveOldDay.netProfit);
    const oldDayText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    const oldDayDisplayed = readMoneyAfter(oldDayText, "Net Profit");
    record(
      "Moving a route job refreshes the old day without retaining its prior total",
      clickedEdit
        && moveApplied
        && oldDayRefreshed
        && nearlyEqual(oldDayDisplayed, afterMoveOldDay.netProfit)
        && !oldDayText.includes(routeProfitLabel(afterAddition.netProfit)),
      `jobIds=${afterMoveOldDay.jobIds.join(",")}, displayed=${oldDayDisplayed ?? "missing"}, canonical=${afterMoveOldDay.netProfit}`,
    );

    const selectedTomorrow = await selectCalendarDate(page, tomorrow);
    const afterMoveNewDay = expectedRouteProfit(tomorrow);
    const newDayRefreshed = await waitForRouteProfit(page, afterMoveNewDay.netProfit);
    const newDayText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    const newDayDisplayed = readMoneyAfter(newDayText, "Net Profit");
    record(
      "Moving a route job refreshes the new day against its canonical total",
      selectedTomorrow
        && newDayRefreshed
        && nearlyEqual(newDayDisplayed, afterMoveNewDay.netProfit),
      `jobIds=${afterMoveNewDay.jobIds.join(",")}, displayed=${newDayDisplayed ?? "missing"}, canonical=${afterMoveNewDay.netProfit}`,
    );
    await page.screenshot({ path: `${SHOTS}/04-route-profit-mutations.png`, fullPage: true });

    const resetClicked = await clickRouteStopAction(page, movedStopTitle, "Edit");
    await page.waitForFunction(
      () => document.querySelector("input[type='date']") != null,
      { timeout: 20_000 },
    );
    await setRouteControlValue(page, "input[type='date']", today);
    await page.evaluate(() => {
      const saveButton = [...document.querySelectorAll<HTMLButtonElement>("button")]
        .find(button => button.textContent?.trim() === "Save");
      saveButton?.click();
    });
    const resetApplied = await waitForCondition(
      () => routeStops.some(stop => stop.jobId === removedJobId && stop.scheduledDate === today),
    );
    const visibleWeekStart = startOfWeekSunday(today);
    const visibleWeekEnd = addDays(visibleWeekStart, 6);
    const weekMoveDate = addDays(visibleWeekEnd, 1);
    routeStops.push(
      {
        id: 93999,
        title: "E2E Unlinked Route Stop",
        address: "200 Unlinked Street, Testville, KY",
        lat: null,
        lng: null,
        notes: null,
        scheduledDate: today,
        status: "scheduled",
        estimatedDurationMinutes: 45,
         sortOrder: Math.max(...routeStops.map(stop => stop.sortOrder), -1) + 1,
        blockNumber: null,
        crewLabel: null,
        clientId: 100,
        prospectId: null,
        jobId: null,
        clientName: "E2E Unlinked Client",
        prospectContactName: null,
        prospectAddress: null,
        jobSqFt: null,
        jobCoats: null,
        createdAt: new Date().toISOString(),
      },
      {
        id: 94000,
        title: "E2E Outside Week Route Stop",
        address: "300 Outside Street, Testville, KY",
        lat: null,
        lng: null,
        notes: null,
        scheduledDate: weekMoveDate,
        status: "scheduled",
        estimatedDurationMinutes: 45,
         sortOrder: Math.max(...routeStops.map(stop => stop.sortOrder), -1) + 1,
        blockNumber: null,
        crewLabel: null,
        clientId: 100,
        prospectId: null,
        jobId: firstJobId,
        clientName: "E2E Profit Client",
        prospectContactName: null,
        prospectAddress: null,
        jobSqFt: 1000,
        jobCoats: 1,
        createdAt: new Date().toISOString(),
      },
    );
    await page.reload({
      waitUntil: "networkidle2",
      timeout: 60_000,
    });
    const selectedTodayForWeek = await selectCalendarDate(page, today);
    const weekViewSelected = await clickButtonByText(page, "Week");
    const beforeWeekMove = expectedRouteProfitBetween(visibleWeekStart, visibleWeekEnd);
    const beforeWeekMoveRefreshed = await waitForRouteProfit(page, beforeWeekMove.netProfit);
    const beforeWeekMoveText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    const beforeWeekMoveDisplayed = readMoneyAfter(beforeWeekMoveText, "Net Profit");
    const weekScopeExplained = beforeWeekMoveText.includes("Included in this week's total")
      && beforeWeekMoveText.includes(fixtures[0].title)
      && beforeWeekMoveText.includes(fixtures[1].title)
      && beforeWeekMoveText.includes("1 unlinked stop excluded.")
      && beforeWeekMoveText.includes("1 stop outside this week excluded.");
    record(
      "Week view displays canonical profit and identifies the visible included jobs",
      resetClicked
        && resetApplied
        && selectedTodayForWeek
        && weekViewSelected
        && beforeWeekMoveRefreshed
        && nearlyEqual(beforeWeekMoveDisplayed, beforeWeekMove.netProfit)
        && weekScopeExplained,
      `jobIds=${beforeWeekMove.jobIds.join(",")}, displayed=${beforeWeekMoveDisplayed ?? "missing"}, canonical=${beforeWeekMove.netProfit}, scopeExplained=${weekScopeExplained}`,
    );

    profitSummaryPartialMode = true;
    const partialWeekUrl = page.url();
    await page.reload({
      waitUntil: "networkidle2",
      timeout: 60_000,
    });
    const partialWeekDateSelected = await selectCalendarDate(page, today);
    const partialWeekViewSelected = await clickButtonByText(page, "Week");
    const partialWeekLabel = await page.$eval(
      '[data-testid="route-view-label"]',
      label => label.textContent?.trim() ?? "",
    );
    const partialWeekPanelText = await page.$eval(
      '[data-testid="route-profit-panel"]',
      panel => panel.textContent?.replace(/\s+/g, " ").trim() ?? "",
    );
    const partialWeekScopeText = await page.$eval(
      '[data-testid="route-profit-week-scope"]',
      scope => scope.textContent?.replace(/\s+/g, " ").trim() ?? "",
    );
    const partialWeekMissingJobMarked = partialWeekScopeText.includes(fixtures[1].title)
      && partialWeekScopeText.includes("Profit unavailable");
    const partialWeekReturnedJobIncluded = partialWeekScopeText.includes(fixtures[0].title)
      && partialWeekScopeText.includes("Included");
    const partialWeekDisplayed = readMoneyAfter(partialWeekPanelText, "Net Profit");
    const partialWeekTotalHidden = partialWeekDisplayed == null
      && !partialWeekPanelText.includes(routeProfitLabel(fixtures[0].profit.netProfit))
      && !partialWeekPanelText.includes(routeProfitLabel(beforeWeekMove.netProfit));
    record(
      "Week view marks an omitted linked job unavailable and hides the partial route total",
      partialWeekDateSelected
        && partialWeekViewSelected
        && partialWeekReturnedJobIncluded
        && partialWeekMissingJobMarked
        && partialWeekTotalHidden,
      `dateSelected=${partialWeekDateSelected}, viewSelected=${partialWeekViewSelected}, returnedJobIncluded=${partialWeekReturnedJobIncluded}, missingJobMarked=${partialWeekMissingJobMarked}, totalHidden=${partialWeekTotalHidden}, displayed=${partialWeekDisplayed ?? "missing"}`,
    );

    profitSummaryPartialMode = false;
    const partialWeekNavigationCount = mainFrameNavigationCount;
    const partialWeekRetryClicked = await clickButtonByText(
      page,
      "Try again",
      "Some linked job profit data is unavailable",
    );
    const partialWeekRetryRecovered = await page.waitForFunction(
      ({ expectedLabel, expectedWeekLabel, firstJobTitle, secondJobTitle }) => {
        const panel = document.querySelector<HTMLElement>('[data-testid="route-profit-panel"]');
        const scope = document.querySelector<HTMLElement>('[data-testid="route-profit-week-scope"]');
        const weekLabel = document.querySelector<HTMLElement>('[data-testid="route-view-label"]');
        const panelText = panel?.innerText ?? "";
        const scopeText = scope?.innerText ?? "";
        return panelText.includes(expectedLabel)
          && weekLabel?.innerText.trim() === expectedWeekLabel
          && !panelText.includes("Some linked job profit data is unavailable")
          && scopeText.includes(firstJobTitle)
          && scopeText.includes(secondJobTitle)
          && scopeText.includes("Included")
          && !scopeText.includes("Profit unavailable");
      },
      { timeout: 20_000 },
      {
        expectedLabel: routeProfitLabel(beforeWeekMove.netProfit),
        expectedWeekLabel: partialWeekLabel,
        firstJobTitle: fixtures[0].title,
        secondJobTitle: fixtures[1].title,
      },
    ).then(() => true).catch(() => false);
    const partialWeekRetryPanelText = await page.$eval(
      '[data-testid="route-profit-panel"]',
      panel => panel.textContent?.replace(/\s+/g, " ").trim() ?? "",
    );
    const partialWeekRetryDisplayed = readMoneyAfter(partialWeekRetryPanelText, "Net Profit");
    const partialWeekRetryScopeText = await page.$eval(
      '[data-testid="route-profit-week-scope"]',
      scope => scope.textContent?.replace(/\s+/g, " ").trim() ?? "",
    );
    const partialWeekVisibleScopeRestored = partialWeekRetryScopeText.includes(fixtures[0].title)
      && partialWeekRetryScopeText.includes(fixtures[1].title)
      && !partialWeekRetryScopeText.includes("Profit unavailable");
    record(
      "Week retry restores the complete canonical total without changing the visible week",
      partialWeekRetryClicked
        && partialWeekRetryRecovered
        && page.url() === partialWeekUrl
        && mainFrameNavigationCount === partialWeekNavigationCount
        && nearlyEqual(partialWeekRetryDisplayed, beforeWeekMove.netProfit)
        && partialWeekVisibleScopeRestored,
      `clicked=${partialWeekRetryClicked}, recovered=${partialWeekRetryRecovered}, displayed=${partialWeekRetryDisplayed ?? "missing"}, canonical=${beforeWeekMove.netProfit}, urlUnchanged=${page.url() === partialWeekUrl}, navigationUnchanged=${mainFrameNavigationCount === partialWeekNavigationCount}, visibleScopeRestored=${partialWeekVisibleScopeRestored}`,
    );

    const weekMoveClicked = await clickRouteStopAction(page, movedStopTitle, "Edit");
    await page.waitForFunction(
      () => document.querySelector("input[type='date']") != null,
      { timeout: 20_000 },
    );
    await setRouteControlValue(page, "input[type='date']", weekMoveDate);
    await page.evaluate(() => {
      const saveButton = [...document.querySelectorAll<HTMLButtonElement>("button")]
        .find(button => button.textContent?.trim() === "Save");
      saveButton?.click();
    });
    const weekMoveApplied = await waitForCondition(
      () => routeStops.some(stop => stop.jobId === removedJobId && stop.scheduledDate === weekMoveDate),
    );
    const afterWeekMove = expectedRouteProfitBetween(visibleWeekStart, visibleWeekEnd);
    const afterWeekMoveRefreshed = await waitForRouteProfit(page, afterWeekMove.netProfit);
    const afterWeekMoveText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    const afterWeekMoveDisplayed = readMoneyAfter(afterWeekMoveText, "Net Profit");
    record(
      "Moving a route job out of the visible week refreshes Week view against its canonical total",
      weekMoveClicked
        && weekMoveApplied
        && afterWeekMoveRefreshed
        && nearlyEqual(afterWeekMoveDisplayed, afterWeekMove.netProfit)
        && !afterWeekMoveText.includes(routeProfitLabel(beforeWeekMove.netProfit)),
      `jobIds=${afterWeekMove.jobIds.join(",")}, displayed=${afterWeekMoveDisplayed ?? "missing"}, canonical=${afterWeekMove.netProfit}, clicked=${weekMoveClicked}, applied=${weekMoveApplied}, refreshed=${afterWeekMoveRefreshed}, oldTotalGone=${!afterWeekMoveText.includes(routeProfitLabel(beforeWeekMove.netProfit))}`,
    );
    await page.screenshot({ path: `${SHOTS}/04b-route-profit-week.png`, fullPage: true });

    const nextWeekStart = startOfWeekSunday(weekMoveDate);
    const nextWeekEnd = addDays(nextWeekStart, 6);
    const nextWeekExpected = expectedRouteProfitBetween(nextWeekStart, nextWeekEnd);
    const nextWeekSelected = await selectCalendarDate(page, weekMoveDate);
    const nextWeekRefreshed = await page.waitForFunction(
      ({ expectedLabel, staleLabel }) => {
        const text = document.body.innerText;
        return text.includes(expectedLabel) && !text.includes(staleLabel);
      },
      { timeout: 20_000 },
      {
        expectedLabel: routeProfitLabel(nextWeekExpected.netProfit),
        staleLabel: routeProfitLabel(afterWeekMove.netProfit),
      },
    ).then(() => true).catch(() => false);
    const nextWeekText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    const nextWeekDisplayed = readMoneyAfter(nextWeekText, "Net Profit");
    const nextWeekHasDifferentJobs = nextWeekExpected.jobIds.includes(secondJobId)
      && !afterWeekMove.jobIds.includes(secondJobId);
    record(
      "Browsing to the next calendar week loads its canonical route profit",
      nextWeekSelected
        && nextWeekRefreshed
        && nearlyEqual(nextWeekDisplayed, nextWeekExpected.netProfit)
        && nextWeekHasDifferentJobs,
      `jobIds=${nextWeekExpected.jobIds.join(",")}, displayed=${nextWeekDisplayed ?? "missing"}, canonical=${nextWeekExpected.netProfit}, differentJobSet=${nextWeekHasDifferentJobs}`,
    );

    const returnedWeekSelected = await selectCalendarDate(page, today);
    const returnedWeekExpected = expectedRouteProfitBetween(visibleWeekStart, visibleWeekEnd);
    const returnedWeekRefreshed = await page.waitForFunction(
      ({ expectedLabel, staleLabel }) => {
        const text = document.body.innerText;
        return text.includes(expectedLabel) && !text.includes(staleLabel);
      },
      { timeout: 20_000 },
      {
        expectedLabel: routeProfitLabel(returnedWeekExpected.netProfit),
        staleLabel: routeProfitLabel(nextWeekExpected.netProfit),
      },
    ).then(() => true).catch(() => false);
    const returnedWeekText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    const returnedWeekDisplayed = readMoneyAfter(returnedWeekText, "Net Profit");
    record(
      "Returning to the original calendar week restores its canonical route profit",
      returnedWeekSelected
        && returnedWeekRefreshed
        && nearlyEqual(returnedWeekDisplayed, returnedWeekExpected.netProfit),
      `jobIds=${returnedWeekExpected.jobIds.join(",")}, displayed=${returnedWeekDisplayed ?? "missing"}, canonical=${returnedWeekExpected.netProfit}`,
    );

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
    await page.screenshot({ path: `${SHOTS}/05-rapid-navigation.png`, fullPage: true });

    delayedProfitJobId = firstJobId;
    delayedProfitResponseUsed = false;
    profitDetailFailureJobId = secondJobId;
    profitDetailFailureMode = true;
    await page.goto(`${BASE}/jobs/${firstJobId}/payroll`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    const firstRaceHeadingLoaded = await waitForText(page, fixtures[0].title);
    await new Promise(resolve => setTimeout(resolve, 100));
    await page.evaluate(path => {
      window.history.pushState({}, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, `${BASE}/jobs/${secondJobId}/payroll`);
    const secondRaceHeadingLoaded = await waitForText(page, fixtures[1].title);
    const secondRaceErrorShown = await waitForText(page, "Unable to load job profit");
    const secondRaceErrorText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    const secondRaceStayedActive = secondRaceErrorText.includes(fixtures[1].title)
      && !secondRaceErrorText.includes(fixtures[0].title)
      && !secondRaceErrorText.includes("$1,200.00");

    profitDetailFailureMode = false;
    profitDetailFailureJobId = null;
    const raceRetryClicked = await clickButtonByText(page, "Try again", "Unable to load job profit");
    const raceRetryRecovered = await page.waitForFunction(
      () => {
        const bodyText = document.body.innerText;
        return bodyText.includes("$720.00")
          && !bodyText.includes("$1,200.00")
          && !bodyText.includes("Unable to load job profit");
      },
      { timeout: 20_000 },
    ).then(() => true).catch(() => false);
    await new Promise(resolve => setTimeout(resolve, 1_000));
    const raceFinalText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    const raceFinalNetProfit = readMoneyAfter(raceFinalText, "Net Profit");
    record(
      "Payroll retry after switching jobs ignores the first job's late profit response",
      firstRaceHeadingLoaded
        && secondRaceHeadingLoaded
        && secondRaceErrorShown
        && secondRaceStayedActive
        && raceRetryClicked
        && raceRetryRecovered
        && raceFinalText.includes(fixtures[1].title)
        && !raceFinalText.includes(fixtures[0].title)
        && nearlyEqual(raceFinalNetProfit, fixtures[1].profit.netProfit),
      `firstHeading=${firstRaceHeadingLoaded}, secondHeading=${secondRaceHeadingLoaded}, error=${secondRaceErrorShown}, activeBeforeRetry=${secondRaceStayedActive}, retry=${raceRetryClicked}, recovered=${raceRetryRecovered}, displayed=${raceFinalNetProfit ?? "missing"}, path=${page.url()}`,
    );
    const firstReturnRequestStart = profitDetailRequests.length;
    const firstReturnNavigationCount = mainFrameNavigationCount;
    await page.evaluate(path => {
      window.history.pushState({}, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, `${BASE}/jobs/${firstJobId}/payroll`);
    const firstReturnHeadingLoaded = await waitForText(page, fixtures[0].title);
    const firstReturnRequestIssued = await waitForCondition(
      () => profitDetailRequests.length > firstReturnRequestStart
        && profitDetailRequests[profitDetailRequests.length - 1] === firstJobId,
    );
    const firstReturnRecovered = await page.waitForFunction(
      ({ firstTitle, secondTitle, firstRevenueLabel, secondRevenueLabel }) => {
        const bodyText = document.body.innerText;
        return bodyText.includes(firstTitle)
          && bodyText.includes(firstRevenueLabel)
          && !bodyText.includes(secondTitle)
          && !bodyText.includes(secondRevenueLabel)
          && !bodyText.includes("Unable to load job profit");
      },
      { timeout: 20_000 },
      {
        firstTitle: fixtures[0].title,
        secondTitle: fixtures[1].title,
        firstRevenueLabel: formatMoneyLabel(fixtures[0].profit.grossInvoiced),
        secondRevenueLabel: formatMoneyLabel(fixtures[1].profit.grossInvoiced),
      },
    ).then(() => true).catch(() => false);
    const firstReturnText = await page.evaluate(
      () => document.body.innerText.replace(/\s+/g, " ").trim(),
    );
    const firstReturnNetProfit = readMoneyAfter(firstReturnText, "Net Profit");
    const firstReturnPath = new URL(page.url()).pathname;
    record(
      "Payroll switching back reloads the first job's canonical profit",
      firstReturnHeadingLoaded
        && firstReturnRequestIssued
        && firstReturnRecovered
        && firstReturnPath === `/jobs/${firstJobId}/payroll`
        && firstReturnText.includes(fixtures[0].title)
        && firstReturnText.includes(formatMoneyLabel(fixtures[0].profit.grossInvoiced))
        && !firstReturnText.includes(fixtures[1].title)
        && !firstReturnText.includes(formatMoneyLabel(fixtures[1].profit.grossInvoiced))
        && nearlyEqual(firstReturnNetProfit, fixtures[0].profit.netProfit),
      `heading=${firstReturnHeadingLoaded}, requestIssued=${firstReturnRequestIssued}, recovered=${firstReturnRecovered}, displayed=${firstReturnNetProfit ?? "missing"}, firstJob=${firstReturnText.includes(fixtures[0].title)}, secondJobGone=${!firstReturnText.includes(fixtures[1].title)}, path=${firstReturnPath}, spaNavigationDelta=${mainFrameNavigationCount - firstReturnNavigationCount}`,
    );
    delayedProfitJobId = null;

    profitDetailFailureMode = true;
    profitDetailFailureJobId = null;
    // Change the canonical response while the outage is active so a retry
    // cannot pass by returning the same cached-looking values.
    fixtures[0].profit = recoveredFirstExpected;
    await page.goto(`${BASE}/jobs`, { waitUntil: "networkidle2", timeout: 60_000 });
    const failureJobLoaded = await waitForText(page, fixtures[0].title);
    const openedFailureCard = failureJobLoaded && await clickJobCardAction(page, fixtures[0].title, "Open Job Card");
    const openedFailureFinancials = openedFailureCard && await clickJobCardAction(page, fixtures[0].title, "Job P&L");
    const financialsErrorShown = await waitForText(page, "Unable to load job profit");
    const financialsErrorPanelShown = await page.$('[data-testid="job-financials-profit-error"]') !== null;
    const financialsErrorText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    record(
      "Job Financials explains a failed profit request without stale values",
      Boolean(openedFailureFinancials)
        && financialsErrorShown
        && financialsErrorPanelShown
        && !financialsErrorText.includes("Financial Summary"),
      `job=${failureJobLoaded}, card=${Boolean(openedFailureCard)}, opened=${Boolean(openedFailureFinancials)}, error=${financialsErrorShown}, panel=${financialsErrorPanelShown}, url=${page.url()}`,
    );

    const financialsRetryUrl = page.url();
    const financialsNavigationCount = mainFrameNavigationCount;
    profitDetailFailureMode = false;
    const financialsRetryClicked = await clickButtonByText(page, "Try again", "Unable to load job profit");
    const financialsRetryRecovered = await page.waitForFunction(
      () => {
        const panel = [...document.querySelectorAll<HTMLElement>("div.fixed.inset-0")]
          .find(candidate => [...candidate.querySelectorAll("h2")]
            .some(heading => heading.textContent?.trim() === "Job Financials"));
        const panelText = panel?.innerText.toLowerCase() ?? "";
        return document.querySelector('[data-testid="job-financials-profit-error"]') == null
          && panelText.includes("job revenue")
          && panelText.includes("net business profit")
          && panelText.includes("$1,350.00")
          && panelText.includes("$1,150.00");
      },
      { timeout: 20_000 },
    ).then(() => true).catch(() => false);
    const financialsRetryText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    const financialsRetryPanelText = await page.$eval(
      '[data-testid="job-financials-panel"]',
      panel => panel.textContent?.replace(/\s+/g, " ").trim() ?? "",
    );
    const financialsRetryValues = {
      revenue: readMoneyAfter(financialsRetryText, "Job Revenue"),
      costs: readMoneyAfter(financialsRetryText, "Job Costs"),
      splitPool: readMoneyAfter(financialsRetryText, "Split Pool"),
      netProfit: readMoneyAfter(financialsRetryText, "Net Business Profit"),
    };
    const financialsRetryErrorPanelShown = await page.$('[data-testid="job-financials-profit-error"]') !== null;
    record(
      "Job Financials retry recovers newly updated canonical values without a page reload",
      financialsRetryClicked
        && financialsRetryRecovered
        && page.url() === financialsRetryUrl
        && mainFrameNavigationCount === financialsNavigationCount
        && nearlyEqual(financialsRetryValues.revenue, recoveredFirstExpected.grossInvoiced)
        && nearlyEqual(financialsRetryValues.costs, -recoveredFirstExpected.jobExpenses)
        && nearlyEqual(financialsRetryValues.splitPool, recoveredFirstExpected.splitPool)
        && nearlyEqual(financialsRetryValues.netProfit, recoveredFirstExpected.netProfit)
        && !nearlyEqual(financialsRetryValues.netProfit, firstExpected.netProfit)
        && financialsRetryPanelText.includes(fixtures[0].title)
        && !financialsRetryPanelText.includes(fixtures[1].title)
        && !financialsRetryText.includes("Unable to load job profit"),
      `clicked=${financialsRetryClicked}, recovered=${financialsRetryRecovered}, errorPanel=${financialsRetryErrorPanelShown}, values=${JSON.stringify(financialsRetryValues)}, navigationUnchanged=${mainFrameNavigationCount === financialsNavigationCount}`,
    );

    const financialsRefreshUrl = page.url();
    await page.reload({
      waitUntil: "networkidle2",
      timeout: 60_000,
    });
    const financialsRefreshJobsLoaded = await waitForText(page, fixtures[0].title);
    const financialsRefreshCardOpened = financialsRefreshJobsLoaded
      && await clickJobCardAction(page, fixtures[0].title, "Open Job Card");
    const financialsRefreshPanelOpened = financialsRefreshCardOpened
      && await clickJobCardAction(page, fixtures[0].title, "Job P&L");
    const financialsRefreshSummaryLoaded = financialsRefreshPanelOpened
      && await page.waitForFunction(
        () => document.body.innerText.includes("Job Revenue")
          && document.body.innerText.includes("Net Business Profit"),
        { timeout: 20_000 },
      ).then(() => true).catch(() => false);
    const financialsRefreshRecovered = await page.waitForFunction(
      ({ revenueLabel, netProfitLabel }) => {
        const bodyText = document.body.innerText;
        return bodyText.includes("Job Revenue")
          && bodyText.includes("Net Business Profit")
          && bodyText.includes(revenueLabel)
          && bodyText.includes(netProfitLabel)
          && !bodyText.includes("Unable to load job profit");
      },
      { timeout: 20_000 },
      {
        revenueLabel: formatMoneyLabel(recoveredFirstExpected.grossInvoiced),
        netProfitLabel: formatMoneyLabel(recoveredFirstExpected.netProfit),
      },
    ).then(() => true).catch(() => false);
    const financialsRefreshText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    const financialsRefreshValues = {
      revenue: readMoneyAfter(financialsRefreshText, "Job Revenue"),
      costs: readMoneyAfter(financialsRefreshText, "Job Costs"),
      splitPool: readMoneyAfter(financialsRefreshText, "Split Pool"),
      netProfit: readMoneyAfter(financialsRefreshText, "Net Business Profit"),
    };
    record(
      "Job Financials keeps recovered values after a full page refresh",
      financialsRefreshJobsLoaded
        && financialsRefreshCardOpened
        && financialsRefreshPanelOpened
        && financialsRefreshSummaryLoaded
        && financialsRefreshRecovered
        && page.url() === financialsRefreshUrl
        && nearlyEqual(financialsRefreshValues.revenue, recoveredFirstExpected.grossInvoiced)
        && nearlyEqual(financialsRefreshValues.costs, -recoveredFirstExpected.jobExpenses)
        && nearlyEqual(financialsRefreshValues.splitPool, recoveredFirstExpected.splitPool)
        && nearlyEqual(financialsRefreshValues.netProfit, recoveredFirstExpected.netProfit)
        && !nearlyEqual(financialsRefreshValues.revenue, firstExpected.grossInvoiced)
        && !nearlyEqual(financialsRefreshValues.costs, -firstExpected.jobExpenses)
        && !nearlyEqual(financialsRefreshValues.splitPool, firstExpected.splitPool)
        && !nearlyEqual(financialsRefreshValues.netProfit, firstExpected.netProfit),
      `jobsLoaded=${financialsRefreshJobsLoaded}, cardOpened=${financialsRefreshCardOpened}, panelOpened=${financialsRefreshPanelOpened}, summaryLoaded=${financialsRefreshSummaryLoaded}, recovered=${financialsRefreshRecovered}, url=${page.url() === financialsRefreshUrl}, values=${JSON.stringify(financialsRefreshValues)}, oldValues=${JSON.stringify({
        revenue: firstExpected.grossInvoiced,
        costs: -firstExpected.jobExpenses,
        splitPool: firstExpected.splitPool,
        netProfit: firstExpected.netProfit,
      })}`,
    );

    profitDetailFailureMode = true;
    const financialsSecondOutageCloseClicked = await page.evaluate(() => {
      const closeButton = document.querySelector<HTMLButtonElement>(
        '[data-testid="job-financials-panel"] button',
      );
      closeButton?.click();
      return closeButton != null;
    });
    const financialsSecondOutageClosed = await page.waitForFunction(
      () => document.querySelector('[data-testid="job-financials-panel"]') == null,
      { timeout: 20_000 },
    ).then(() => true).catch(() => false);
    const reopenedFinancialsCard = financialsSecondOutageClosed
      && await clickJobCardAction(page, fixtures[0].title, "Open Job Card");
    const reopenedFinancialsPanel = reopenedFinancialsCard
      && await clickJobCardAction(page, fixtures[0].title, "Job P&L");
    const financialsSecondOutageShown = await waitForText(page, "Unable to load job profit");
    const financialsSecondOutageText = await page.evaluate(
      () => document.body.innerText.replace(/\s+/g, " ").trim(),
    );
    const financialsSecondOutagePanelText = await page.$eval(
      '[data-testid="job-financials-panel"]',
      panel => panel.textContent?.replace(/\s+/g, " ").trim() ?? "",
    );
    const financialsSecondOutageErrorPanelShown = await page.$(
      '[data-testid="job-financials-profit-error"]',
    ) !== null;
    profitDetailFailureMode = false;
    const financialsSecondRetryClicked = await clickButtonByText(
      page,
      "Try again",
      "Unable to load job profit",
    );
    const financialsSecondRetryRecovered = await page.waitForFunction(
      ({ revenueLabel, netProfitLabel }) => {
        const panel = document.querySelector<HTMLElement>('[data-testid="job-financials-panel"]');
        const panelText = panel?.innerText ?? "";
        return document.querySelector('[data-testid="job-financials-profit-error"]') == null
          && panelText.includes(revenueLabel)
          && panelText.includes(netProfitLabel);
      },
      { timeout: 20_000 },
      {
        revenueLabel: formatMoneyLabel(recoveredFirstExpected.grossInvoiced),
        netProfitLabel: formatMoneyLabel(recoveredFirstExpected.netProfit),
      },
    ).then(() => true).catch(() => false);
    const financialsSecondRetryText = await page.evaluate(
      () => document.body.innerText.replace(/\s+/g, " ").trim(),
    );
    const financialsSecondRetryValues = {
      revenue: readMoneyAfter(financialsSecondRetryText, "Job Revenue"),
      costs: readMoneyAfter(financialsSecondRetryText, "Job Costs"),
      splitPool: readMoneyAfter(financialsSecondRetryText, "Split Pool"),
      netProfit: readMoneyAfter(financialsSecondRetryText, "Net Business Profit"),
    };
    record(
      "Job Financials clears recovered values during a second outage and retries again",
      financialsSecondOutageCloseClicked
        && financialsSecondOutageClosed
        && Boolean(reopenedFinancialsPanel)
        && financialsSecondOutageShown
        && financialsSecondOutageErrorPanelShown
        && !financialsSecondOutagePanelText.includes(formatMoneyLabel(recoveredFirstExpected.grossInvoiced))
        && !financialsSecondOutagePanelText.includes(formatMoneyLabel(recoveredFirstExpected.netProfit))
        && financialsSecondRetryClicked
        && financialsSecondRetryRecovered
        && nearlyEqual(financialsSecondRetryValues.revenue, recoveredFirstExpected.grossInvoiced)
        && nearlyEqual(financialsSecondRetryValues.costs, -recoveredFirstExpected.jobExpenses)
        && nearlyEqual(financialsSecondRetryValues.splitPool, recoveredFirstExpected.splitPool)
        && nearlyEqual(financialsSecondRetryValues.netProfit, recoveredFirstExpected.netProfit)
        && !financialsSecondRetryText.includes("Unable to load job profit"),
      `closed=${financialsSecondOutageClosed}, reopened=${Boolean(reopenedFinancialsPanel)}, outage=${financialsSecondOutageShown}, staleCleared=${!financialsSecondOutagePanelText.includes(formatMoneyLabel(recoveredFirstExpected.netProfit))}, retry=${financialsSecondRetryClicked}, recovered=${financialsSecondRetryRecovered}, values=${JSON.stringify(financialsSecondRetryValues)}`,
    );

    profitDetailFailureMode = true;
    await page.goto(`${BASE}/jobs/${firstJobId}/payroll`, {
      waitUntil: "networkidle2",
      timeout: 60_000,
    });
    const payrollErrorShown = await waitForText(page, "Unable to load job profit");
    const payrollErrorText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    record(
      "Job Payroll explains a failed profit request without stale values",
      payrollErrorShown
        && !payrollErrorText.includes("$1,200.00")
        && !payrollErrorText.includes("Net Profit"),
    );

    const payrollRetryUrl = page.url();
    const payrollNavigationCount = mainFrameNavigationCount;
    profitDetailFailureMode = false;
    const payrollRetryClicked = await clickButtonByText(page, "Try again", "Unable to load job profit");
    const payrollRetryRecovered = await page.waitForFunction(
      () => {
        const bodyText = document.body.innerText.toLowerCase();
        return !bodyText.includes("unable to load job profit")
          && bodyText.includes("$1,350.00")
          && bodyText.includes("$1,150.00")
          && bodyText.includes("net profit");
      },
      { timeout: 20_000 },
    ).then(() => true).catch(() => false);
    const payrollRetryText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    const payrollRetryValues = {
      revenue: readMoneyAfter(payrollRetryText, "Revenue"),
      costs: readMoneyAfter(payrollRetryText, "Job Costs"),
      splitPool: readMoneyAfter(payrollRetryText, "Split Pool"),
      netProfit: readMoneyAfter(payrollRetryText, "Net Profit"),
    };
    const payrollRetryErrorShown = payrollRetryText.includes("Unable to load job profit");
    record(
      "Job Payroll retry recovers newly updated canonical values without a page reload",
      payrollRetryClicked
        && payrollRetryRecovered
        && page.url() === payrollRetryUrl
        && mainFrameNavigationCount === payrollNavigationCount
        && nearlyEqual(payrollRetryValues.revenue, recoveredFirstExpected.grossInvoiced)
        && nearlyEqual(payrollRetryValues.costs, -recoveredFirstExpected.jobExpenses)
        && nearlyEqual(payrollRetryValues.splitPool, recoveredFirstExpected.splitPool)
        && nearlyEqual(payrollRetryValues.netProfit, recoveredFirstExpected.netProfit)
        && !nearlyEqual(payrollRetryValues.netProfit, firstExpected.netProfit)
        && !payrollRetryText.includes("Unable to load job profit"),
      `clicked=${payrollRetryClicked}, recovered=${payrollRetryRecovered}, errorShown=${payrollRetryErrorShown}, values=${JSON.stringify(payrollRetryValues)}, navigationUnchanged=${mainFrameNavigationCount === payrollNavigationCount}`,
    );

    const payrollRefreshUrl = page.url();
    await page.reload({
      waitUntil: "networkidle2",
      timeout: 60_000,
    });
    const payrollRefreshLoaded = await waitForText(page, fixtures[0].title);
    const payrollRefreshValuesLoaded = await waitForText(page, formatMoneyLabel(recoveredFirstExpected.grossInvoiced));
    const payrollRefreshText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    const payrollRefreshValues = {
      revenue: readMoneyAfter(payrollRefreshText, "Revenue"),
      costs: readMoneyAfter(payrollRefreshText, "Job Costs"),
      splitPool: readMoneyAfter(payrollRefreshText, "Split Pool"),
      netProfit: readMoneyAfter(payrollRefreshText, "Net Profit"),
    };
    record(
      "Job Payroll keeps recovered values after a full page refresh",
      payrollRefreshLoaded
        && payrollRefreshValuesLoaded
        && page.url() === payrollRefreshUrl
        && nearlyEqual(payrollRefreshValues.revenue, recoveredFirstExpected.grossInvoiced)
        && nearlyEqual(payrollRefreshValues.costs, -recoveredFirstExpected.jobExpenses)
        && nearlyEqual(payrollRefreshValues.splitPool, recoveredFirstExpected.splitPool)
        && nearlyEqual(payrollRefreshValues.netProfit, recoveredFirstExpected.netProfit)
        && !nearlyEqual(payrollRefreshValues.revenue, firstExpected.grossInvoiced)
        && !nearlyEqual(payrollRefreshValues.costs, -firstExpected.jobExpenses)
        && !nearlyEqual(payrollRefreshValues.splitPool, firstExpected.splitPool)
        && !nearlyEqual(payrollRefreshValues.netProfit, firstExpected.netProfit)
        && !payrollRefreshText.includes("Unable to load job profit"),
      `loaded=${payrollRefreshLoaded}, values=${JSON.stringify(payrollRefreshValues)}, oldValues=${JSON.stringify({
        revenue: firstExpected.grossInvoiced,
        costs: -firstExpected.jobExpenses,
        splitPool: firstExpected.splitPool,
        netProfit: firstExpected.netProfit,
      })}`,
    );

    profitSummaryFailureMode = true;
    await page.goto(`${BASE}/route-planner`, {
      waitUntil: "networkidle2",
      timeout: 60_000,
    });
    const routeErrorShown = await waitForText(page, "Profit data unavailable");
    const routeErrorText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    record(
      "Route Planner distinguishes unavailable profit from a zero-profit route",
      routeErrorShown
        && !routeErrorText.includes("+$1,795")
        && !routeErrorText.includes("$0"),
    );
    profitSummaryFailureMode = false;

    const routeRetryUrl = page.url();
    const routeNavigationCount = mainFrameNavigationCount;
    const routeRetryClicked = await clickButtonByText(page, "Try again", "Profit data unavailable");
    const expectedRouteAfterRetry = expectedRouteProfit(today);
    const expectedRouteNetProfitAfterRetry = expectedRouteAfterRetry.netProfit;
    const expectedRouteNetProfitBeforeRecovery = expectedRouteAfterRetry.jobIds.reduce(
      (total, jobId) => total + (jobId === firstJobId
        ? firstExpected.netProfit
        : jobById.get(jobId)?.profit.netProfit ?? 0),
      0,
    );
    const routeRetryRecovered = await waitForRouteProfit(page, expectedRouteNetProfitAfterRetry);
    const routeRetryText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    const routeRetryNetProfit = readMoneyAfter(routeRetryText, "Net Profit");
    record(
      "Route Planner retry recovers the newly updated canonical route profit without a page reload",
      routeRetryClicked
        && routeRetryRecovered
        && page.url() === routeRetryUrl
        && mainFrameNavigationCount === routeNavigationCount
        && nearlyEqual(routeRetryNetProfit, expectedRouteNetProfitAfterRetry)
        && !nearlyEqual(routeRetryNetProfit, firstExpected.netProfit)
        && !routeRetryText.includes("Profit data unavailable"),
      `clicked=${routeRetryClicked}, recovered=${routeRetryRecovered}, displayed=${routeRetryNetProfit ?? "missing"}, expected=${expectedRouteNetProfitAfterRetry}, navigationUnchanged=${mainFrameNavigationCount === routeNavigationCount}`,
    );

    const routeRefreshUrl = page.url();
    await page.reload({
      waitUntil: "networkidle2",
      timeout: 60_000,
    });
    const routeRefreshLoaded = await waitForText(page, "Net Profit");
    const routeRefreshRecovered = await page.waitForFunction(
      ({ expectedLabel, staleLabel }) => {
        const bodyText = document.body.innerText;
        return bodyText.includes("Net Profit")
          && bodyText.includes(expectedLabel)
          && !bodyText.includes(staleLabel)
          && !bodyText.includes("Profit data unavailable");
      },
      { timeout: 20_000 },
      {
        expectedLabel: routeProfitLabel(expectedRouteNetProfitAfterRetry),
        staleLabel: routeProfitLabel(expectedRouteNetProfitBeforeRecovery),
      },
    ).then(() => true).catch(() => false);
    const routeRefreshText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    const routeRefreshNetProfit = readMoneyAfter(routeRefreshText, "Net Profit");
    record(
      "Route Planner keeps recovered profit after a full page refresh",
      routeRefreshLoaded
        && routeRefreshRecovered
        && page.url() === routeRefreshUrl
        && nearlyEqual(routeRefreshNetProfit, expectedRouteNetProfitAfterRetry)
        && !nearlyEqual(routeRefreshNetProfit, expectedRouteNetProfitBeforeRecovery)
        && !routeRefreshText.includes("Profit data unavailable"),
      `loaded=${routeRefreshLoaded}, displayed=${routeRefreshNetProfit ?? "missing"}, recovered=${expectedRouteNetProfitAfterRetry}, preRecovery=${expectedRouteNetProfitBeforeRecovery}`,
    );

    jobs.reverse();
    fixtures[0].job.status = "closed";
    fixtures[1].job.status = "closed";
    profitSummaryFailureMode = true;
    profitSummaryRequests.length = 0;
    await page.goto(`${BASE}/jobs`, {
      waitUntil: "networkidle2",
      timeout: 60_000,
    });
    const closedJobsHeadingShown = await waitForText(page, "Closed Jobs");
    const closedJobTitleShown = await waitForText(page, fixtures[0].title);
    const closedJobsExpanded = await clickButtonContainingText(page, "Closed Jobs");
    const closedJobsErrorText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    const closedJobsOrderBeforeProfitSort = await readClosedJobTitles(page);
    const closedProfitSortSelected = await selectOptionByText(page, "Highest Profit");
    const closedJobsOrderDuringFailure = await readClosedJobTitles(page);
    const closedExpectedRevenueLabel = formatMoneyLabel(fixtures[0].profit.grossInvoiced);
    const closedExpectedNetProfitLabel = formatMoneyLabel(fixtures[0].profit.netProfit);
    const closedJobsWarningShown = closedJobsErrorText.includes("Closed-job profit summaries are unavailable");
    const closedJobsTotalsUnavailable = closedJobsErrorText.includes("Total Revenue: Unavailable")
      && closedJobsErrorText.includes("Total Net Profit: Unavailable");
    const closedJobsRetryShown = closedJobsErrorText.includes("Retry");
    const closedJobsBeforeRetryHasNoProfit = !closedJobsErrorText.includes(closedExpectedRevenueLabel)
      && !closedJobsErrorText.includes(closedExpectedNetProfitLabel);
    record(
      "Closed Jobs shows an unavailable warning and no silent zero profit totals",
      closedJobsHeadingShown
        && closedJobTitleShown
        && closedJobsExpanded
        && closedJobsWarningShown
        && closedJobsTotalsUnavailable
        && closedJobsRetryShown
        && closedJobsBeforeRetryHasNoProfit,
      `heading=${closedJobsHeadingShown}, title=${closedJobTitleShown}, expanded=${closedJobsExpanded}, warning=${closedJobsWarningShown}, totalsUnavailable=${closedJobsTotalsUnavailable}, retry=${closedJobsRetryShown}`,
    );
    record(
      "Closed Jobs keeps its existing order when Highest Profit is unavailable",
      closedProfitSortSelected
        && JSON.stringify(closedJobsOrderDuringFailure) === JSON.stringify(closedJobsOrderBeforeProfitSort)
        && closedJobsOrderDuringFailure.includes(fixtures[0].title)
        && closedJobsOrderDuringFailure.includes(fixtures[1].title),
      `selected=${closedProfitSortSelected}, before=${closedJobsOrderBeforeProfitSort.join(" | ")}, duringFailure=${closedJobsOrderDuringFailure.join(" | ")}`,
    );

    profitSummaryFailureMode = false;
    const closedJobsRetryUrl = page.url();
    const closedJobsNavigationCount = mainFrameNavigationCount;
    const closedJobsInitialProfitRequestCount = profitSummaryRequests.length;
    const closedJobsInitialProfitRequest = profitSummaryRequests[0];
    const closedJobsRetryClicked = await clickButtonByText(page, "Retry", "Closed-job profit summaries are unavailable");
    const closedJobsRetryRecovered = await page.waitForFunction(
      ({ expectedRevenue, expectedNetProfit }) => {
        const bodyText = document.body.innerText;
        return bodyText.includes(expectedRevenue)
          && bodyText.includes(expectedNetProfit)
          && !bodyText.includes("Closed-job profit summaries are unavailable")
          && !bodyText.includes("Total Revenue: Unavailable")
          && !bodyText.includes("Total Net Profit: Unavailable");
      },
      { timeout: 20_000 },
      {
        expectedRevenue: closedExpectedRevenueLabel,
        expectedNetProfit: closedExpectedNetProfitLabel,
      },
    ).then(() => true).catch(() => false);
    const closedJobsAfterRetryText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    const closedJobsOrderAfterRetry = await readClosedJobTitles(page);
    const closedJobsRetryRequestCount = profitSummaryRequests.length;
    const closedJobsRetryRequest = profitSummaryRequests[1];
    const closedJobsProfitRequestSequenceValid = closedJobsInitialProfitRequestCount === 1
      && closedJobsInitialProfitRequest?.mode === "failure"
      && closedJobsRetryRequestCount === 2
      && closedJobsRetryRequest?.mode === "success"
      && JSON.stringify(closedJobsInitialProfitRequest?.jobIds) === JSON.stringify(closedJobsRetryRequest?.jobIds);
    record(
      "Closed Jobs retry restores profit totals without leaving the Jobs list",
      closedJobsRetryClicked
        && closedJobsRetryRecovered
        && page.url() === closedJobsRetryUrl
        && mainFrameNavigationCount === closedJobsNavigationCount
        && closedJobsAfterRetryText.includes("Closed Jobs")
        && closedJobsAfterRetryText.includes(fixtures[0].title)
        && !closedJobsAfterRetryText.includes("Closed-job profit summaries are unavailable"),
      `clicked=${closedJobsRetryClicked}, recovered=${closedJobsRetryRecovered}, requests=${closedJobsRetryRequestCount}, urlUnchanged=${page.url() === closedJobsRetryUrl}, navigationUnchanged=${mainFrameNavigationCount === closedJobsNavigationCount}`,
    );
    record(
      "Closed Jobs retry issues exactly one fresh profit-summary request",
      closedJobsProfitRequestSequenceValid,
      `initial=${closedJobsInitialProfitRequestCount}/${closedJobsInitialProfitRequest?.mode ?? "missing"}, retry=${closedJobsRetryRequestCount}/${closedJobsRetryRequest?.mode ?? "missing"}, sameJobIds=${closedJobsProfitRequestSequenceValid && JSON.stringify(closedJobsInitialProfitRequest?.jobIds) === JSON.stringify(closedJobsRetryRequest?.jobIds)}`,
    );
    record(
      "Closed Jobs applies Highest Profit order only after canonical values return",
      closedJobsRetryRecovered
        && JSON.stringify(closedJobsOrderAfterRetry) === JSON.stringify([
          fixtures[0].title,
          fixtures[1].title,
        ])
        && JSON.stringify(closedJobsOrderAfterRetry) !== JSON.stringify(closedJobsOrderDuringFailure),
      `duringFailure=${closedJobsOrderDuringFailure.join(" | ")}, afterRetry=${closedJobsOrderAfterRetry.join(" | ")}`,
    );

    profitSummaryPartialMode = true;
    const partialProfitRequestStart = profitSummaryRequests.length;
    await page.goto(`${BASE}/jobs`, {
      waitUntil: "networkidle2",
      timeout: 60_000,
    });
    await clickButtonContainingText(page, "Closed Jobs");
    const partialClosedJobsText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    const partialInitialProfitRequest = profitSummaryRequests[partialProfitRequestStart];
    const partialClosedJobRows = await page.$$eval(
      "table tbody tr",
      rows => rows.map(row => row.textContent?.replace(/\s+/g, " ").trim() ?? ""),
    );
    const partialAvailableRow = partialClosedJobRows.find(row => row.includes(fixtures[0].title)) ?? "";
    const partialUnavailableRow = partialClosedJobRows.find(row => row.includes(fixtures[1].title)) ?? "";
    const partialWarningShown = partialClosedJobsText.includes("Some closed-job profit summaries are unavailable");
    const partialMissingJobNamed = partialClosedJobsText.includes(`Missing profit data for: ${fixtures[1].title}`);
    const partialTotalsUnavailable = partialClosedJobsText.includes("Total Revenue: Unavailable")
      && partialClosedJobsText.includes("Total Net Profit: Unavailable");
    const partialAvailableRowUsable = partialAvailableRow.includes(closedExpectedRevenueLabel)
      && partialAvailableRow.includes(closedExpectedNetProfitLabel)
      && !partialAvailableRow.includes("Unavailable");
    const partialUnavailableRowMarked = partialUnavailableRow.includes("Unavailable");
    record(
      "Closed Jobs explains partial summaries while keeping available rows usable",
      partialWarningShown
        && partialMissingJobNamed
        && partialTotalsUnavailable
        && partialAvailableRowUsable
        && partialUnavailableRowMarked,
      `warning=${partialWarningShown}, missingJobNamed=${partialMissingJobNamed}, totalsUnavailable=${partialTotalsUnavailable}, availableRow=${partialAvailableRowUsable}, unavailableRow=${partialUnavailableRowMarked}`,
    );

    profitSummaryPartialMode = false;
    profitSummaryResponseDelayMs = 750;
    const partialRetryClicked = await clickButtonByText(page, "Retry", "Some closed-job profit summaries are unavailable");
    const partialRetryRequestIssued = await waitForCondition(
      () => profitSummaryRequests.length > partialProfitRequestStart + 1,
    );
    const partialRetryRequest = profitSummaryRequests[partialProfitRequestStart + 1];
    const partialAvailableRowPreservedDuringRetry = await page.waitForFunction(
      ({ availableTitle, expectedRevenue, expectedNetProfit }) => {
        const availableRow = [...document.querySelectorAll("table tbody tr")]
          .find(row => row.textContent?.includes(availableTitle));
        const rowText = availableRow?.textContent?.replace(/\s+/g, " ").trim() ?? "";
        return rowText.includes(expectedRevenue)
          && rowText.includes(expectedNetProfit)
          && !rowText.includes("Unavailable")
          && document.body.innerText.includes("Total Revenue: Unavailable")
          && document.body.innerText.includes("Total Net Profit: Unavailable");
      },
      { timeout: 20_000 },
      {
        availableTitle: fixtures[0].title,
        expectedRevenue: closedExpectedRevenueLabel,
        expectedNetProfit: closedExpectedNetProfitLabel,
      },
    ).then(() => true).catch(() => false);
    const partialRetryRecovered = await page.waitForFunction(
      ({ expectedRevenue, expectedNetProfit, missingJobTitle }) => {
        const bodyText = document.body.innerText;
        return bodyText.includes(expectedRevenue)
          && bodyText.includes(expectedNetProfit)
          && bodyText.includes(missingJobTitle)
          && !bodyText.includes(`Missing profit data for: ${missingJobTitle}`)
          && !bodyText.includes("Some closed-job profit summaries are unavailable")
          && !bodyText.includes("Total Revenue: Unavailable")
          && !bodyText.includes("Total Net Profit: Unavailable");
      },
      { timeout: 20_000 },
      {
        expectedRevenue: closedExpectedRevenueLabel,
        expectedNetProfit: closedExpectedNetProfitLabel,
        missingJobTitle: fixtures[1].title,
      },
    ).then(() => true).catch(() => false);
    profitSummaryResponseDelayMs = 0;
    const partialRetryRequestTargeted = partialRetryRequest?.jobIds.length === 1
      && partialRetryRequest.jobIds[0] === secondJobId;
    record(
      "Closed Jobs retry completes a previously partial batch",
      partialRetryClicked
        && partialRetryRequestIssued
        && partialRetryRequestTargeted
        && partialAvailableRowPreservedDuringRetry
        && partialRetryRecovered,
      `clicked=${partialRetryClicked}, requestIssued=${partialRetryRequestIssued}, targeted=${partialRetryRequestTargeted}, availableRowPreserved=${partialAvailableRowPreservedDuringRetry}, recovered=${partialRetryRecovered}, initialRequestIds=${partialInitialProfitRequest?.jobIds.join(",") ?? "missing"}, retryRequestIds=${partialRetryRequest?.jobIds.join(",") ?? "missing"}`,
    );

    record(
      "Authenticated browser writes stayed within route-stop fixture CRUD",
      unexpectedWrites.length === 0,
      unexpectedWrites.length > 0
        ? unexpectedWrites.join("; ")
        : `${routeWrites.length} route-stop writes`,
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
