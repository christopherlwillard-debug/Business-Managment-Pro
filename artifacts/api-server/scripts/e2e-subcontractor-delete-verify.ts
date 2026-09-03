/* Authenticated browser regression for subcontractor deletion notices.
 *
 * Run:
 *   pnpm --filter @workspace/api-server run verify:subcontractor-delete
 *
 * The development-only login route creates a short-lived session cookie. Every
 * subcontractor list and mutation request used by this script is intercepted,
 * so the verification never reads or deletes real subcontractor records.
 */
import fs from "node:fs";
import type { HTTPRequest, Page } from "puppeteer";
import { createTestLoginProof, deleteSession, SESSION_COOKIE } from "../src/lib/auth";
import { launchBrowser } from "../src/lib/launchBrowser";

const BASE = process.env.BUILDPRO_E2E_BASE_URL ?? "http://localhost:80";
const SHOTS = "/tmp/e2e-subcontractor-delete";
const FIRST_ID = 991_001;
const SECOND_ID = 991_002;

if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
  throw new Error("Refusing to run subcontractor deletion verification against a production deployment");
}

const results: Array<{ name: string; pass: boolean; detail?: string }> = [];

function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
}

function subcontractor(id: number, name: string, hasLinkedRecords: boolean) {
  return {
    id,
    name,
    email: null,
    phone: null,
    trade: "Browser test fixture",
    licenseNumber: null,
    licenseExpiry: null,
    insuranceExpiry: null,
    w9OnFile: false,
    address: null,
    notes: null,
    portalToken: null,
    portalApproved: false,
    portalPinSet: false,
    ytdPayments: 0,
    hasLinkedRecords,
    totalTrackedHours: 0,
    totalOwed: 0,
    totalPaid: 0,
    balance: 0,
    balanceSettled: false,
    payRate: null,
    payType: "hourly",
    role: "hourly",
    growthPct: 0,
  };
}

async function clickDelete(page: Page, id: number) {
  await page.waitForSelector(`[data-testid="delete-subcontractor-${id}"]`, { timeout: 15_000 });
  await page.click(`[data-testid="delete-subcontractor-${id}"]`);
  await page.waitForSelector('[data-testid="confirm-delete-subcontractor"]', { timeout: 5_000 });
  await page.click('[data-testid="confirm-delete-subcontractor"]');
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await launchBrowser();
  let page: Page | undefined;
  const remainingIds = new Set([FIRST_ID, SECOND_ID]);
  const interceptedDeletes: number[] = [];
  const unexpectedMutations: string[] = [];
  let sessionId: string | undefined;

  try {
    page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    await page.setRequestInterception(true);

    page.on("request", (request: HTTPRequest) => {
      const url = new URL(request.url());
      const method = request.method();
      const isSubcontractorApi = url.pathname === "/api/subcontractors"
        || url.pathname.startsWith("/api/subcontractors/");

      if (url.pathname === "/api/subcontractors" && method === "GET") {
        const fixtures = [
          subcontractor(FIRST_ID, "No Reassignment Fixture", false),
          subcontractor(SECOND_ID, "Reassignment Fixture", true),
        ].filter((fixture) => remainingIds.has(fixture.id));
        void request.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(fixtures),
        });
        return;
      }

      const deleteMatch = url.pathname.match(/^\/api\/subcontractors\/(\d+)$/);
      if (method === "DELETE" && deleteMatch) {
        const id = Number(deleteMatch[1]);
        if (id !== FIRST_ID && id !== SECOND_ID) {
          unexpectedMutations.push(`${method} ${url.pathname}`);
          void request.abort("blockedbyclient");
          return;
        }

        interceptedDeletes.push(id);
        remainingIds.delete(id);
        const reassignedJobs = id === SECOND_ID
          ? [
              { jobId: 41, jobTitle: "Oak Street Remodel" },
              { jobId: 63, jobTitle: null },
            ]
          : [];
        void request.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, reassignedJobs }),
        });
        return;
      }

      const isApiWrite = url.pathname.startsWith("/api/")
        && !["GET", "HEAD", "OPTIONS"].includes(method);
      if (isApiWrite) {
        unexpectedMutations.push(`${method} ${url.pathname}`);
        void request.abort("blockedbyclient");
        return;
      }

      void request.continue();
    });

    const returnTo = "/subcontractors";
    const proof = createTestLoginProof(returnTo);
    const loginParams = new URLSearchParams({ returnTo, ...proof });
    await page.goto(`${BASE}/api/dev-test-login?${loginParams}`, {
      waitUntil: "networkidle2",
      timeout: 60_000,
    });
    sessionId = (await page.cookies()).find((cookie) => cookie.name === SESSION_COOKIE)?.value;
    await page.waitForFunction(
      (name) => document.body.innerText.includes(name),
      { timeout: 30_000 },
      "No Reassignment Fixture",
    );

    const initialBody = await page.evaluate(() => document.body.innerText);
    const currentUrl = new URL(page.url());
    const isSubcontractorsRoute = currentUrl.pathname === "/subcontractors"
      || (currentUrl.pathname === "/people" && currentUrl.searchParams.get("tab") === "subcontractors");
    record(
      "Approved test session passes the BuildPro login gate",
      isSubcontractorsRoute && initialBody.includes("Subcontractors") && !initialBody.includes("Log in to continue"),
      page.url(),
    );

    await clickDelete(page, FIRST_ID);
    await page.waitForFunction(
      (name) => !document.body.innerText.includes(name),
      { timeout: 10_000 },
      "No Reassignment Fixture",
    );
    const noReassignmentBody = await page.evaluate(() => document.body.innerText);
    record(
      "No reassignment toast is shown when no reimbursements moved",
      !noReassignmentBody.includes("Mileage reimbursement reassigned"),
    );

    await clickDelete(page, SECOND_ID);
    await page.waitForFunction(
      () => document.body.innerText.includes("Mileage reimbursement reassigned to the business owner"),
      { timeout: 10_000 },
    );
    const reassignmentBody = await page.evaluate(() => document.body.innerText);
    record(
      "Reassignment toast lists titled and untitled jobs",
      reassignmentBody.includes("Subcontractor deleted")
        && reassignmentBody.includes("Oak Street Remodel")
        && reassignmentBody.includes("Job #63"),
    );

    record(
      "Both delete requests were intercepted instead of reaching the API",
      interceptedDeletes.join(",") === `${FIRST_ID},${SECOND_ID}` && unexpectedMutations.length === 0,
      unexpectedMutations.join(", "),
    );
    await page.screenshot({ path: `${SHOTS}/subcontractor-delete-toast.png` });
  } finally {
    if (sessionId) await deleteSession(sessionId).catch(() => undefined);
    await browser.close();
  }

  const failures = results.filter((result) => !result.pass);
  if (failures.length > 0) {
    process.exitCode = 1;
    console.error(`\n${failures.length} subcontractor deletion browser check(s) failed.`);
  } else {
    console.log(`\nAll ${results.length} subcontractor deletion browser checks passed.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});