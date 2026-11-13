/* Read-only browser regression for Dashboard business-selection query scope. */
import type { HTTPRequest, Page } from "puppeteer";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  businessesTable,
  jobsTable,
  expensesTable,
  invoicesTable,
  ownerCapitalEntriesTable,
} from "@workspace/db";
import { createTestLoginProof, deleteSession, SESSION_COOKIE } from "../src/lib/auth";
import { launchBrowser } from "../src/lib/launchBrowser";
import { randomUUID } from "node:crypto";

const BASE = process.env.BUILDPRO_E2E_BASE_URL ?? "http://localhost:80";
const ROUTES = [
  "/api/reports/dashboard",
  "/api/reports/owner-pay-summary",
  "/api/dashboard/today",
  "/api/dashboard/continue-working",
  "/api/dashboard/recent-activity",
] as const;
const SCOPED_DATA_ROUTES = [
  "/api/jobs",
  "/api/expenses",
  "/api/invoices",
  "/api/jobs/financials-summary",
  "/api/reports/dashboard",
  "/api/reports/owner-pay-summary",
  "/api/dashboard/today",
  "/api/dashboard/continue-working",
  "/api/dashboard/recent-activity",
] as const;
const COMPANY_ALERT_FIXTURES = {
  complianceItems: [{
    id: -2589,
    title: "Company-level compliance test",
    dueDate: "2000-01-01",
    computedStatus: "overdue",
    daysUntilDue: -1,
  }],
  taxQuarters: [{
    quarter: 1,
    label: "Q1",
    period: "Current year Q1",
    federalDueDate: "2000-01-01",
    federalDueDateLabel: "overdue",
    safeHarborTotal: 100,
    recommendedTotal: 100,
    totalPaid: 0,
    status: "overdue" as const,
  }],
};
const results: Array<{ name: string; pass: boolean; detail: string }> = [];
const blockedWrites: string[] = [];

if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
  throw new Error("Refusing to run Dashboard business-scope verification against production");
}

const baseUrl = new URL(BASE);
if (baseUrl.protocol !== "http:" || !["localhost", "127.0.0.1", "::1"].includes(baseUrl.hostname)) {
  throw new Error(`Refusing non-local Dashboard E2E target ${baseUrl.origin}`);
}

type CapturedRequest = { pathname: string; params: URLSearchParams };
type TestFixtures = {
  businessId?: number;
  jobIds: number[];
  expenseIds: number[];
  invoiceIds: number[];
  ownerEntryIds: number[];
};

function record(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
}

async function waitForDashboard(page: Page) {
  try {
    await page.waitForFunction(
      () => ["Business Health", "Owner Withdrawals"].every(text => document.body.innerText.includes(text)),
      { timeout: 30_000 },
    );
  } catch (error) {
    console.error(`Dashboard did not render at ${page.url()}: ${(await page.$eval("body", element => element.innerText)).slice(0, 1_200)}`);
    await page.screenshot({ path: "/tmp/e2e-dashboard-business-scope-render-failure.png", fullPage: true }).catch(() => undefined);
    throw error;
  }
}

async function waitForSelectorScreen(page: Page) {
  await page.waitForFunction(
    () => document.body.innerText.includes("Choose which business to work in"),
    { timeout: 30_000 },
  );
}

async function assertCashFlowVisibility(page: Page, expectedVisible: boolean, label: string) {
  if (expectedVisible) {
    await page.waitForFunction(
      () => [...document.querySelectorAll("h2")].some(element => element.textContent?.trim() === "Cash Flow"),
      { timeout: 30_000 },
    );
  }
  const visible = await page.$$eval(
    "h2",
    elements => elements.some(element => element.textContent?.trim() === "Cash Flow"),
  );
  record(
    `${label} keeps company-wide cash flow in the correct view`,
    visible === expectedVisible,
    `visible=${visible}`,
  );
}

async function assertCompanyAlerts(page: Page, label: string) {
  const rows = await page.$$eval("button", buttons =>
    buttons.map(button => button.innerText.replace(/\s+/g, " ").trim()),
  );
  const complianceRows = rows.filter(text => text.includes("Compliance Items"));
  const taxRows = rows.filter(text => text.includes("Tax Payments Due"));
  const pass = complianceRows.length === 1
    && complianceRows[0].includes("1 urgent")
    && taxRows.length === 1
    && taxRows[0].includes("1 due");
  record(
    `${label} keeps company-level compliance and tax alerts visible once`,
    pass,
    `compliance=${JSON.stringify(complianceRows)}; tax=${JSON.stringify(taxRows)}`,
  );
}

async function assertScopeRequests(
  page: Page,
  requests: CapturedRequest[],
  startIndex: number,
  expected: { businessId?: string; businessLine?: string },
  label: string,
  allowSelectorPrefetch = false,
) {
  const matches = (request: CapturedRequest, route: typeof ROUTES[number]) =>
    (expected.businessId === undefined
      ? !request.params.has("businessId")
      : request.params.get("businessId") === expected.businessId)
    && ((route === "/api/reports/owner-pay-summary" || expected.businessLine === undefined)
      ? !request.params.has("businessLine")
      : request.params.get("businessLine") === expected.businessLine);
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const recent = requests.slice(startIndex);
    const missing = ROUTES.filter(route => {
      const routeRequests = allowSelectorPrefetch
        && (route === "/api/reports/dashboard" || route === "/api/reports/owner-pay-summary")
        ? requests
        : recent;
      return !routeRequests.some(request => request.pathname === route && matches(request, route));
    });
    if (missing.length === 0) {
      record(
        `${label} scopes every Dashboard query`,
        true,
        `${expected.businessId ?? "all"}${expected.businessLine ? `/${expected.businessLine}` : ""}; snapshot/withdrawals may reuse the matching selector query`,
      );
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  const recent = requests.slice(startIndex);
  const summary = requests
    .filter(request => ROUTES.includes(request.pathname as typeof ROUTES[number]))
    .map(request => `${request.pathname}?${request.params.toString()}`)
    .join(" | ");
  record(`${label} scopes every Dashboard query`, false, `missing ${ROUTES.join(", ")} after request ${startIndex}; all observed ${summary || "none"}`);
  await page.screenshot({ path: `/tmp/e2e-dashboard-business-scope-${label.replaceAll(" ", "-")}.png`, fullPage: true }).catch(() => undefined);
}

async function clickAllBusinesses(page: Page) {
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find(element =>
      element.textContent?.includes("View combined data across all businesses"),
    );
    if (!button) throw new Error("All Businesses selector button was not found");
    (button as HTMLButtonElement).click();
  });
}

async function createBusinessFixtures(runTag: string): Promise<{
  kinora: { id: number; slug: string; legalBusinessId: number | null };
  markers: { willard: string; kinora: string };
  fixtureIds: TestFixtures;
}> {
  const fixtureIds: TestFixtures = { jobIds: [], expenseIds: [], invoiceIds: [], ownerEntryIds: [] };
  const [legal] = await db.select({
    id: businessesTable.id,
    slug: businessesTable.slug,
    legalBusinessId: businessesTable.legalBusinessId,
  }).from(businessesTable).where(eq(businessesTable.slug, "general_contracting")).limit(1);
  if (!legal) throw new Error("Willard's General Contracting business is required for this regression");

  try {
    const kinoraSlug = `kinora_e2e_${randomUUID().slice(0, 8)}`;
    const [kinora] = await db.insert(businessesTable).values({
      name: `Kinora ${runTag}`,
      slug: kinoraSlug,
      type: "other",
      legalBusinessId: null,
      parentBusinessId: null,
      defaultQuoteValidityDays: 30,
      sortOrder: 9999,
    }).returning({
      id: businessesTable.id,
      slug: businessesTable.slug,
      legalBusinessId: businessesTable.legalBusinessId,
    });
    fixtureIds.businessId = kinora.id;
    const markers = {
      willard: `SCOPE-${runTag}-WILLARD`,
      kinora: `SCOPE-${runTag}-KINORA`,
    };
    const today = new Date().toISOString().slice(0, 10);
    const businesses = [
      { id: legal.id, slug: legal.slug, marker: markers.willard, withdrawal: "-17.31" },
      { id: kinora.id, slug: kinora.slug, marker: markers.kinora, withdrawal: "-29.47" },
    ];

    for (const business of businesses) {
      const [job] = await db.insert(jobsTable).values({
        title: `${business.marker}-ACTIVE-JOB`,
        status: "in_progress",
        startDate: today,
        businessId: business.id,
        businessLine: business.slug,
      }).returning({ id: jobsTable.id });
      fixtureIds.jobIds.push(job.id);

      const [expense] = await db.insert(expensesTable).values({
        description: `${business.marker}-EXPENSE`,
        amount: business.withdrawal === "-17.31" ? "17.31" : "29.47",
        category: "Other",
        date: today,
        businessId: business.id,
        businessLine: business.slug,
      }).returning({ id: expensesTable.id });
      fixtureIds.expenseIds.push(expense.id);

      const invoiceDigits = `${Date.now()}${business.id}`.slice(-8);
      const [invoice] = await db.insert(invoicesTable).values({
        invoiceNumber: `9${invoiceDigits}`,
        status: "sent",
        issueDate: today,
        subtotal: "1.00",
        total: "1.00",
        lineItems: [{ description: `${business.marker}-INVOICE`, quantity: 1, unitPrice: 1 }],
        businessId: business.id,
        businessLine: business.slug,
      }).returning({ id: invoicesTable.id });
      fixtureIds.invoiceIds.push(invoice.id);

      const [ownerEntry] = await db.insert(ownerCapitalEntriesTable).values({
        businessId: business.id,
        date: today,
        description: `${business.marker}-WITHDRAWAL`,
        amount: business.withdrawal,
        source: "capital_entry_withdrawal",
      }).returning({ id: ownerCapitalEntriesTable.id });
      fixtureIds.ownerEntryIds.push(ownerEntry.id);
    }
    return { kinora, markers, fixtureIds };
  } catch (error) {
    await cleanupBusinessFixtures(fixtureIds);
    throw error;
  }
}

async function cleanupBusinessFixtures(fixtures: TestFixtures) {
  const failures: unknown[] = [];
  const cleanups = [
    () => fixtures.invoiceIds.length && db.delete(invoicesTable).where(inArray(invoicesTable.id, fixtures.invoiceIds)),
    () => fixtures.expenseIds.length && db.delete(expensesTable).where(inArray(expensesTable.id, fixtures.expenseIds)),
    () => fixtures.ownerEntryIds.length && db.delete(ownerCapitalEntriesTable).where(inArray(ownerCapitalEntriesTable.id, fixtures.ownerEntryIds)),
    () => fixtures.jobIds.length && db.delete(jobsTable).where(inArray(jobsTable.id, fixtures.jobIds)),
    () => fixtures.businessId != null && db.delete(businessesTable).where(eq(businessesTable.id, fixtures.businessId!)),
  ];
  for (const cleanup of cleanups) {
    try {
      await cleanup();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) {
    throw new Error(`Could not fully clean up business-scope fixtures: ${failures.map(String).join("; ")}`);
  }
}

async function assertScopedDatasets(
  page: Page,
  requests: CapturedRequest[],
  expected: { businessId: number; slug: string; marker: string; otherMarker: string },
  label: string,
) {
  const previousCount = requests.length;
  const data = await page.evaluate(async ({ businessId }) => {
    const urls = [
      `/api/jobs?businessId=${businessId}`,
      `/api/expenses?businessId=${businessId}`,
      `/api/invoices?businessId=${businessId}&includeDrafts=true`,
      `/api/jobs/financials-summary?businessId=${businessId}`,
      `/api/reports/dashboard?businessId=${businessId}&period=month`,
      `/api/reports/owner-pay-summary?businessId=${businessId}`,
      `/api/dashboard/today?businessId=${businessId}`,
      `/api/dashboard/continue-working?businessId=${businessId}`,
      `/api/dashboard/recent-activity?businessId=${businessId}`,
    ];
    return Promise.all(urls.map(async url => {
      const response = await fetch(url, { credentials: "include" });
      const body = await response.text();
      return { url, status: response.status, body };
    }));
  }, { businessId: expected.businessId });
  const requiredMarkersByRoute: Record<string, string> = {
    "/api/jobs": `${expected.marker}-ACTIVE-JOB`,
    "/api/expenses": `${expected.marker}-EXPENSE`,
    "/api/invoices": expected.marker,
    "/api/jobs/financials-summary": `${expected.marker}-ACTIVE-JOB`,
    "/api/reports/owner-pay-summary": `${expected.marker}-ACTIVE-JOB`,
    "/api/dashboard/today": `${expected.marker}-SCHEDULE`,
    "/api/dashboard/continue-working": `${expected.marker}-ACTIVE-JOB`,
    "/api/dashboard/recent-activity": `${expected.marker}-EXPENSE`,
  };
  const mismatched = data.filter(response => {
    const path = new URL(response.url, "http://localhost").pathname;
    const requiredMarker = requiredMarkersByRoute[path];
    return response.status < 200 || response.status >= 300
      || response.body.includes(expected.otherMarker)
      || (requiredMarker != null && !response.body.includes(requiredMarker))
      || !response.url.includes(`businessId=${expected.businessId}`);
  });
  const captured = requests.slice(previousCount);
  const missing = SCOPED_DATA_ROUTES.filter(route =>
    !captured.some(request =>
      request.pathname === route && request.params.get("businessId") === String(expected.businessId),
    ),
  );
  const pass = mismatched.length === 0 && missing.length === 0;
  record(
    `${label} keeps jobs, expenses, invoices, financial summaries, and dashboard reads isolated`,
    pass,
    `wrong responses=${mismatched.map(item => `${item.url} (${item.status})`).join(", ") || "none"}; missing scoped reads=${missing.join(", ") || "none"}`,
  );
  if (!pass) await page.screenshot({ path: `/tmp/e2e-dashboard-business-scope-${label.replaceAll(" ", "-")}.png`, fullPage: true }).catch(() => undefined);
}

async function main() {
  const [legal, division] = await Promise.all([
    db.select({ id: businessesTable.id, slug: businessesTable.slug, legalBusinessId: businessesTable.legalBusinessId })
      .from(businessesTable).where(eq(businessesTable.slug, "general_contracting")).limit(1).then(rows => rows[0]),
    db.select({ id: businessesTable.id, slug: businessesTable.slug, legalBusinessId: businessesTable.legalBusinessId })
      .from(businessesTable).where(eq(businessesTable.slug, "asphalt_sealing")).limit(1).then(rows => rows[0]),
  ]);
  if (!legal || !division) throw new Error("Expected legal-business and division records are required for this regression");
  const legalId = legal.legalBusinessId ?? legal.id;
  if (legalId !== legal.id || (division.legalBusinessId ?? division.id) !== legalId) {
    throw new Error("The development business fixtures do not represent the expected legal-business/division relationship");
  }

  const runTag = randomUUID().slice(0, 8).toUpperCase();
  const { kinora, markers, fixtureIds } = await createBusinessFixtures(runTag);
  const requests: CapturedRequest[] = [];
  let sessionId: string | undefined;
  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1100 });
    await page.evaluateOnNewDocument(() => {
      if (sessionStorage.getItem("dashboard-business-scope-initialized")) return;
      localStorage.setItem("buildpro_selection_mode", "unset");
      sessionStorage.setItem("dashboard-business-scope-initialized", "true");
    });
    await page.setRequestInterception(true);
    page.on("request", (request: HTTPRequest) => {
      const method = request.method().toUpperCase();
      if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
        try {
          const url = new URL(request.url());
          if (SCOPED_DATA_ROUTES.includes(url.pathname as typeof SCOPED_DATA_ROUTES[number])) {
            requests.push({ pathname: url.pathname, params: url.searchParams });
          }
          if (method === "GET" && url.pathname === "/api/dashboard/today") {
            const businessId = url.searchParams.get("businessId");
            const scheduleMarker = businessId === String(kinora.id)
              ? `${markers.kinora}-SCHEDULE`
              : businessId === String(legalId) ? `${markers.willard}-SCHEDULE` : "All-businesses schedule";
            void request.respond({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({
                ...COMPANY_ALERT_FIXTURES,
                routeStops: [{ id: -1, title: scheduleMarker, clientName: scheduleMarker, address: "Test-only route stop", status: "scheduled" }],
                followUpProspects: [],
                overdueInvoices: [],
              }),
            });
            return;
          }
          if (method === "GET" && url.pathname === "/api/estimated-tax-payments") {
            void request.respond({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ quarters: COMPANY_ALERT_FIXTURES.taxQuarters }),
            });
            return;
          }
          if (method === "GET" && url.pathname === "/api/settings") {
            void request.respond({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ taxFilingFrequency: "quarterly" }),
            });
            return;
          }
        } catch { /* Non-HTTP browser requests are irrelevant to query scope. */ }
        void request.continue();
      } else {
        blockedWrites.push(`${method} ${request.url()}`);
        void request.abort("blockedbyclient");
      }
    });

    const proof = createTestLoginProof("/");
    const loginQuery = new URLSearchParams({ returnTo: "/", ...proof });
    await page.goto(`${BASE}/api/dev-test-login?${loginQuery}`, { waitUntil: "networkidle2", timeout: 60_000 });
    sessionId = (await page.cookies()).find(cookie => cookie.name === SESSION_COOKIE)?.value;
    if (!sessionId) throw new Error("Development login did not create a session cookie");
    await waitForSelectorScreen(page);

    let startIndex = requests.length;
    await clickAllBusinesses(page);
    await waitForDashboard(page);
    await assertCompanyAlerts(page, "All Businesses");
    await assertCashFlowVisibility(page, true, "All Businesses");
    await assertScopeRequests(page, requests, startIndex, {}, "All Businesses");

    await page.click('[data-testid="business-switcher"]');
    await waitForSelectorScreen(page);
    startIndex = requests.length;
    await page.click(`[data-testid="business-select-${legal.id}"]`);
    await waitForDashboard(page);
    await assertCompanyAlerts(page, "Selected legal business");
    await assertCashFlowVisibility(page, false, "Selected legal business");
    await assertScopeRequests(
      page, requests, startIndex, { businessId: String(legalId) }, "Selected legal business after switching", true,
    );
    startIndex = requests.length;
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitForDashboard(page);
    await assertCompanyAlerts(page, "Selected legal business after reload");
    await assertCashFlowVisibility(page, false, "Selected legal business after reload");
    await assertScopeRequests(page, requests, startIndex, { businessId: String(legalId) }, "Selected legal business after reload");

    await page.click('[data-testid="business-switcher"]');
    await waitForSelectorScreen(page);
    startIndex = requests.length;
    await page.click(`[data-testid="business-select-${division.id}"]`);
    await waitForDashboard(page);
    await assertCompanyAlerts(page, "Selected division");
    await assertCashFlowVisibility(page, false, "Selected division");
    await assertScopeRequests(
      page,
      requests,
      startIndex,
      { businessId: String(legalId), businessLine: division.slug },
      "Selected division after switching",
      true,
    );
    startIndex = requests.length;
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitForDashboard(page);
    await assertCompanyAlerts(page, "Selected division after reload");
    await assertCashFlowVisibility(page, false, "Selected division after reload");
    await assertScopeRequests(
      page,
      requests,
      startIndex,
      { businessId: String(legalId), businessLine: division.slug },
      "Selected division after reload",
    );

    await page.click('[data-testid="business-switcher"]');
    await waitForSelectorScreen(page);
    startIndex = requests.length;
    await page.click(`[data-testid="business-select-${kinora.id}"]`);
    await waitForDashboard(page);
    await assertCompanyAlerts(page, "Selected Kinora");
    await assertCashFlowVisibility(page, false, "Selected Kinora");
    await assertScopeRequests(page, requests, startIndex, { businessId: String(kinora.id) }, "Selected Kinora after switching", true);
    await assertScopedDatasets(
      page,
      requests,
      { businessId: kinora.id, slug: kinora.slug, marker: markers.kinora, otherMarker: markers.willard },
      "Selected Kinora",
    );
    await page.waitForFunction(
      marker => document.body.innerText.includes(`${marker}-ACTIVE-JOB`) && !document.body.innerText.includes(`${marker.replace("KINORA", "WILLARD")}-ACTIVE-JOB`),
      { timeout: 30_000 },
      markers.kinora,
    );
    record("Kinora dashboard displays only Kinora's active job", true, `${markers.kinora}-ACTIVE-JOB`);

    await page.click('[data-testid="business-switcher"]');
    await waitForSelectorScreen(page);
    startIndex = requests.length;
    await page.click(`[data-testid="business-select-${legal.id}"]`);
    await waitForDashboard(page);
    await assertScopeRequests(page, requests, startIndex, { businessId: String(legalId) }, "Switched back to Willard after Kinora", true);
    await assertScopedDatasets(
      page,
      requests,
      { businessId: legalId, slug: legal.slug, marker: markers.willard, otherMarker: markers.kinora },
      "Switched back to Willard",
    );
    await page.waitForFunction(
      marker => document.body.innerText.includes(`${marker}-ACTIVE-JOB`) && !document.body.innerText.includes(`${marker.replace("WILLARD", "KINORA")}-ACTIVE-JOB`),
      { timeout: 30_000 },
      markers.willard,
    );
    record("Willard dashboard refreshes after switching back from Kinora", true, `${markers.willard}-ACTIVE-JOB`);

    for (const [route, label] of [["/jobs", "Jobs"], ["/expenses", "Expenses"], ["/invoices", "Invoices"]] as const) {
      await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForFunction(
        ({ marker, other }) => document.body.innerText.includes(marker) && !document.body.innerText.includes(other),
        { timeout: 30_000 },
        { marker: label === "Jobs" ? `${markers.willard}-ACTIVE-JOB` : label === "Expenses" ? `${markers.willard}-EXPENSE` : markers.willard, other: markers.kinora },
      );
      record(`Willard ${label} view excludes Kinora records`, true, `${markers.willard}; not ${markers.kinora}`);
    }

    await page.click('[data-testid="business-switcher"]');
    await waitForSelectorScreen(page);
    await page.click(`[data-testid="business-select-${kinora.id}"]`);
    await waitForDashboard(page);
    for (const [route, label] of [["/jobs", "Jobs"], ["/expenses", "Expenses"], ["/invoices", "Invoices"]] as const) {
      await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForFunction(
        ({ marker, other }) => document.body.innerText.includes(marker) && !document.body.innerText.includes(other),
        { timeout: 30_000 },
        { marker: label === "Jobs" ? `${markers.kinora}-ACTIVE-JOB` : label === "Expenses" ? `${markers.kinora}-EXPENSE` : markers.kinora, other: markers.willard },
      );
      record(`Kinora ${label} view excludes Willard records`, true, `${markers.kinora}; not ${markers.willard}`);
    }

    if (blockedWrites.length > 0) {
      record("Business-scope verification blocks browser writes", false, blockedWrites.join(", "));
    } else {
      record("Business-scope verification blocks browser writes", true, "no browser writes");
    }
  } finally {
    try {
      if (browser) await browser.close();
    } finally {
      try {
        if (sessionId) await deleteSession(sessionId);
      } finally {
        await cleanupBusinessFixtures(fixtureIds);
      }
    }
  }

  const failures = results.filter(result => !result.pass);
  if (failures.length > 0) {
    throw new Error(`Dashboard business-scope E2E failed: ${failures.map(result => result.name).join(", ")}`);
  }
  console.log(`Business-scope E2E passed (${results.length} checks)`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
