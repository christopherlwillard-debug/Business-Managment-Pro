import { createTestLoginProof, deleteSession, SESSION_COOKIE } from "../src/lib/auth";
import { launchBrowser } from "../src/lib/launchBrowser";

const BASE = "http://localhost:80";
const businessId = 1;
const jobIds = [254, 16];
const unexpectedWrites: string[] = [];
const results: Record<string, unknown>[] = [];

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

async function main() {
  if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
    throw new Error("Refusing to run against production");
  }
  const browser = await launchBrowser();
  let sid: string | undefined;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1100 });
    await page.evaluateOnNewDocument(id => localStorage.setItem("buildpro_selection_mode", String(id)), businessId);
    await page.setRequestInterception(true);
    page.on("request", request => {
      if (["GET", "HEAD", "OPTIONS"].includes(request.method().toUpperCase())) void request.continue();
      else {
        unexpectedWrites.push(`${request.method()} ${request.url()}`);
        void request.abort("blockedbyclient");
      }
    });

    const returnTo = "/jobs";
    const proof = createTestLoginProof(returnTo);
    const params = new URLSearchParams({ returnTo, ...proof });
    await page.goto(`${BASE}/api/dev-test-login?${params}`, { waitUntil: "networkidle2", timeout: 60_000 });
    sid = (await page.cookies()).find(cookie => cookie.name === SESSION_COOKIE)?.value;
    if (!sid) throw new Error("Could not create the short-lived development test session");
    await page.goto(`${BASE}/jobs`, { waitUntil: "networkidle2", timeout: 60_000 });
    await page.waitForSelector('[data-testid="job-records-heading"]', { timeout: 30_000 });

    for (const jobId of jobIds) {
      if (new URL(page.url()).pathname !== "/jobs") {
        await page.goto(`${BASE}/jobs`, { waitUntil: "networkidle2", timeout: 60_000 });
      }
      if (jobId === 254) {
        await page.evaluate(() => {
          const heading = [...document.querySelectorAll("h2")].find(el => el.textContent?.trim() === "Paid");
          heading?.closest("button")?.click();
        });
      }
      await page.waitForSelector(`[data-testid="compact-job-row-${jobId}"]`, { timeout: 30_000 });
      const invoiceStatus = jobId === 254
        ? await page.$eval(`[data-testid="job-invoice-status-${jobId}"]`, el => el.textContent?.replace(/\s+/g, " ").trim() ?? "")
        : "No invoice expected in this existing record";
      let invoiceRouteReached = false;
      if (jobId === 254) {
        const invoiceAction = await page.$(`[data-testid="job-invoice-action-${jobId}"]`);
        if (!invoiceAction) throw new Error("Paid invoice has no view/navigation action");
        await invoiceAction.click();
        await page.waitForFunction(() => location.pathname === "/invoices", { timeout: 20_000 });
        invoiceRouteReached = new URL(page.url()).searchParams.has("open");
        if (!invoiceRouteReached) throw new Error("Invoice navigation did not open the existing invoice");
        await page.goto(`${BASE}/jobs`, { waitUntil: "networkidle2", timeout: 60_000 });
        await page.evaluate(() => {
          const heading = [...document.querySelectorAll("h2")].find(el => el.textContent?.trim() === "Paid");
          heading?.closest("button")?.click();
        });
        await page.waitForSelector(`[data-testid="compact-job-row-${jobId}"]`, { timeout: 30_000 });
      }
      const apiProfit = await page.evaluate(async id => {
        const response = await fetch(`/api/jobs/${id}/profit`, { credentials: "include" });
        return { status: response.status, body: await response.json() };
      }, jobId);
      if (apiProfit.status !== 200) throw new Error(`GET /api/jobs/${jobId}/profit returned ${apiProfit.status}`);
      const apiPayroll = await page.evaluate(async id => {
        const response = await fetch(`/api/jobs/${id}/sub-payments`, { credentials: "include" });
        return { status: response.status, body: await response.json() };
      }, jobId);
      if (apiPayroll.status !== 200) throw new Error(`GET /api/jobs/${jobId}/sub-payments returned ${apiPayroll.status}`);

      await page.click(`[data-testid="job-card-open-${jobId}"]`);
      await page.waitForSelector(`[data-testid="job-workspace-unified-${jobId}"]`, { timeout: 20_000 });
      const financialButton = `[data-testid="job-section-financials-${jobId}"]`;
      await page.evaluate(selector => {
        const button = document.querySelector(selector) as HTMLButtonElement | null;
        if (!button) throw new Error("Job Financials entry point is missing");
        const details = button.closest("details");
        if (details) details.open = true;
        button.click();
      }, financialButton);
      await page.waitForSelector('[data-testid="job-financials-panel"]', { timeout: 20_000 });
      const splitText = await page.$eval('[data-testid="job-financials-panel"]', el => el.textContent?.replace(/\s+/g, " ").trim() ?? "");
      const profit = apiProfit.body as { grossInvoiced: number; jobExpenses: number; subLaborCost: number; netProfit: number };
      const summaryMatches = splitText.includes(money(Number(profit.grossInvoiced)))
        && splitText.includes(money(Number(profit.netProfit)))
        && (Number(profit.jobExpenses) <= 0 || splitText.includes(money(Number(profit.jobExpenses))))
        && (Number(profit.subLaborCost) <= 0 || splitText.includes(money(Number(profit.subLaborCost))));

      await page.evaluate(() => {
        [...document.querySelectorAll("button")].find(button => button.textContent?.trim() === "Sub Hours")?.click();
      });
      const hoursText = await page.$eval('[data-testid="job-financials-panel"]', el => el.textContent?.replace(/\s+/g, " ").trim() ?? "");
      const paymentHistoryVisible = jobId !== 254 || splitText.includes("Sub Payment Records");
      const managePaySelector = `[data-testid="job-financials-panel"] a[href="/jobs/${jobId}/payroll"]`;
      const managePayHref = await page.$eval(managePaySelector, el => (el as HTMLAnchorElement).getAttribute("href")).catch(() => null);

      if (jobId === 16) {
        if (!hoursText.includes("8.0 hrs total")) throw new Error("Expected existing 8-hour entry is not visible in Sub Hours");
        if (!managePayHref) throw new Error("Manage & Pay link is missing from the unified workspace");
        await page.click(managePaySelector);
        await page.waitForFunction(() => location.pathname.endsWith("/payroll"), { timeout: 20_000 });
        await page.waitForFunction(() => {
          const heading = document.querySelector("h1")?.textContent?.trim() ?? "";
          return heading !== "" && !heading.includes("Loading");
        }, { timeout: 30_000 });
        const payrollText = await page.$eval("body", el => el.textContent?.replace(/\s+/g, " ").trim() ?? "");
        results.push({
          jobId,
          invoiceStatus,
          profitApi: {
            revenue: Number(profit.grossInvoiced),
            expenses: Number(profit.jobExpenses),
            labor: Number(profit.subLaborCost),
            netProfit: Number(profit.netProfit),
          },
          profitSplitMatchedApi: summaryMatches,
          subHoursTabOpened: hoursText.includes("Sub Hours"),
          loggedHoursVisible: hoursText.includes("8.0 hrs total"),
          paymentHistoryVisible: /payment history/i.test(payrollText),
          managePayHref,
          managePayReached: true,
          advanceInterfaceReachable: /advancement/i.test(payrollText),
        });
      }

      if (jobId === 254) results.push({
        jobId,
        invoiceStatus,
        profitApi: {
          revenue: Number(profit.grossInvoiced),
          expenses: Number(profit.jobExpenses),
          labor: Number(profit.subLaborCost),
          netProfit: Number(profit.netProfit),
        },
        payrollRows: Array.isArray(apiPayroll.body) ? apiPayroll.body.length : null,
        profitSplitMatchedApi: summaryMatches,
        subHoursTabOpened: hoursText.includes("Sub Hours"),
        loggedHoursVisible: hoursText.includes("No hours logged yet"),
        paymentHistoryVisible,
        managePayHref,
        invoiceRouteReached,
      });
    }
    if (unexpectedWrites.length) throw new Error(`Blocked unexpected writes: ${unexpectedWrites.join("; ")}`);
    console.log(JSON.stringify({ results, unexpectedWrites: 0 }));
  } finally {
    if (sid) await deleteSession(sid).catch(() => undefined);
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
