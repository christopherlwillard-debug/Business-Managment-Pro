/* Authenticated browser regression check for subcontractor payment-history CSV exports.
 *
 * Run:
 *   pnpm --filter @workspace/api-server run verify:subcontractor-csv
 *
 * The check creates temporary subcontractors and payment-history rows, drives the
 * real Subcontractors page, captures the browser's export requests and filenames,
 * verifies invalid ranges do not export, and removes every fixture and session.
 */
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import type { Page } from "puppeteer";
import { db } from "@workspace/db";
import {
  businessesTable,
  jobSubcontractorsTable,
  jobsTable,
  sessionsTable,
  settingsTable,
  subPaymentRecordsTable,
  subcontractorsTable,
} from "@workspace/db/schema";
import { createTestLoginProof, SESSION_COOKIE } from "../src/lib/auth";
import { launchBrowser } from "../src/lib/launchBrowser";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:80";
const RANGE_START = "2026-08-01";
const RANGE_END = "2026-08-31";
const BUSINESS_LINE = "Roofing";
const FIXTURE_PREFIX = `E2E-SUB-CSV-${Date.now() % 1_000_000}`;
const SID = `e2e-sub-csv-${randomUUID()}`;

if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
  throw new Error("Refusing to run subcontractor CSV verification against a production deployment");
}

const baseUrl = new URL(BASE);
const baseHostname = baseUrl.hostname.replace(/^\[|\]$/g, "");
if (baseUrl.protocol !== "http:" || !["localhost", "127.0.0.1", "::1"].includes(baseHostname)) {
  throw new Error(
    `Refusing to run subcontractor CSV verification against non-local target ${baseUrl.origin}. ` +
    "Set E2E_BASE_URL to a local development server.",
  );
}

const results: { name: string; pass: boolean; detail?: string }[] = [];

function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

type Fixture = {
  subcontractorIds: number[];
  jobIds: number[];
  paymentIds: number[];
};

type VerificationBusiness = { id: number; slug: string };

async function createFixture(business: VerificationBusiness): Promise<Fixture> {
  const fixture: Fixture = { subcontractorIds: [], jobIds: [], paymentIds: [] };
  const [firstSub, secondSub] = await db.insert(subcontractorsTable).values([
    {
      name: `${FIXTURE_PREFIX} Primary`,
      trade: "Automated CSV verification",
      notes: "Temporary development-only subcontractor CSV fixture",
    },
    {
      name: `${FIXTURE_PREFIX} Aggregate`,
      trade: "Automated CSV verification",
      notes: "Temporary development-only subcontractor CSV fixture",
    },
  ]).returning({ id: subcontractorsTable.id });
  if (!firstSub || !secondSub) throw new Error("Unable to create subcontractor CSV fixtures");
  fixture.subcontractorIds.push(firstSub.id, secondSub.id);

  const jobSpecs = [
    {
      subcontractorId: firstSub.id,
      title: `${FIXTURE_PREFIX} Primary in range`,
      businessLine: BUSINESS_LINE,
      startDate: "2026-08-04",
      paidDate: "2026-08-05",
    },
    {
      subcontractorId: firstSub.id,
      title: `${FIXTURE_PREFIX} Primary other line`,
      businessLine: "Sealing",
      startDate: "2026-08-14",
      paidDate: "2026-08-15",
    },
    {
      subcontractorId: firstSub.id,
      title: `${FIXTURE_PREFIX} Primary out of range`,
      businessLine: BUSINESS_LINE,
      startDate: "2026-07-31",
      paidDate: "2026-07-31",
    },
    {
      subcontractorId: secondSub.id,
      title: `${FIXTURE_PREFIX} Aggregate in range`,
      businessLine: BUSINESS_LINE,
      startDate: "2026-08-20",
      paidDate: "2026-08-21",
    },
  ];

  try {
    for (const [index, spec] of jobSpecs.entries()) {
      const [job] = await db.insert(jobsTable).values({
        title: spec.title,
        status: "completed",
        startDate: spec.startDate,
        endDate: spec.startDate,
        businessLine: spec.businessLine,
        businessId: business.id,
      }).returning({ id: jobsTable.id });
      if (!job) throw new Error(`Unable to create job CSV fixture ${index}`);
      fixture.jobIds.push(job.id);

      await db.insert(jobSubcontractorsTable).values({
        jobId: job.id,
        subcontractorId: spec.subcontractorId,
        compensationType: "fixed",
        fixedAmount: "100.00",
        amountOwed: "100.00",
        amountPaid: "50.00",
        paidDate: spec.paidDate,
        paidAt: new Date(`${spec.paidDate}T12:00:00.000Z`),
        paymentStatus: "partial",
      });

      const [payment] = await db.insert(subPaymentRecordsTable).values({
        jobId: job.id,
        subcontractorId: spec.subcontractorId,
        businessLine: spec.businessLine,
        amount: "50.00",
        paymentDate: spec.paidDate,
        description: "Temporary CSV export fixture payment",
        createdFrom: "e2e-subcontractor-csv-verify",
        idempotencyKey: `${FIXTURE_PREFIX}-${index}`,
        agreedOwedSnapshot: "100.00",
        netPaid: "50.00",
      }).returning({ id: subPaymentRecordsTable.id });
      if (!payment) throw new Error(`Unable to create payment CSV fixture ${index}`);
      fixture.paymentIds.push(payment.id);
    }
  } catch {
    // The partially populated fixture is returned to the caller's cleanup path
    // by rethrowing after the IDs have been recorded.
    throw Object.assign(new Error("Unable to create subcontractor CSV fixtures"), { fixture });
  }

  return fixture;
}

async function deleteFixture(fixture: Fixture) {
  if (fixture.paymentIds.length > 0) {
    await db.delete(subPaymentRecordsTable).where(inArray(subPaymentRecordsTable.id, fixture.paymentIds));
  }
  if (fixture.jobIds.length > 0) {
    await db.delete(jobSubcontractorsTable).where(inArray(jobSubcontractorsTable.jobId, fixture.jobIds));
    await db.delete(jobsTable).where(inArray(jobsTable.id, fixture.jobIds));
  }
  if (fixture.subcontractorIds.length > 0) {
    await db.delete(subcontractorsTable).where(inArray(subcontractorsTable.id, fixture.subcontractorIds));
  }
}

async function setSelectValue(page: Page, value: string): Promise<boolean> {
  return page.evaluate(valueToSet => {
    const select = Array.from(document.querySelectorAll("select"))
      .find(candidate => Array.from(candidate.options).some(option => option.value === valueToSet));
    if (!select || !Array.from(select.options).some(option => option.value === valueToSet)) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    setter?.call(select, valueToSet);
    const selected = select.value === valueToSet;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return selected;
  }, value);
}

async function setDateValue(page: Page, labelText: string, value: string): Promise<boolean> {
  return page.evaluate(({ labelText, value }) => {
    const label = Array.from(document.querySelectorAll("label"))
      .find(candidate => candidate.textContent?.trim() === labelText);
    const input = label?.parentElement?.querySelector("input[type=date]") as HTMLInputElement | null;
    if (!input) return false;

    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return input.value === value;
  }, { labelText, value });
}

async function clickButton(page: Page, text: string): Promise<boolean> {
  return page.evaluate(buttonText => {
    const button = Array.from(document.querySelectorAll("button"))
      .find(candidate => candidate.textContent?.trim() === buttonText);
    if (!button || (button as HTMLButtonElement).disabled) return false;
    (button as HTMLButtonElement).click();
    return true;
  }, text);
}

async function main() {
  const [[settings], [business]] = await Promise.all([
    db.select({ ownerUserId: settingsTable.ownerUserId }).from(settingsTable).limit(1),
    db.select({ id: businessesTable.id, slug: businessesTable.slug })
      .from(businessesTable)
      .where(eq(businessesTable.slug, "general_contracting"))
      .limit(1),
  ]);
  if (!settings?.ownerUserId) throw new Error("No configured owner available for authenticated verification");
  if (!business) throw new Error("The general_contracting development business is required for verification");

  let fixture: Fixture | undefined;
  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
  let sessionId: string | undefined;
  const requestUrls: string[] = [];
  const unexpectedWrites: string[] = [];

  try {
    try {
      fixture = await createFixture(business);
    } catch (error) {
      const partialFixture = (error as { fixture?: Fixture }).fixture;
      if (partialFixture) fixture = partialFixture;
      throw error;
    }

    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1100 });
    await page.setRequestInterception(true);
    page.on("request", request => {
      const method = request.method().toUpperCase();
      if (["GET", "HEAD", "OPTIONS"].includes(method)) {
        if (request.url().includes("/payment-history")) requestUrls.push(request.url());
        void request.continue();
        return;
      }
      unexpectedWrites.push(`${method} ${request.url()}`);
      void request.abort("blockedbyclient");
    });

    await page.evaluateOnNewDocument(() => {
      const downloads: string[] = [];
      Object.defineProperty(window, "__e2eDownloads", { configurable: true, value: downloads });
      const originalCreateElement = Document.prototype.createElement;
      Document.prototype.createElement = function (
        tagName: string,
        options?: ElementCreationOptions,
      ) {
        const element = originalCreateElement.call(this, tagName, options);
        if (tagName.toLowerCase() === "a") {
          const originalClick = (element as HTMLAnchorElement).click.bind(element);
          (element as HTMLAnchorElement).click = function () {
            const filename = (element as HTMLAnchorElement).download;
            if (filename) downloads.push(filename);
            return originalClick();
          };
        }
        return element;
      };
    });

    const returnTo = "/people?tab=subcontractors";
    const proof = createTestLoginProof(returnTo);
    const loginParams = new URLSearchParams({ returnTo, ...proof });
    await page.goto(`${BASE}/api/dev-test-login?${loginParams}`, {
      waitUntil: "networkidle2",
      timeout: 60_000,
    });
    sessionId = (await page.cookies()).find(cookie => cookie.name === SESSION_COOKIE)?.value;
    if (!sessionId) throw new Error("Development login did not create a session cookie");

    await page.goto(`${BASE}/people?tab=subcontractors`, { waitUntil: "networkidle2", timeout: 60_000 });
    await page.waitForFunction(
      name => document.body.innerText.includes(name),
      { timeout: 30_000 },
      `${FIXTURE_PREFIX} Primary`,
    );
    record(
      "Authenticated Subcontractors page loads temporary fixtures",
      (() => {
        const current = new URL(page.url());
        return current.pathname === "/people" && current.searchParams.get("tab") === "subcontractors";
      })()
        && !(await page.evaluate(() => /log in|sign in/i.test(document.body.innerText.slice(0, 500))))
        && (await page.evaluate(prefix => document.body.innerText.includes(prefix), FIXTURE_PREFIX)),
      page.url(),
    );

    const opened = await page.evaluate(name => {
      const row = Array.from(document.querySelectorAll("tr"))
        .find(candidate => candidate.textContent?.includes(name));
      const button = Array.from(row?.querySelectorAll("button") ?? [])
        .find(candidate => /portal|set up/i.test(candidate.textContent ?? ""));
      if (!button) return false;
      (button as HTMLButtonElement).click();
      return true;
    }, `${FIXTURE_PREFIX} Primary`);
    record("Primary subcontractor opens its detail modal", opened);
    await page.waitForFunction(
      () => document.body.innerText.includes("Payment History"),
      { timeout: 15_000 },
    );

    const selectedHistoryTab = await clickButton(page, "Payment History");
    record("Payment History tab is selectable", selectedHistoryTab);
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll("select"))
        .some(select => Array.from(select.options).some(option => option.value === "range")),
      { timeout: 15_000 },
    );
    record("Payment history exposes exact date-range controls", await setSelectValue(page, "range"));
    await sleep(250);
    record("Exact start date is selected", await setDateValue(page, "Start date", RANGE_START));
    record("Exact end date is selected", await setDateValue(page, "End date", RANGE_END));
    await page.waitForFunction(
      ({ start, end }) => {
        const inputs = Array.from(document.querySelectorAll('input[type="date"]')) as HTMLInputElement[];
        return inputs.some(input => input.value === start) && inputs.some(input => input.value === end);
      },
      { timeout: 15_000 },
      { start: RANGE_START, end: RANGE_END },
    );
    await page.waitForFunction(
      line => Array.from(document.querySelectorAll("select"))
        .some(select => Array.from(select.options).some(option => option.value === line)),
      { timeout: 15_000 },
      BUSINESS_LINE,
    );
    record(
      "Business-line filter selects the requested line",
      await setSelectValue(page, BUSINESS_LINE),
    );
    await sleep(500);
    await page.evaluate(() => {
      const downloads = (window as unknown as { __e2eDownloads?: string[] }).__e2eDownloads ?? [];
      (window as unknown as { __e2eDownloads: string[] }).__e2eDownloads = downloads;
      const originalClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this.download) downloads.push(this.download);
        return originalClick.call(this);
      };
    });

    const downloadCount = async () => page.evaluate(() => (window as unknown as { __e2eDownloads?: string[] }).__e2eDownloads?.length ?? 0);
    const exportAndInspect = async (buttonText: string, expectedPath: string, expectedFilename: string) => {
      const beforeDownloads = await downloadCount();
      const beforeRequests = requestUrls.length;
      const clicked = await clickButton(page, buttonText);
      if (!clicked) return { clicked, request: undefined, filename: undefined };
      await page.waitForFunction(
        count => ((window as unknown as { __e2eDownloads?: string[] }).__e2eDownloads?.length ?? 0) > count,
        { timeout: 15_000 },
        beforeDownloads,
      );
      const request = requestUrls.slice(beforeRequests).find(url => url.includes(expectedPath));
      const filename = await page.evaluate(() => {
        const values = (window as unknown as { __e2eDownloads?: string[] }).__e2eDownloads ?? [];
        return values[values.length - 1];
      });
      return { clicked, request, filename };
    };

    const oneExport = await exportAndInspect(
      "Export CSV",
      `/api/subcontractors/${fixture.subcontractorIds[0]}/payment-history`,
      `subcontractor-${fixture.subcontractorIds[0]}-payment-history-${RANGE_START}-to-${RANGE_END}.csv`,
    );
    const oneParams = oneExport.request ? new URL(oneExport.request).searchParams : null;
    record(
      "Export CSV requests the selected range and business line",
      !!oneExport.clicked
        && !!oneParams
        && oneParams.get("format") === "csv"
        && oneParams.get("startDate") === RANGE_START
        && oneParams.get("endDate") === RANGE_END
        && oneParams.get("businessLine") === BUSINESS_LINE,
      oneExport.request ?? "request not captured",
    );
    record(
      "Export CSV download filename includes the selected range",
      oneExport.filename === `subcontractor-${fixture.subcontractorIds[0]}-payment-history-${RANGE_START}-to-${RANGE_END}.csv`,
      oneExport.filename ?? "filename not captured",
    );

    const allExport = await exportAndInspect(
      "Export All CSV",
      "/api/subcontractors/payment-history/all",
      `subcontractors-payment-history-${RANGE_START}-to-${RANGE_END}.csv`,
    );
    const allParams = allExport.request ? new URL(allExport.request).searchParams : null;
    record(
      "Export All CSV requests the selected range and business line",
      !!allExport.clicked
        && !!allParams
        && allParams.get("format") === "csv"
        && allParams.get("startDate") === RANGE_START
        && allParams.get("endDate") === RANGE_END
        && allParams.get("businessLine") === BUSINESS_LINE,
      allExport.request ?? "request not captured",
    );
    record(
      "Export All CSV download filename includes the selected range",
      allExport.filename === `subcontractors-payment-history-${RANGE_START}-to-${RANGE_END}.csv`,
      allExport.filename ?? "filename not captured",
    );

    const invalidBeforeDownloads = await downloadCount();
    const invalidBeforeRequests = requestUrls.length;
    await setDateValue(page, "End date", "");
    await page.waitForFunction(
      () => document.body.innerText.includes("Choose both a start date and an end date."),
      { timeout: 15_000 },
    );
    const invalidButton = await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll("button"))
        .find(candidate => candidate.textContent?.trim() === "Export CSV") as HTMLButtonElement | undefined;
      return button ? { disabled: button.disabled, clicked: button.click() } : null;
    });
    await sleep(300);
    record(
      "Invalid date range blocks Export CSV without a download or request",
      !!invalidButton?.disabled
        && await downloadCount() === invalidBeforeDownloads
        && requestUrls.length === invalidBeforeRequests,
      `disabled=${invalidButton?.disabled}, downloads=${await downloadCount() - invalidBeforeDownloads}, requests=${requestUrls.length - invalidBeforeRequests}`,
    );

    await setDateValue(page, "Start date", "2026-09-01");
    await setDateValue(page, "End date", "2026-08-01");
    await page.waitForFunction(
      () => document.body.innerText.includes("End date must be on or after the start date."),
      { timeout: 15_000 },
    );
    const reversedBeforeDownloads = await downloadCount();
    const reversedBeforeRequests = requestUrls.length;
    const reversedButton = await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll("button"))
        .find(candidate => candidate.textContent?.trim() === "Export All CSV") as HTMLButtonElement | undefined;
      return button ? { disabled: button.disabled, clicked: button.click() } : null;
    });
    await sleep(300);
    record(
      "Reversed date range blocks Export All CSV without a download or request",
      !!reversedButton?.disabled
        && await downloadCount() === reversedBeforeDownloads
        && requestUrls.length === reversedBeforeRequests,
      `disabled=${reversedButton?.disabled}, downloads=${await downloadCount() - reversedBeforeDownloads}, requests=${requestUrls.length - reversedBeforeRequests}`,
    );

    record(
      "Browser verification issued no unexpected writes",
      unexpectedWrites.length === 0,
      unexpectedWrites.join(", "),
    );
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (error) {
        console.error(`Browser cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (fixture) {
      try {
        await deleteFixture(fixture);
      } catch (error) {
        record(
          "Temporary subcontractor CSV fixtures are removed",
          false,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    if (sessionId) {
      await db.delete(sessionsTable).where(eq(sessionsTable.sid, sessionId));
    }

    if (fixture) {
      const [remainingSubs, remainingJobs, remainingAssignments, remainingPayments, remainingSessions] = await Promise.all([
        db.select({ id: subcontractorsTable.id }).from(subcontractorsTable)
          .where(inArray(subcontractorsTable.id, fixture.subcontractorIds)),
        db.select({ id: jobsTable.id }).from(jobsTable).where(inArray(jobsTable.id, fixture.jobIds)),
        db.select({ jobId: jobSubcontractorsTable.jobId }).from(jobSubcontractorsTable)
          .where(inArray(jobSubcontractorsTable.jobId, fixture.jobIds)),
        db.select({ id: subPaymentRecordsTable.id }).from(subPaymentRecordsTable)
          .where(inArray(subPaymentRecordsTable.id, fixture.paymentIds)),
        db.select({ sid: sessionsTable.sid }).from(sessionsTable).where(eq(sessionsTable.sid, SID)),
      ]);
      record(
        "Temporary subcontractors, jobs, assignments, payments, and session are removed",
        remainingSubs.length === 0
          && remainingJobs.length === 0
          && remainingAssignments.length === 0
          && remainingPayments.length === 0
          && remainingSessions.length === 0,
        `subs=${remainingSubs.length}, jobs=${remainingJobs.length}, assignments=${remainingAssignments.length}, payments=${remainingPayments.length}, sessions=${remainingSessions.length}`,
      );
    }
  }

  const failures = results.filter(result => !result.pass);
  if (failures.length > 0) {
    process.exitCode = 1;
    console.error(`\n${failures.length} subcontractor CSV browser check(s) failed.`);
  } else {
    console.log(`\nAll ${results.length} subcontractor CSV browser checks passed.`);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});