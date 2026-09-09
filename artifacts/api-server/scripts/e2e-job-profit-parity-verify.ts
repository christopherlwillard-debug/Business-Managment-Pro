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
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "puppeteer";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { sessionsTable } from "@workspace/db/schema";
import { createTestLoginProof } from "../src/lib/auth";
import { launchBrowser } from "../src/lib/launchBrowser";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:80";
const SHOTS = "/tmp/e2e-job-profit-parity";
const RELEASE_CHECK = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../scripts/check-closed-jobs-release.mjs",
);

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

function lastDayOfMonthOffset(dateString: string, monthOffset: number): string {
  const [year, month] = dateString.split("-").map(Number);
  return localDateString(new Date(year, month - 1 + monthOffset + 1, 0, 12));
}

function lastDayOfYearOffset(dateString: string, yearOffset: number): string {
  const [year] = dateString.split("-").map(Number);
  return localDateString(new Date(year + yearOffset, 11, 31, 12));
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
      reversedFixedPayouts: number;
      reversedAllocationPayouts: number;
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

async function clickJobCardHeadingAction(page: Page, title: string, action: string): Promise<boolean> {
  return page.evaluate(({ jobTitle, buttonText }) => {
    const heading = [...document.querySelectorAll<HTMLHeadingElement>("h3")]
      .find(element => element.textContent?.trim() === jobTitle);
    let ancestor: HTMLElement | null = heading ?? null;
    for (let depth = 0; ancestor && depth < 8; depth += 1, ancestor = ancestor.parentElement) {
      const button = [...ancestor.querySelectorAll<HTMLButtonElement>("button")]
        .find(candidate => (candidate.textContent ?? "").includes(buttonText)
          || candidate.title === buttonText);
      if (button) {
        button.click();
        return true;
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
  return page.evaluate(({ buttonText, requiredScopeText }) => {
    const candidate = [...document.querySelectorAll<HTMLButtonElement>("button")]
      .filter(button => button.textContent?.trim() === buttonText)
      .filter(button => !button.disabled && button.getClientRects().length > 0)
      .find(button => {
        if (!requiredScopeText) return true;
        let ancestor: HTMLElement | null = button.parentElement;
        for (let depth = 0; ancestor && depth < 10; depth += 1, ancestor = ancestor.parentElement) {
          if (ancestor.textContent?.includes(requiredScopeText)) return true;
        }
        return false;
      });
    if (!candidate) return false;
    candidate.click();
    return true;
  }, { buttonText: text, requiredScopeText: scopeText });
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

function parseDisplayedMoney(text: string): number | null {
  const match = text.replace(/−/g, "-").match(/([+-])?\$([0-9,]+(?:\.\d{2})?)/);
  if (!match) return null;
  const amount = Number(match[2].replace(/,/g, ""));
  if (!Number.isFinite(amount)) return null;
  return match[1] === "-" ? -amount : amount;
}

async function waitForRouteProfit(page: Page, expected: number): Promise<boolean> {
  return page.waitForFunction(
    label => document.body.innerText.includes(label),
    { timeout: 20_000 },
    routeProfitLabel(expected),
  ).then(() => true).catch(() => false);
}

async function readRoutePanelNetProfit(page: Page): Promise<number | null> {
  const text = await page.$eval(
    '[data-testid="route-profit-net-profit"]',
    node => node.textContent?.trim() ?? "",
  ).catch(() => "");
  return parseDisplayedMoney(text);
}

async function waitForRoutePanelNetProfit(
  page: Page,
  expected: number,
  stale?: number,
): Promise<boolean> {
  return page.waitForFunction(
    ({ expectedLabel, staleLabel }) => {
      const text = document.querySelector<HTMLElement>('[data-testid="route-profit-net-profit"]')?.innerText ?? "";
      return text.includes(expectedLabel) && (staleLabel == null || !text.includes(staleLabel));
    },
    { timeout: 20_000 },
    {
      expectedLabel: routeProfitLabel(expected),
      staleLabel: stale == null ? null : routeProfitLabel(stale),
    },
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

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const selected = await page.evaluate(({ targetDay, monthLabel }) => {
      const currentMonthText = [...document.querySelectorAll<HTMLElement>("span")]
        .find(element => /^[A-Za-z]+ \d{4}$/.test(element.textContent?.trim() ?? ""));
      const monthHeader = currentMonthText?.parentElement;
      if (!currentMonthText || !monthHeader) {
        return false;
      }

      const currentMonth = new Date(`${currentMonthText.textContent?.trim()} 1`);
      const targetMonth = new Date(`${monthLabel} 1`);
      if (currentMonth.getTime() !== targetMonth.getTime()) {
        const buttons = monthHeader.querySelectorAll<HTMLButtonElement>("button");
        const targetIsEarlier = currentMonth.getTime() > targetMonth.getTime();
        buttons[targetIsEarlier ? 0 : buttons.length - 1]?.click();
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
    }, {
      targetDay: day,
      monthLabel: new Intl.DateTimeFormat("en-US", {
        month: "long",
        year: "numeric",
      }).format(new Date(year, month - 1, day, 12)),
    });
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
  execFileSync(process.execPath, [RELEASE_CHECK], { stdio: "inherit" });
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
        subLaborCost: 200,
        allocPaid: 100,
        totalSubHours: 0,
        netProfit: 775,
        splitPool: 821.25,
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
            subLabor: 200,
            splitPayouts: 100,
            mileageReimbursement: 0,
            estimatedFuel: 0,
            total: 425,
          },
          excludedFromProfit: {
            ownerWithdrawals: 0,
            auditTrail: 0,
            payrollLinkedExpenses: 0,
            legacySubcontractorExpense: 0,
            reversedFixedPayouts: 900,
            reversedAllocationPayouts: 800,
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
            reversedFixedPayouts: 0,
            reversedAllocationPayouts: 0,
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
  const panelDetailsByJobId = new Map<number, {
    payments: unknown[];
    hours: unknown[];
    distributions: unknown[];
  }>([
    [firstJobId, {
      payments: [{
        subcontractorId: 7101,
        subName: "First Job Crew",
        amountOwed: 100,
        computedOwed: 100,
        amountPaid: 50,
        balance: 50,
        percentComplete: 50,
        paidDate: null,
        paidNotes: null,
        totalHours: 4,
        totalWorkHours: 4,
        totalTravelHours: 0,
        payRate: 25,
        travelPayRate: null,
        payType: "hourly",
        role: "subcontractor",
        growthPct: null,
        compensationType: "hourly",
        hourlyRate: 25,
        travelRate: null,
        fixedAmount: null,
        allocationPct: null,
        paymentStatus: "partial",
        paymentHistory: [{
          id: 71011,
          date: today,
          amount: 50,
          netPaid: 50,
          paymentMethod: "Cash",
          workHours: 2,
          workRate: 25,
        }],
          }, {
            subcontractorId: 7102,
            subName: "Fixed Reversal Crew",
            amountOwed: null,
            computedOwed: 0,
            amountPaid: 0,
            balance: null,
            percentComplete: null,
            paidDate: null,
            paidNotes: null,
            totalHours: 0,
            totalWorkHours: 0,
            totalTravelHours: 0,
            payRate: null,
            travelPayRate: null,
            payType: "fixed",
            role: "subcontractor",
            growthPct: null,
            compensationType: "fixed",
            hourlyRate: null,
            travelRate: null,
            fixedAmount: 900,
            allocationPct: null,
            paymentStatus: "paid",
            paymentHistory: [{
              id: 71021,
              date: today,
              amount: 900,
              netPaid: 900,
              paymentMethod: "Check",
              referenceNumber: "FIX-ORIGINAL",
            }, {
              id: 71022,
              date: today,
              amount: 900,
              netPaid: 900,
              paymentMethod: "Reversal",
              referenceNumber: "FIX-REVERSAL",
              isReversal: true,
              reversesPaymentId: 71021,
              reversalReason: "Duplicate fixed payout",
              compensationType: "fixed",
              originalPaymentReference: "FIX-ORIGINAL",
            }],
          }, {
            subcontractorId: 7103,
            subName: "Split Reversal Crew",
            amountOwed: null,
            computedOwed: 0,
            amountPaid: 0,
            balance: null,
            percentComplete: null,
            paidDate: null,
            paidNotes: null,
            totalHours: 0,
            totalWorkHours: 0,
            totalTravelHours: 0,
            payRate: null,
            travelPayRate: null,
            payType: "allocation",
            role: "subcontractor",
            growthPct: null,
            compensationType: "allocation",
            hourlyRate: null,
            travelRate: null,
            fixedAmount: null,
            allocationPct: 25,
            paymentStatus: "paid",
            paymentHistory: [{
              id: 71031,
              date: today,
              amount: 800,
              netPaid: 800,
              paymentMethod: "Check",
              referenceNumber: "SPLIT-ORIGINAL",
            }, {
              id: 71032,
              date: today,
              amount: 800,
              netPaid: 800,
              paymentMethod: "Reversal",
              referenceNumber: "SPLIT-REVERSAL",
              isReversal: true,
              reversesPaymentId: 71031,
              reversalReason: "Allocation correction",
              compensationType: "allocation",
              originalPaymentReference: "SPLIT-ORIGINAL",
            }],
          }],
      hours: [{
        id: 7111,
        subcontractorId: 7101,
        subName: "First Job Crew",
        hours: 4,
        hourType: "work",
        date: today,
        rateSnapshot: 25,
        description: "First job hours",
      }],
      distributions: [{
        id: 7121,
        jobId: firstJobId,
        date: today,
        description: "First job draw",
        amount: 40,
      }],
    }],
    [secondJobId, {
      payments: [{
        subcontractorId: 7201,
        subName: "Second Job Crew",
        amountOwed: 200,
        computedOwed: 200,
        amountPaid: 0,
        balance: 200,
        percentComplete: 0,
        paidDate: null,
        paidNotes: null,
        totalHours: 8,
        totalWorkHours: 8,
        totalTravelHours: 0,
        payRate: 25,
        travelPayRate: null,
        payType: "hourly",
        role: "subcontractor",
        growthPct: null,
        compensationType: "hourly",
        hourlyRate: 25,
        travelRate: null,
        fixedAmount: null,
        allocationPct: null,
        paymentStatus: "unpaid",
        paymentHistory: [],
      }],
      hours: [{
        id: 7211,
        subcontractorId: 7201,
        subName: "Second Job Crew",
        hours: 8,
        hourType: "work",
        date: today,
        rateSnapshot: 25,
        description: "Second job hours",
      }],
      distributions: [{
        id: 7221,
        jobId: secondJobId,
        date: today,
        description: "Second job draw",
        amount: 80,
      }],
    }],
  ]);
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
  const panelReadRequests: string[] = [];
  const panelAbortedRequests: string[] = [];
  const panelDelayedRequests: string[] = [];
  let delayedProfitJobId: number | null = null;
  let delayedProfitResponseUsed = false;
  let profitSummaryFailureMode = false;
  let profitSummaryPartialMode = false;
  let profitSummaryMissingJobId: number | null = null;
  let profitSummaryResponseDelayMs = 0;
  let profitDetailFailureMode = false;
  let profitDetailFailureJobId: number | null = null;
  let panelResponseDelayMs = 0;
  let panelResponseDelayJobId: number | null = null;
  let sessionId: string | undefined;
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1200 });
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("requestfailed", request => {
      const url = new URL(request.url());
      const panelPaths = [
        /^\/api\/jobs\/\d+\/profit$/,
        /^\/api\/jobs\/\d+\/sub-payments$/,
        /^\/api\/jobs\/\d+\/sub-hours$/,
        /^\/api\/owner-capital$/,
      ];
      if (panelPaths.some(pattern => pattern.test(url.pathname))) {
        const errorText = request.failure()?.errorText ?? "";
        if (errorText.includes("ABORT")) {
          panelAbortedRequests.push(url.pathname);
        }
      }
    });
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
      const isPanelRead = method === "GET" && (
        /^\/api\/jobs\/\d+\/profit$/.test(path)
        || /^\/api\/jobs\/\d+\/sub-payments$/.test(path)
        || /^\/api\/jobs\/\d+\/sub-hours$/.test(path)
        || path === "/api/owner-capital"
      );
      if (isPanelRead) panelReadRequests.push(path);
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
        if (profitSummaryMissingJobId != null) {
          delete summary[profitSummaryMissingJobId];
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
        if (panelResponseDelayMs > 0
          && (panelResponseDelayJobId == null || panelResponseDelayJobId === jobId)) {
          panelDelayedRequests.push(path);
          setTimeout(() => respondJson(fixture.profit), panelResponseDelayMs);
        } else if (jobId === delayedProfitJobId && !delayedProfitResponseUsed) {
          delayedProfitResponseUsed = true;
          setTimeout(() => respondJson(fixture.profit), 900);
        } else {
          respondJson(fixture.profit);
        }
        return;
      }

      const subPaymentsMatch = path.match(/^\/api\/jobs\/(\d+)\/sub-payments$/);
      if (subPaymentsMatch) {
        const jobId = Number(subPaymentsMatch[1]);
        const payments = panelDetailsByJobId.get(jobId)?.payments ?? [];
        if (panelResponseDelayMs > 0
          && (panelResponseDelayJobId == null || panelResponseDelayJobId === jobId)) {
          panelDelayedRequests.push(path);
          setTimeout(() => respondJson(payments), panelResponseDelayMs);
        } else {
          respondJson(payments);
        }
        return;
      }
      const subHoursMatch = path.match(/^\/api\/jobs\/(\d+)\/sub-hours$/);
      if (subHoursMatch) {
        const jobId = Number(subHoursMatch[1]);
        const hours = panelDetailsByJobId.get(jobId)?.hours ?? [];
        if (panelResponseDelayMs > 0
          && (panelResponseDelayJobId == null || panelResponseDelayJobId === jobId)) {
          panelDelayedRequests.push(path);
          setTimeout(() => respondJson(hours), panelResponseDelayMs);
        } else {
          respondJson(hours);
        }
        return;
      }
      const expensesMatch = path.match(/^\/api\/jobs\/(\d+)\/expenses$/);
      if (expensesMatch) {
        respondJson([]);
        return;
      }
      if (path.startsWith("/api/owner-capital")) {
        const jobId = Number(url.searchParams.get("jobId"));
        const distributions = panelDetailsByJobId.get(jobId)?.distributions ?? [];
        if (method === "GET"
          && panelResponseDelayMs > 0
          && (panelResponseDelayJobId == null || panelResponseDelayJobId === jobId)) {
          panelDelayedRequests.push(path);
          setTimeout(() => respondJson(distributions), panelResponseDelayMs);
        } else if (method === "GET") {
          respondJson(distributions);
        } else {
          respondJson([]);
        }
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
      netProfit: 850,
      splitPool: 892.5,
      profitBreakdown: {
        ...firstExpected.profitBreakdown,
        includedCosts: {
          ...firstExpected.profitBreakdown.includedCosts,
          directExpenses: 200,
          total: 500,
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
    const reversalValues = {
      fixed: readMoneyAfter(financialsText, "Fixed payout reversal"),
      allocation: readMoneyAfter(financialsText, "Split payout reversal"),
      subLabor: readMoneyAfter(financialsText, "Sub labor"),
      splitPayouts: readMoneyAfter(financialsText, "Split payouts"),
      includedCostTotal: readMoneyAfter(financialsText, "Included costs total"),
    };
    record(
      "Job Financials explains reversed fixed and split payouts without changing active profit",
      nearlyEqual(reversalValues.fixed, firstExpected.profitBreakdown.excludedFromProfit.reversedFixedPayouts)
        && nearlyEqual(reversalValues.allocation, firstExpected.profitBreakdown.excludedFromProfit.reversedAllocationPayouts)
        && nearlyEqual(reversalValues.subLabor, -firstExpected.profitBreakdown.includedCosts.subLabor)
        && nearlyEqual(reversalValues.splitPayouts, -firstExpected.profitBreakdown.includedCosts.splitPayouts)
        && nearlyEqual(reversalValues.includedCostTotal, -firstExpected.profitBreakdown.includedCosts.total)
        && nearlyEqual(financialsValues.netProfit, firstExpected.netProfit),
      JSON.stringify(reversalValues),
    );
    const clickButtonByAriaLabel = async (label: string) => page.evaluate(buttonLabel => {
      const button = [...document.querySelectorAll<HTMLButtonElement>("button")]
        .find(candidate => candidate.getAttribute("aria-label") === buttonLabel);
      if (!button) return false;
      button.click();
      return true;
    }, label);
    const reversalLedgerUnexpectedWritesBefore = unexpectedWrites.length;
    const fixedLedgerClicked = await clickButtonByAriaLabel("View fixed payout reversal payment ledger");
    const fixedLedgerLoaded = await page.waitForFunction(
      () => {
        const text = document.querySelector('[role="dialog"]')?.textContent ?? "";
        return text.includes("Fixed payout reversals")
          && text.includes("Fixed Reversal Crew")
          && text.includes("Duplicate fixed payout")
          && text.includes("FIX-ORIGINAL")
          && text.includes("$900.00");
      },
      { timeout: 20_000 },
    ).then(() => true).catch(() => false);
    const fixedLedgerText = await page.$eval('[role="dialog"]', dialog => dialog.textContent ?? "").catch(() => "");
    const fixedLedgerClosed = await clickButtonByAriaLabel("Close reversal payment ledger");
    const splitLedgerClicked = fixedLedgerClosed
      && await clickButtonByAriaLabel("View split payout reversal payment ledger");
    const splitLedgerLoaded = await page.waitForFunction(
      () => {
        const text = document.querySelector('[role="dialog"]')?.textContent ?? "";
        return text.includes("Split payout reversals")
          && text.includes("Split Reversal Crew")
          && text.includes("Allocation correction")
          && text.includes("SPLIT-ORIGINAL")
          && text.includes("$800.00");
      },
      { timeout: 20_000 },
    ).then(() => true).catch(() => false);
    const splitLedgerText = await page.$eval('[role="dialog"]', dialog => dialog.textContent ?? "").catch(() => "");
    const splitLedgerClosed = await clickButtonByAriaLabel("Close reversal payment ledger");
    record(
      "Reversal amounts open the matching read-only payment ledger rows",
      fixedLedgerClicked
        && fixedLedgerLoaded
        && fixedLedgerText.includes("Fixed Reversal Crew")
        && !fixedLedgerText.includes("Split Reversal Crew")
        && fixedLedgerClosed
        && splitLedgerClicked
        && splitLedgerLoaded
        && splitLedgerText.includes("Split Reversal Crew")
        && !splitLedgerText.includes("Fixed Reversal Crew")
        && splitLedgerClosed
        && unexpectedWrites.length === reversalLedgerUnexpectedWritesBefore
        && nearlyEqual(readMoneyAfter(financialsText, "Net Business Profit"), firstExpected.netProfit),
      `fixed=${fixedLedgerLoaded}, split=${splitLedgerLoaded}, closed=${fixedLedgerClosed && splitLedgerClosed}, writes=${unexpectedWrites.length - reversalLedgerUnexpectedWritesBefore}, fixedText=${fixedLedgerText}, splitText=${splitLedgerText}`,
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
      expected => document.body.innerText.includes("Net Profit") && document.body.innerText.includes(expected),
      { timeout: 20_000 },
      routeProfitLabel(expectedRouteProfit(today).netProfit),
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
    const weekScopeJobIds = await page.$$eval(
      '[data-testid^="route-profit-job-row-"]',
      rows => rows.map(row => Number(row.getAttribute("data-job-id"))),
    );
    const weekScopeContributions = await page.$$eval(
      '[data-testid^="route-profit-job-contribution-"]',
      nodes => nodes.map(node => node.textContent?.trim() ?? ""),
    );
    const displayedContributions = weekScopeContributions.map(parseDisplayedMoney);
    const contributionsSum = displayedContributions.every(value => value != null)
      ? displayedContributions.reduce((total, value) => total + (value ?? 0), 0)
      : null;
    const weekContributionsMatchCanonicalTotal =
      JSON.stringify([...new Set(weekScopeJobIds)].sort((a, b) => a - b)) === JSON.stringify(beforeWeekMove.jobIds)
      && weekScopeJobIds.length === beforeWeekMove.jobIds.length
      && contributionsSum != null
      && nearlyEqual(contributionsSum, beforeWeekMove.netProfit);
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
        && weekContributionsMatchCanonicalTotal
        && weekScopeExplained,
      `jobIds=${beforeWeekMove.jobIds.join(",")}, displayed=${beforeWeekMoveDisplayed ?? "missing"}, canonical=${beforeWeekMove.netProfit}, ` +
      `rowJobIds=${weekScopeJobIds.join(",")}, contributions=${weekScopeContributions.join("|")}, ` +
      `contributionSum=${contributionsSum ?? "missing"}, contributionsMatch=${weekContributionsMatchCanonicalTotal}, scopeExplained=${weekScopeExplained}`,
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
    const partialWeekDisplayed = await readRoutePanelNetProfit(page);
    const partialWeekTotalHidden = partialWeekDisplayed == null;
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
    const partialWeekRetryDisplayed = await readRoutePanelNetProfit(page);
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
    const afterWeekMoveDisplayed = await readRoutePanelNetProfit(page);
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
        const text = document.querySelector<HTMLElement>('[data-testid="route-profit-net-profit"]')?.innerText ?? "";
        return text.includes(expectedLabel) && !text.includes(staleLabel);
      },
      { timeout: 20_000 },
      {
        expectedLabel: routeProfitLabel(nextWeekExpected.netProfit),
        staleLabel: routeProfitLabel(afterWeekMove.netProfit),
      },
    ).then(() => true).catch(() => false);
    const nextWeekText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    const nextWeekDisplayed = await readRoutePanelNetProfit(page);
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
    const returnedWeekDisplayed = await readRoutePanelNetProfit(page);
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
      ({ revenueLabel, netProfitLabel }) => {
        const panel = [...document.querySelectorAll<HTMLElement>("div.fixed.inset-0")]
          .find(candidate => [...candidate.querySelectorAll("h2")]
            .some(heading => heading.textContent?.trim() === "Job Financials"));
        const panelText = panel?.innerText.toLowerCase() ?? "";
        return document.querySelector('[data-testid="job-financials-profit-error"]') == null
          && panelText.includes("job revenue")
          && panelText.includes("net business profit")
          && panelText.includes(revenueLabel.toLowerCase())
          && panelText.includes(netProfitLabel.toLowerCase());
      },
      { timeout: 20_000 },
      {
        revenueLabel: formatMoneyLabel(recoveredFirstExpected.grossInvoiced),
        netProfitLabel: formatMoneyLabel(recoveredFirstExpected.netProfit),
      },
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

    const closeFinancialsPanel = () => page.evaluate(() => {
      const panel = document.querySelector('[data-testid="job-financials-panel"]');
      const closeButton = panel?.querySelector("button");
      closeButton?.click();
      return closeButton != null;
    }).catch(() => false);

    const closedBeforeDelayedSwitch = await closeFinancialsPanel();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="job-financials-panel"]') == null,
      { timeout: 10_000 },
    ).catch(() => undefined);
    await page.goto(`${BASE}/jobs`, { waitUntil: "networkidle2", timeout: 60_000 });
    const firstJobVisibleForSwitch = await waitForText(page, fixtures[0].title);
    const firstCardOpenedForSwitch = firstJobVisibleForSwitch
      && await clickJobCardAction(page, fixtures[0].title, "Open Job Card");
    panelResponseDelayMs = 1_500;
    panelResponseDelayJobId = firstJobId;
    const firstPanelDelayedStart = panelDelayedRequests.length;
    const firstPanelOpened = firstCardOpenedForSwitch
      && await clickJobCardAction(page, fixtures[0].title, "Job P&L");
    const firstPanelReadsIssued = await waitForCondition(
      () => {
        const paths = new Set(panelDelayedRequests.slice(firstPanelDelayedStart));
        return [
          `/api/jobs/${firstJobId}/sub-payments`,
          `/api/jobs/${firstJobId}/sub-hours`,
          "/api/owner-capital",
        ].every(path => paths.has(path));
      },
    );
    const firstPanelClosed = await closeFinancialsPanel();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="job-financials-panel"]') == null,
      { timeout: 10_000 },
    ).catch(() => undefined);
    panelResponseDelayMs = 0;
    panelResponseDelayJobId = null;

    const secondCardOpened = await clickJobCardHeadingAction(page, fixtures[1].title, "Open Job Card");
    const secondPanelOpened = secondCardOpened
      && await clickJobCardHeadingAction(page, fixtures[1].title, "Job P&L");
    const secondPanelDetailsLoaded = await page.waitForFunction(
      ({ secondTitle, secondCrew, secondDraw, firstCrew, firstDraw }) => {
        const panel = document.querySelector('[data-testid="job-financials-panel"]');
        const text = panel?.textContent ?? "";
        return panel != null
          && text.includes(secondTitle)
          && text.includes(secondCrew)
          && text.includes(secondDraw)
          && !text.includes(firstCrew)
          && !text.includes(firstDraw);
      },
      { timeout: 20_000 },
      {
        secondTitle: fixtures[1].title,
        secondCrew: "Second Job Crew",
        secondDraw: "Second job draw",
        firstCrew: "First Job Crew",
        firstDraw: "First job draw",
      },
    ).then(() => true).catch(() => false);
    const secondHoursTabOpened = await clickButtonByText(page, "Sub Hours", "Job Financials");
    const secondHoursLoaded = await page.waitForFunction(
      ({ secondHours, firstHours }) => {
        const panel = document.querySelector('[data-testid="job-financials-panel"]');
        const text = panel?.textContent ?? "";
        return panel != null && text.includes(secondHours) && !text.includes(firstHours);
      },
      { timeout: 20_000 },
      { secondHours: "Second job hours", firstHours: "First job hours" },
    ).then(() => true).catch(() => false);
    record(
      "Job Financials keeps payment, withdrawal, and hours details tied to the selected job",
      closedBeforeDelayedSwitch
        && firstPanelOpened
        && firstPanelReadsIssued
        && firstPanelClosed
        && secondPanelOpened
        && secondPanelDetailsLoaded
        && secondHoursTabOpened
        && secondHoursLoaded,
      `firstOpened=${firstPanelOpened}, firstReadsIssued=${firstPanelReadsIssued}, firstClosed=${firstPanelClosed}, delayed=${panelDelayedRequests.slice(firstPanelDelayedStart).join(",")}, secondOpened=${secondPanelOpened}, secondDetails=${secondPanelDetailsLoaded}, hoursTab=${secondHoursTabOpened}, hours=${secondHoursLoaded}`,
    );

    const secondPanelClosedForRetry = await closeFinancialsPanel();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="job-financials-panel"]') == null,
      { timeout: 10_000 },
    ).catch(() => undefined);
    profitDetailFailureMode = true;
    profitDetailFailureJobId = secondJobId;
    const secondFailurePanelOpened = await clickJobCardHeadingAction(page, fixtures[1].title, "Job P&L");
    const secondFailureShown = await page.waitForSelector(
      '[data-testid="job-financials-profit-error"]',
      { visible: true, timeout: 20_000 },
    ).then(() => true).catch(() => false);
    const retryReadStart = panelReadRequests.length;
    const retryProfitStart = profitDetailRequests.length;
    profitDetailFailureMode = false;
    profitDetailFailureJobId = null;
    const activeJobRetryClicked = await clickButtonByText(page, "Try again", "Unable to load job profit");
    const activeJobRetryReadsIssued = await waitForCondition(
      () => panelReadRequests.length >= retryReadStart + 4,
    );
    const activeJobRetryRecovered = await page.waitForFunction(
      ({ secondTitle, secondCrew, secondDraw }) => {
        const panel = document.querySelector('[data-testid="job-financials-panel"]');
        const text = panel?.textContent ?? "";
        return panel != null
          && text.includes(secondTitle)
          && text.includes(secondCrew)
          && text.includes(secondDraw)
          && !document.querySelector('[data-testid="job-financials-profit-error"]');
      },
      { timeout: 20_000 },
      {
        secondTitle: fixtures[1].title,
        secondCrew: "Second Job Crew",
        secondDraw: "Second job draw",
      },
    ).then(() => true).catch(() => false);
    const retryReadPaths = panelReadRequests.slice(retryReadStart);
    const retryProfitJobIds = profitDetailRequests.slice(retryProfitStart);
    const activeJobRetryScoped = retryReadPaths.length >= 4
      && retryReadPaths.every(path => path.includes(`/${secondJobId}/`) || path === "/api/owner-capital")
      && retryProfitJobIds.length > 0
      && retryProfitJobIds.every(jobId => jobId === secondJobId);
    record(
      "Job Financials retry reloads only the active job's details",
      secondPanelClosedForRetry
        && secondFailurePanelOpened
        && secondFailureShown
        && activeJobRetryClicked
        && activeJobRetryReadsIssued
        && activeJobRetryRecovered
        && activeJobRetryScoped,
      `closed=${secondPanelClosedForRetry}, failureOpened=${secondFailurePanelOpened}, failure=${secondFailureShown}, clicked=${activeJobRetryClicked}, readsIssued=${activeJobRetryReadsIssued}, recovered=${activeJobRetryRecovered}, scoped=${activeJobRetryScoped}, retryPaths=${retryReadPaths.join(",")}, retryProfitJobs=${retryProfitJobIds.join(",")}`,
    );

    const closedBeforeAbort = await closeFinancialsPanel();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="job-financials-panel"]') == null,
      { timeout: 10_000 },
    ).catch(() => undefined);
    panelResponseDelayMs = 1_500;
    const panelReadStart = panelReadRequests.length;
    const panelAbortStart = panelAbortedRequests.length;
    const reopenedForAbort = await clickJobCardAction(page, fixtures[0].title, "Job P&L");
    const panelReadsIssued = await waitForCondition(
      () => panelReadRequests.length >= panelReadStart + 4,
    );
    const closedDuringPendingReads = await closeFinancialsPanel();
    const panelAbortsObserved = await waitForCondition(
      () => new Set(panelAbortedRequests.slice(panelAbortStart)).size >= 4,
    );
    panelResponseDelayMs = 0;
    const panelAbortPaths = new Set(panelAbortedRequests.slice(panelAbortStart));
    const panelAbortErrorsSuppressed = !(await page.evaluate(
      () => document.body.innerText.includes("Unable to load job profit"),
    ));
    const reopenedAfterAbort = await clickJobCardAction(page, fixtures[0].title, "Job P&L");
    const activePanelRecoveredAfterAbort = await page.waitForFunction(
      ({ revenueLabel, netProfitLabel }) => {
        const panel = document.querySelector('[data-testid="job-financials-panel"]');
        const text = panel?.textContent ?? "";
        return panel != null
          && text.includes("Job Revenue")
          && text.includes(revenueLabel)
          && text.includes(netProfitLabel);
      },
      { timeout: 20_000 },
      {
        revenueLabel: formatMoneyLabel(recoveredFirstExpected.grossInvoiced),
        netProfitLabel: formatMoneyLabel(recoveredFirstExpected.netProfit),
      },
    ).then(() => true).catch(() => false);
    record(
      "Closing Job Financials aborts all pending panel reads without an error toast",
      closedBeforeAbort
        && reopenedForAbort
        && panelReadsIssued
        && closedDuringPendingReads
        && panelAbortsObserved
        && panelAbortPaths.has(`/api/jobs/${firstJobId}/profit`)
        && panelAbortPaths.has(`/api/jobs/${firstJobId}/sub-payments`)
        && panelAbortPaths.has(`/api/jobs/${firstJobId}/sub-hours`)
        && panelAbortPaths.has("/api/owner-capital")
        && panelAbortErrorsSuppressed,
      `closedBeforeAbort=${closedBeforeAbort}, reopened=${reopenedForAbort}, readsIssued=${panelReadsIssued}, closedDuringReads=${closedDuringPendingReads}, abortsObserved=${panelAbortsObserved}, abortPaths=${[...panelAbortPaths].join(",")}, errorsSuppressed=${panelAbortErrorsSuppressed}`,
    );
    record(
      "Job Financials still loads normally after an aborted panel request",
      reopenedAfterAbort && activePanelRecoveredAfterAbort,
      `reopened=${reopenedAfterAbort}, recovered=${activePanelRecoveredAfterAbort}`,
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
      ({ revenueLabel, netProfitLabel }) => {
        const bodyText = document.body.innerText.toLowerCase();
        return !bodyText.includes("unable to load job profit")
          && bodyText.includes(revenueLabel.toLowerCase())
          && bodyText.includes(netProfitLabel.toLowerCase())
          && bodyText.includes("net profit");
      },
      { timeout: 20_000 },
      {
        revenueLabel: formatMoneyLabel(recoveredFirstExpected.grossInvoiced),
        netProfitLabel: formatMoneyLabel(recoveredFirstExpected.netProfit),
      },
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
        && !routeErrorText.includes(routeProfitLabel(expectedRouteProfit(today).netProfit))
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

    const monthBoundaryOldDate = lastDayOfMonthOffset(today, -2);
    const monthBoundaryNewDate = addDays(monthBoundaryOldDate, 8);
    const monthBoundaryOldTemplate = routeStops.find(stop => stop.jobId === firstJobId);
    const monthBoundaryNewTemplate = routeStops.find(stop => stop.jobId === secondJobId);
    if (!monthBoundaryOldTemplate || !monthBoundaryNewTemplate) {
      throw new Error("Month-boundary route fixtures require both profit jobs");
    }
    routeStops.push(
      {
        ...monthBoundaryOldTemplate,
        id: 95001,
        title: "E2E Month Boundary Old Month",
        scheduledDate: monthBoundaryOldDate,
        sortOrder: Math.max(...routeStops.map(stop => stop.sortOrder), -1) + 1,
      },
      {
        ...monthBoundaryNewTemplate,
        id: 95002,
        title: "E2E Month Boundary New Month",
        scheduledDate: monthBoundaryNewDate,
        sortOrder: Math.max(...routeStops.map(stop => stop.sortOrder), -1) + 1,
      },
    );
    await page.reload({
      waitUntil: "networkidle2",
      timeout: 60_000,
    });
    const monthBoundaryNavigationCount = mainFrameNavigationCount;
    const monthBoundaryWeekSelected = await clickButtonByText(page, "Week");
    const oldMonthWeekStart = startOfWeekSunday(monthBoundaryOldDate);
    const oldMonthWeekEnd = addDays(oldMonthWeekStart, 6);
    const oldMonthExpected = expectedRouteProfitBetween(oldMonthWeekStart, oldMonthWeekEnd);
    const oldMonthDateSelected = await selectCalendarDate(page, monthBoundaryOldDate);
    const oldMonthRefreshed = await waitForRoutePanelNetProfit(page, oldMonthExpected.netProfit);
    const oldMonthDisplayed = await readRoutePanelNetProfit(page);
    record(
      "Week view loads the canonical total before a month boundary",
      monthBoundaryWeekSelected
        && oldMonthDateSelected
        && oldMonthRefreshed
        && nearlyEqual(oldMonthDisplayed, oldMonthExpected.netProfit),
      `date=${monthBoundaryOldDate}, range=${oldMonthWeekStart}..${oldMonthWeekEnd}, jobIds=${oldMonthExpected.jobIds.join(",")}, displayed=${oldMonthDisplayed ?? "missing"}, canonical=${oldMonthExpected.netProfit}`,
    );

    const newMonthWeekStart = startOfWeekSunday(monthBoundaryNewDate);
    const newMonthWeekEnd = addDays(newMonthWeekStart, 6);
    const newMonthExpected = expectedRouteProfitBetween(newMonthWeekStart, newMonthWeekEnd);
    profitSummaryMissingJobId = secondJobId;
    const newMonthDateSelected = await selectCalendarDate(page, monthBoundaryNewDate);
    const newMonthUnavailable = await page.waitForFunction(
      ({ jobId }) => {
        const incompletePanel = document.querySelector('[data-testid="route-profit-incomplete"]');
        const unavailableRow = document.querySelector(`[data-testid="route-profit-job-contribution-${jobId}"]`);
        const netProfit = document.querySelector('[data-testid="route-profit-net-profit"]');
        return incompletePanel != null
          && unavailableRow?.textContent?.includes("Profit unavailable") === true
          && netProfit == null;
      },
      { timeout: 20_000 },
      { jobId: secondJobId },
    ).then(() => true).catch(() => false);
    const newMonthDisplayed = await readRoutePanelNetProfit(page);
    const newMonthSelectedMonth = await page.$eval(
      '[data-testid="route-planner-current-month"]',
      element => element.textContent?.trim() ?? "",
    ).catch(() => "");
    record(
      "Week view hides a partial total when month-boundary profit is unavailable",
      newMonthDateSelected
        && newMonthUnavailable
        && newMonthSelectedMonth.toLowerCase().includes(
          new Date(`${monthBoundaryNewDate}T12:00:00`).toLocaleString("en-US", { month: "long" }).toLowerCase(),
        )
        && newMonthExpected.jobIds.includes(secondJobId)
        && newMonthDisplayed == null
        && newMonthSelectedMonth.length > 0,
      `date=${monthBoundaryNewDate}, range=${newMonthWeekStart}..${newMonthWeekEnd}, jobIds=${newMonthExpected.jobIds.join(",")}, unavailable=${newMonthUnavailable}, selectedMonth=${newMonthSelectedMonth}, displayed=${newMonthDisplayed ?? "hidden"}`,
    );

    profitSummaryMissingJobId = null;
    const newMonthRetryRequestStart = profitSummaryRequests.length;
    const newMonthRetryClicked = await clickButtonByText(
      page,
      "Try again",
      "Some linked job profit data is unavailable",
    );
    const newMonthRetryRequestIssued = await waitForCondition(
      () => profitSummaryRequests.length > newMonthRetryRequestStart,
    );
    const newMonthRetryRecovered = await page.waitForFunction(
      ({ expectedLabel, jobId }) => {
        const panelText = document.querySelector('[data-testid="route-profit-panel"]')?.innerText ?? "";
        return panelText.includes(expectedLabel)
          && document.querySelector('[data-testid="route-profit-incomplete"]') == null
          && document.querySelector(`[data-testid="route-profit-job-contribution-${jobId}"]`)?.textContent?.includes("Profit unavailable") !== true;
      },
      { timeout: 20_000 },
      {
        expectedLabel: routeProfitLabel(newMonthExpected.netProfit),
        jobId: secondJobId,
      },
    ).then(() => true).catch(() => false);
    const newMonthRetryRequest = profitSummaryRequests[newMonthRetryRequestStart];
    const newMonthRetryDisplayed = await readRoutePanelNetProfit(page);
    const newMonthRetrySelectedMonth = await page.$eval(
      '[data-testid="route-planner-current-month"]',
      element => element.textContent?.trim() ?? "",
    ).catch(() => "");
    record(
      "Retry restores the month-boundary Week total without navigation or writes",
      newMonthRetryClicked
        && newMonthRetryRequestIssued
        && newMonthRetryRecovered
        && newMonthRetryRequest?.jobIds.includes(secondJobId) === true
        && nearlyEqual(newMonthRetryDisplayed, newMonthExpected.netProfit)
        && newMonthRetrySelectedMonth === newMonthSelectedMonth
        && mainFrameNavigationCount === monthBoundaryNavigationCount
        && unexpectedWrites.length === 0,
      `clicked=${newMonthRetryClicked}, recovered=${newMonthRetryRecovered}, requestIds=${newMonthRetryRequest?.jobIds.join(",") ?? "missing"}, displayed=${newMonthRetryDisplayed ?? "missing"}, selectedMonthUnchanged=${newMonthRetrySelectedMonth === newMonthSelectedMonth}, navigationUnchanged=${mainFrameNavigationCount === monthBoundaryNavigationCount}`,
    );

    const returnedMonthDateSelected = await selectCalendarDate(page, monthBoundaryOldDate);
    const returnedMonthRefreshed = await waitForRoutePanelNetProfit(
      page,
      oldMonthExpected.netProfit,
      newMonthExpected.netProfit,
    );
    const returnedMonthDisplayed = await readRoutePanelNetProfit(page);
    record(
      "Week view restores the original total after returning across the month boundary",
      returnedMonthDateSelected
        && returnedMonthRefreshed
        && nearlyEqual(returnedMonthDisplayed, oldMonthExpected.netProfit),
      `date=${monthBoundaryOldDate}, displayed=${returnedMonthDisplayed ?? "missing"}, canonical=${oldMonthExpected.netProfit}`,
    );

    const yearBoundaryOldDate = lastDayOfYearOffset(today, -1);
    const yearBoundaryNewDate = addDays(yearBoundaryOldDate, 8);
    const yearBoundaryOldTemplate = routeStops.find(stop => stop.jobId === firstJobId);
    const yearBoundaryNewTemplate = routeStops.find(stop => stop.jobId === secondJobId);
    if (!yearBoundaryOldTemplate || !yearBoundaryNewTemplate) {
      throw new Error("Year-boundary route fixtures require both profit jobs");
    }
    routeStops.push(
      {
        ...yearBoundaryOldTemplate,
        id: 95101,
        title: "E2E Year Boundary December",
        scheduledDate: yearBoundaryOldDate,
        sortOrder: Math.max(...routeStops.map(stop => stop.sortOrder), -1) + 1,
      },
      {
        ...yearBoundaryNewTemplate,
        id: 95102,
        title: "E2E Year Boundary January",
        scheduledDate: yearBoundaryNewDate,
        sortOrder: Math.max(...routeStops.map(stop => stop.sortOrder), -1) + 1,
      },
    );
    await page.reload({
      waitUntil: "networkidle2",
      timeout: 60_000,
    });
    const yearBoundaryNavigationCount = mainFrameNavigationCount;
    const yearBoundaryWeekSelected = await clickButtonByText(page, "Week");
    const decemberWeekStart = startOfWeekSunday(yearBoundaryOldDate);
    const decemberWeekEnd = addDays(decemberWeekStart, 6);
    const decemberExpected = expectedRouteProfitBetween(decemberWeekStart, decemberWeekEnd);
    const decemberDateSelected = await selectCalendarDate(page, yearBoundaryOldDate);
    const decemberRefreshed = await waitForRoutePanelNetProfit(page, decemberExpected.netProfit);
    const decemberDisplayed = await readRoutePanelNetProfit(page);
    const decemberMonthLabel = await page.$eval(
      '[data-testid="route-planner-current-month"]',
      element => element.textContent?.trim() ?? "",
    ).catch(() => "");
    const decemberExpectedMonthLabel = new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
    }).format(new Date(`${yearBoundaryOldDate}T12:00:00`));
    record(
      "Week view loads the canonical total on December 31 before the year boundary",
      yearBoundaryWeekSelected
        && decemberDateSelected
        && decemberRefreshed
        && nearlyEqual(decemberDisplayed, decemberExpected.netProfit)
        && decemberMonthLabel === decemberExpectedMonthLabel,
      `date=${yearBoundaryOldDate}, range=${decemberWeekStart}..${decemberWeekEnd}, jobIds=${decemberExpected.jobIds.join(",")}, displayed=${decemberDisplayed ?? "missing"}, canonical=${decemberExpected.netProfit}, month=${decemberMonthLabel}`,
    );

    const januaryWeekStart = startOfWeekSunday(yearBoundaryNewDate);
    const januaryWeekEnd = addDays(januaryWeekStart, 6);
    const januaryExpected = expectedRouteProfitBetween(januaryWeekStart, januaryWeekEnd);
    const januaryDateSelected = await selectCalendarDate(page, yearBoundaryNewDate);
    const januaryRefreshed = await waitForRoutePanelNetProfit(
      page,
      januaryExpected.netProfit,
      decemberExpected.netProfit,
    );
    const januaryDisplayed = await readRoutePanelNetProfit(page);
    const januaryMonthLabel = await page.$eval(
      '[data-testid="route-planner-current-month"]',
      element => element.textContent?.trim() ?? "",
    ).catch(() => "");
    const januaryExpectedMonthLabel = new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
    }).format(new Date(`${yearBoundaryNewDate}T12:00:00`));
    record(
      "Week view crosses from December into January with the canonical total",
      januaryDateSelected
        && januaryRefreshed
        && nearlyEqual(januaryDisplayed, januaryExpected.netProfit)
        && januaryExpected.jobIds.includes(secondJobId)
        && januaryMonthLabel === januaryExpectedMonthLabel
        && januaryMonthLabel !== decemberMonthLabel,
      `date=${yearBoundaryNewDate}, range=${januaryWeekStart}..${januaryWeekEnd}, jobIds=${januaryExpected.jobIds.join(",")}, displayed=${januaryDisplayed ?? "missing"}, canonical=${januaryExpected.netProfit}, month=${januaryMonthLabel}`,
    );

    const returnedYearBoundaryDateSelected = await selectCalendarDate(page, yearBoundaryOldDate);
    const returnedYearBoundaryRefreshed = await waitForRoutePanelNetProfit(
      page,
      decemberExpected.netProfit,
      januaryExpected.netProfit,
    );
    const returnedYearBoundaryDisplayed = await readRoutePanelNetProfit(page);
    const returnedYearBoundaryMonthLabel = await page.$eval(
      '[data-testid="route-planner-current-month"]',
      element => element.textContent?.trim() ?? "",
    ).catch(() => "");
    record(
      "Returning to December restores the original year-boundary Week total",
      returnedYearBoundaryDateSelected
        && returnedYearBoundaryRefreshed
        && nearlyEqual(returnedYearBoundaryDisplayed, decemberExpected.netProfit)
        && returnedYearBoundaryMonthLabel === decemberExpectedMonthLabel
        && mainFrameNavigationCount === yearBoundaryNavigationCount
        && unexpectedWrites.length === 0,
      `date=${yearBoundaryOldDate}, displayed=${returnedYearBoundaryDisplayed ?? "missing"}, canonical=${decemberExpected.netProfit}, month=${returnedYearBoundaryMonthLabel}, navigationUnchanged=${mainFrameNavigationCount === yearBoundaryNavigationCount}, unexpectedWrites=${unexpectedWrites.length}`,
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
    const closedProfitSortWaitingShown = await page.$('[data-testid="closed-job-sort-waiting"]') !== null;
    const closedProfitSortWaitingText = await page.evaluate(() => document.body.innerText);
    const closedRevenueSortSelected = await selectOptionByText(page, "Highest Revenue");
    const closedJobsRevenueOrderDuringFailure = await readClosedJobTitles(page);
    const closedRevenueSortWaitingShown = await page.$('[data-testid="closed-job-sort-waiting"]') !== null;
    const closedRevenueSortWaitingText = await page.evaluate(() => document.body.innerText);
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
    record(
      "Closed Jobs keeps its existing order when Highest Revenue is unavailable",
      closedRevenueSortSelected
        && JSON.stringify(closedJobsRevenueOrderDuringFailure) === JSON.stringify(closedJobsOrderBeforeProfitSort)
        && closedJobsRevenueOrderDuringFailure.includes(fixtures[0].title)
        && closedJobsRevenueOrderDuringFailure.includes(fixtures[1].title),
      `selected=${closedRevenueSortSelected}, before=${closedJobsOrderBeforeProfitSort.join(" | ")}, duringFailure=${closedJobsRevenueOrderDuringFailure.join(" | ")}`,
    );
    record(
      "Closed Jobs explains why canonical sorting is waiting during an outage",
      closedProfitSortWaitingShown
        && closedRevenueSortWaitingShown
        && closedProfitSortWaitingText.includes("Highest Profit sorting is unavailable until canonical data returns.")
        && closedRevenueSortWaitingText.includes("Highest Revenue sorting is unavailable until canonical data returns."),
      `profitShown=${closedProfitSortWaitingShown}, revenueShown=${closedRevenueSortWaitingShown}`,
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
    const closedRevenueOrderAfterRetry = await readClosedJobTitles(page);
    const closedJobSortWaitingClearedAfterRetry = await page.$('[data-testid="closed-job-sort-waiting"]') === null;
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
    record(
      "Closed Jobs applies Highest Revenue order only after canonical values return",
      closedJobsRetryRecovered
        && JSON.stringify(closedRevenueOrderAfterRetry) === JSON.stringify([
          fixtures[0].title,
          fixtures[1].title,
        ])
        && JSON.stringify(closedRevenueOrderAfterRetry) !== JSON.stringify(closedJobsRevenueOrderDuringFailure),
      `duringFailure=${closedJobsRevenueOrderDuringFailure.join(" | ")}, afterRetry=${closedRevenueOrderAfterRetry.join(" | ")}`,
    );
    record(
      "Closed Jobs clears the sorting status after canonical values return",
      closedJobsRetryRecovered && closedJobSortWaitingClearedAfterRetry,
      `recovered=${closedJobsRetryRecovered}, waitingCleared=${closedJobSortWaitingClearedAfterRetry}`,
    );

    profitSummaryPartialMode = true;
    const partialProfitRequestStart = profitSummaryRequests.length;
    await page.goto(`${BASE}/jobs`, {
      waitUntil: "networkidle2",
      timeout: 60_000,
    });
    await clickButtonContainingText(page, "Closed Jobs");
    const partialRevenueSortSelected = await selectOptionByText(page, "Highest Revenue");
    const partialClosedJobsText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    const partialInitialProfitRequest = profitSummaryRequests[partialProfitRequestStart];
    const partialSortWaitingShown = await page.$('[data-testid="closed-job-sort-waiting"]') !== null;
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
        && partialUnavailableRowMarked
        && partialRevenueSortSelected
        && partialSortWaitingShown
        && partialClosedJobsText.includes("Highest Revenue sorting is waiting for all canonical values."),
      `warning=${partialWarningShown}, missingJobNamed=${partialMissingJobNamed}, totalsUnavailable=${partialTotalsUnavailable}, availableRow=${partialAvailableRowUsable}, unavailableRow=${partialUnavailableRowMarked}, revenueSelected=${partialRevenueSortSelected}, sortWaiting=${partialSortWaitingShown}`,
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
