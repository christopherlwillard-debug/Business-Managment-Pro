import { createTestLoginProof, deleteSession, SESSION_COOKIE } from "../src/lib/auth";
import { launchBrowser } from "../src/lib/launchBrowser";

const BASE = "http://localhost:80";
const writes: string[] = [];

async function main() {
  if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) throw new Error("Refusing production");
  const browser = await launchBrowser();
  let sid: string | undefined;
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", request => {
      if (["GET", "HEAD", "OPTIONS"].includes(request.method().toUpperCase())) void request.continue();
      else { writes.push(`${request.method()} ${request.url()}`); void request.abort("blockedbyclient"); }
    });
    await page.evaluateOnNewDocument(() => localStorage.setItem("buildpro_selection_mode", "1"));
    const returnTo = "/jobs";
    const params = new URLSearchParams({ returnTo, ...createTestLoginProof(returnTo) });
    await page.goto(`${BASE}/api/dev-test-login?${params}`, { waitUntil: "networkidle2", timeout: 60_000 });
    sid = (await page.cookies()).find(cookie => cookie.name === SESSION_COOKIE)?.value;
    if (!sid) throw new Error("Development test session was not created");

    await page.goto(`${BASE}/jobs`, { waitUntil: "networkidle2", timeout: 60_000 });
    await page.waitForFunction(() => document.body.innerText.includes("New Job"), { timeout: 30_000 });
    const newJobButtons = await page.$$eval("button", buttons => buttons.filter(button => {
      const rect = button.getBoundingClientRect();
      return button.innerText.trim() === "New Job" && rect.width > 0 && rect.height > 0;
    }).length);
    await page.evaluate(() => [...document.querySelectorAll("button")].find(button => {
      const rect = button.getBoundingClientRect();
      return button.innerText.trim() === "New Job" && rect.width > 0 && rect.height > 0;
    })?.click());
    await page.waitForFunction(() => document.body.innerText.includes("Choose the type of work"), { timeout: 20_000 });
    const workflowChoiceSelected = await page.evaluate(() => {
      const modal = [...document.querySelectorAll("div.fixed.inset-0.z-50")]
        .find(element => element.innerText.includes("Choose the type of work"));
      const button = [...(modal?.querySelectorAll("button") ?? [])]
        .find(element => element.innerText.includes("General Contracting"));
      (button as HTMLButtonElement | undefined)?.click();
      return Boolean(button);
    });
    if (!workflowChoiceSelected) throw new Error("General Contracting workflow choice missing");
    await page.waitForFunction(() => document.body.innerText.includes("Create Job"), { timeout: 20_000 });
    const createForm = await page.$eval("body", element => element.innerText.replace(/\s+/g, " ").trim());
    const formFields = await page.$$eval("input,select,textarea", fields => fields.filter(field => {
      const rect = field.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }).map(field => ({ tag: field.tagName.toLowerCase(), name: field.getAttribute("name"), type: field.getAttribute("type"), placeholder: field.getAttribute("placeholder") })));
    const formOnlyResult = { newJobButtons, workflowChoiceOpened: true, workflowChoiceSelected, generalContractingFormVisible: createForm.includes("Create Job"), titleFieldVisible: createForm.includes("Job Title"), createActionVisible: createForm.includes("Create Job"), visibleFieldCount: formFields.length };

    await page.goto(`${BASE}/jobs`, { waitUntil: "networkidle2", timeout: 60_000 });
    const row = '[data-testid="compact-job-row-16"]';
    await page.waitForSelector(row, { timeout: 25_000 });
    await page.$eval(row, element => (element.querySelector('button[data-testid^="job-card-open-"]') as HTMLButtonElement).click());
    await page.waitForSelector('[data-testid="job-workspace-unified-16"]', { timeout: 20_000 });
    const lifecycleText = await page.$eval('[data-testid="job-workspace-unified-16"]', element => element.innerText.replace(/\s+/g, " ").trim());
    const lifecycleButtons = await page.$$eval('[data-testid="job-workspace-unified-16"] button', buttons => buttons.map(button => button.innerText.replace(/\s+/g, " ").trim()).filter(Boolean));
    const lifecycleResult = { jobId: 16, status: lifecycleText.includes("Not started") ? "Not started" : "visible status not matched", activeActionVisible: lifecycleButtons.some(text => text.includes("MARK ACTIVE")), finishActionVisible: lifecycleButtons.some(text => text.includes("FINISH JOB")), closeoutText: lifecycleText.slice(-700) };

    await page.goto(`${BASE}/jobs`, { waitUntil: "networkidle2", timeout: 60_000 });
    const payrollRow = '[data-testid="compact-job-row-188"]';
    await page.waitForSelector(payrollRow, { timeout: 25_000 });
    await page.$eval(payrollRow, element => (element.querySelector('button[data-testid^="job-card-open-"]') as HTMLButtonElement).click());
    await page.waitForSelector('[data-testid="job-workspace-overview-188"]', { timeout: 20_000 });
    await page.evaluate(() => {
      const root = document.querySelector('[data-testid="job-workspace-overview-188"]');
      [...(root?.querySelectorAll("button") ?? [])].find(button => button.textContent?.trim() === "Details")?.click();
    });
    await page.waitForSelector('[data-testid="job-financials-panel"]', { timeout: 20_000 });
    await page.click('[data-testid="job-financials-panel"] a[href="/jobs/188/payroll"]');
    await page.waitForFunction(
      () => location.pathname === "/jobs/188/payroll" && document.body.innerText.includes("PAYROLL CHECKLIST"),
      { timeout: 30_000 },
    );
    const payrollNavigationResult = await page.evaluate(() => ({
      path: location.pathname,
      payrollPageRendered: document.body.innerText.includes("PAYROLL CHECKLIST"),
      correctJobVisible: document.body.innerText.includes("E2E Mark All Paid Job 1788895593904"),
      balanceContextVisible: document.body.innerText.includes("$165.00"),
      workspaceStillOpen: !!document.querySelector('[data-testid="job-workspace-unified-188"]'),
      financialsPanelStillOpen: !!document.querySelector('[data-testid="job-financials-panel"]'),
    }));
    if (
      payrollNavigationResult.path !== "/jobs/188/payroll"
      || !payrollNavigationResult.payrollPageRendered
      || !payrollNavigationResult.correctJobVisible
      || !payrollNavigationResult.balanceContextVisible
      || payrollNavigationResult.workspaceStillOpen
      || payrollNavigationResult.financialsPanelStillOpen
    ) {
      throw new Error(`Manage & Pay navigation regression: ${JSON.stringify(payrollNavigationResult)}`);
    }

    await page.goto(`${BASE}/route-planner`, { waitUntil: "networkidle2", timeout: 60_000 });
    await page.waitForFunction(() => document.body.innerText.toLowerCase().includes("route"), { timeout: 30_000 });
    const routePlannerText = await page.$eval("body", element => element.innerText.replace(/\s+/g, " ").trim());
    if (writes.length) throw new Error(`Unexpected browser writes were blocked: ${writes.join("; ")}`);
    console.log(JSON.stringify({ formOnlyResult, lifecycleResult, payrollNavigationResult, routePlannerLoaded: routePlannerText.toLowerCase().includes("route"), routePlannerText: routePlannerText.slice(0, 1200), blockedWrites: writes.length }));
  } finally {
    if (sid) await deleteSession(sid).catch(() => undefined);
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exit(1); });
