/* Authenticated browser regression for mileage route lookup recovery.
 *
 * Run:
 *   pnpm --filter @workspace/api-server run verify:mileage-route-recovery
 *
 * The development-only login creates a short-lived approved session. All
 * mileage reads and the expected manual-trip write are intercepted, while
 * address and routing requests are deliberately returned empty, failed, or held in-flight.
 * No real mileage records are read or written by this check.
 */
import fs from "node:fs";
import type { HTTPRequest, Page } from "puppeteer";
import { createTestLoginProof, deleteSession, SESSION_COOKIE } from "../src/lib/auth.js";
import { launchBrowser } from "../src/lib/launchBrowser.js";

const BASE = process.env.BUILDPRO_E2E_BASE_URL ?? "http://localhost:80";
const SHOTS = "/tmp/e2e-mileage-route-recovery";
const BUSINESS_ID = 991_210;
const JOB_ID = 992_106;

if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
  throw new Error("Refusing to run mileage route recovery verification against a production deployment");
}

const results: Array<{ name: string; pass: boolean; detail?: string }> = [];

function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
}

const businessFixture = {
  id: BUSINESS_ID,
  name: "Mileage Recovery Fixture",
  slug: "mileage-recovery-fixture",
  type: "general_contracting",
  logoUrl: null,
  address: null,
  city: null,
  state: null,
  zip: null,
  phone: null,
  email: null,
  licenseNumber: null,
  taxId: null,
  sortOrder: 0,
  enabledFeatures: null,
  parentBusinessId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const permissionsFixture = {
  expenses: { view: true, edit: true },
  jobs: { view: true, edit: true },
  invoices: { view: true, edit: true },
  clients: { view: true, edit: true },
  mileage: { view: true, edit: true },
  subcontractors: { view: true, edit: true },
  daily_logs: { view: true, edit: true },
  estimates: { view: true, edit: true },
  compliance: { view: true, edit: true },
};

const settingsFixture = {
  mileageUnits: "miles",
  mileageDefaultClassification: "business",
  mileageReminderFrequency: "never",
  mileageRate: "0.725",
};

const jobFixture = {
  id: JOB_ID,
  title: "Route Recovery Fixture Job",
  status: "scheduled",
};

const summaryFixture = {
  totalMiles: 0,
  businessMiles: 0,
  personalMiles: 0,
  totalDeduction: 0,
  ratePerMile: 0.725,
  ratePeriods: [],
  tripCount: 0,
};

const savedTripFixture = {
  id: 993_210,
  date: "2026-08-21",
  miles: 14.2,
  classification: "business",
  startLocation: "100 Main St, Owensboro KY",
  endLocation: "200 Oak Ave, Owensboro KY",
  purpose: "Deliver materials to the Oak Street job",
  jobId: JOB_ID,
  businessId: BUSINESS_ID,
  deductionAmount: 10.295,
  calculatedDeduction: 10.295,
};

async function waitForText(page: Page, text: string) {
  await page.waitForFunction(
    expected => document.body.innerText.includes(expected),
    { timeout: 15_000 },
    text,
  );
}

async function readForm(page: Page) {
  return page.evaluate(() => {
    return {
      date: document.querySelector<HTMLInputElement>('[data-testid="mileage-date"]')?.value ?? "",
      miles: document.querySelector<HTMLInputElement>('[data-testid="mileage-miles"]')?.value ?? "",
      start: document.querySelector<HTMLInputElement>('[data-testid="mileage-start-address"]')?.value ?? "",
      end: document.querySelector<HTMLInputElement>('[data-testid="mileage-end-address"]')?.value ?? "",
      purpose: document.querySelector<HTMLInputElement>('[data-testid="mileage-purpose"]')?.value ?? "",
      classification: document.querySelector<HTMLElement>('[data-testid="mileage-business"]')?.className ?? "",
      job: document.querySelector<HTMLSelectElement>('[data-testid="mileage-job"]')?.value ?? "",
      hasConfirmation: Boolean(document.querySelector('[data-testid="mileage-route-confirmation"]')),
    };
  });
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });

  let emptyAddressResultsRemaining = 0;
  let addressFailuresRemaining = 1;
  let routingFailuresRemaining = 0;
  let holdNextRoute = false;
  let heldRouteRequest: HTTPRequest | null = null;
  let resolveHeldRoute: (() => void) | null = null;
  let savedRequestBody: Record<string, unknown> | null = null;
  const unexpectedMutations: string[] = [];
  let sessionId: string | undefined;

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1200 });
    await page.setRequestInterception(true);
    page.on("request", request => {
      const url = new URL(request.url());
      const method = request.method();

      if (url.hostname === "nominatim.openstreetmap.org" && url.pathname === "/search") {
        if (emptyAddressResultsRemaining > 0) {
          emptyAddressResultsRemaining -= 1;
          void request.respond({
            status: 200,
            contentType: "application/json",
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify([]),
          });
        } else if (addressFailuresRemaining > 0) {
          addressFailuresRemaining -= 1;
          void request.respond({
            status: 503,
            contentType: "application/json",
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ error: "forced address lookup failure" }),
          });
        } else {
          void request.respond({
            status: 200,
            contentType: "application/json",
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify([{ lat: "37.7749", lon: "-87.1112" }]),
          });
        }
        return;
      }

      if (url.hostname === "router.project-osrm.org" && url.pathname.startsWith("/route/v1/driving/")) {
        if (holdNextRoute) {
          holdNextRoute = false;
          heldRouteRequest = request;
          resolveHeldRoute?.();
          return;
        }
        if (routingFailuresRemaining > 0) {
          routingFailuresRemaining -= 1;
          void request.respond({
            status: 503,
            contentType: "application/json",
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ code: "ServiceUnavailable" }),
          });
        } else {
          void request.respond({
            status: 200,
            contentType: "application/json",
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ code: "Ok", routes: [{ distance: 22_852 }] }),
          });
        }
        return;
      }

      if (url.pathname === "/api/auth/me" && method === "GET") {
        void request.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            isOwner: true,
            accessStatus: "owner",
            permissions: permissionsFixture,
            companyName: "Mileage Recovery Fixture",
            logoUrl: null,
            userName: "Mileage Test User",
            profileImageUrl: null,
          }),
        });
        return;
      }

      if (url.pathname === "/api/businesses" && method === "GET") {
        void request.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([businessFixture]),
        });
        return;
      }

      if (url.pathname === "/api/mileage" && method === "GET") {
        void request.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
        return;
      }

      if (url.pathname === "/api/mileage/summary" && method === "GET") {
        void request.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(summaryFixture),
        });
        return;
      }

      if (url.pathname === "/api/mileage/imports" && method === "GET") {
        void request.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
        return;
      }

      if (url.pathname === "/api/jobs" && method === "GET") {
        void request.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([jobFixture]),
        });
        return;
      }

      if (url.pathname === "/api/settings" && method === "GET") {
        void request.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(settingsFixture),
        });
        return;
      }

      if (url.pathname === "/api/mileage" && method === "POST") {
        savedRequestBody = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
        void request.respond({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(savedTripFixture),
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

    const returnTo = "/mileage";
    const proof = createTestLoginProof(returnTo);
    const loginParams = new URLSearchParams({ returnTo, ...proof });
    await page.goto(`${BASE}/api/dev-test-login?${loginParams}`, {
      waitUntil: "networkidle2",
      timeout: 60_000,
    });
    sessionId = (await page.cookies()).find(cookie => cookie.name === SESSION_COOKIE)?.value;
    await page.waitForSelector('[data-testid="mileage-calculate"]', { timeout: 30_000 });

    await page.$eval('[data-testid="mileage-date"]', (input, value) => {
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      nativeSetter?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, "2026-08-21");
    await page.type('[data-testid="mileage-start-address"]', "100 Main St, Owensboro KY");
    await page.type('[data-testid="mileage-end-address"]', "200 Oak Ave, Owensboro KY");
    await page.type('[data-testid="mileage-purpose"]', "Deliver materials to the Oak Street job");
    await page.click('[data-testid="mileage-business"]');
    await page.select('[data-testid="mileage-job"]', String(JOB_ID));

    const expectedForm = {
      date: "2026-08-21",
      start: "100 Main St, Owensboro KY",
      end: "200 Oak Ave, Owensboro KY",
      purpose: "Deliver materials to the Oak Street job",
      job: String(JOB_ID),
    };

    await page.click('[data-testid="mileage-calculate"]');
    await page.waitForSelector('[data-testid="mileage-route-error"]', { timeout: 15_000 });
    const addressFailure = await readForm(page);
    record(
      "Address lookup failure explains the problem and preserves trip details",
      await page.$eval('[data-testid="mileage-route-error"]', element => element.textContent ?? "")
        .then(text => text.includes("Geocoding service unavailable"))
        && addressFailure.date === expectedForm.date
        && addressFailure.start === expectedForm.start
        && addressFailure.end === expectedForm.end
        && addressFailure.purpose === expectedForm.purpose
        && addressFailure.job === expectedForm.job
        && !addressFailure.hasConfirmation,
      JSON.stringify(addressFailure),
    );
    record(
      "Address failure offers retry and manual miles actions",
      await page.$('[data-testid="mileage-route-retry"]') !== null
        && await page.$('[data-testid="mileage-enter-manually"]') !== null,
    );

    await page.click('[data-testid="mileage-route-retry"]');
    await page.waitForSelector('[data-testid="mileage-route-confirmation"]', { timeout: 15_000 });
    record(
      "Address lookup can be retried without losing the route confirmation",
      await page.$eval('[data-testid="mileage-route-confirmation"]', element => element.textContent?.includes("14.2 mi via driving route") ?? false),
    );

    emptyAddressResultsRemaining = 1;
    await page.click('[data-testid="mileage-start-address"]');
    await page.keyboard.down("Control");
    await page.keyboard.press("A");
    await page.keyboard.up("Control");
    await page.keyboard.type("Vague address");
    await page.click('[data-testid="mileage-calculate"]');
    await page.waitForSelector('[data-testid="mileage-route-error"]', { timeout: 15_000 });
    const emptyAddressResult = await readForm(page);
    const emptyAddressErrorText = await page.$eval(
      '[data-testid="mileage-route-error"]',
      element => element.textContent ?? "",
    );
    record(
      "Empty address results explain that the address was not found and preserve trip details",
      emptyAddressErrorText.includes('Address not found: "Vague address"')
        && emptyAddressErrorText.includes("Try adding a city or state")
        && emptyAddressResult.date === expectedForm.date
        && emptyAddressResult.start === "Vague address"
        && emptyAddressResult.end === expectedForm.end
        && emptyAddressResult.purpose === expectedForm.purpose
        && emptyAddressResult.classification.includes("border-primary")
        && emptyAddressResult.job === expectedForm.job
        && !emptyAddressResult.hasConfirmation,
      JSON.stringify(emptyAddressResult),
    );
    record(
      "Empty address results offer retry and manual miles actions",
      await page.$('[data-testid="mileage-route-retry"]') !== null
        && await page.$('[data-testid="mileage-enter-manually"]') !== null,
    );
    await page.click('[data-testid="mileage-enter-manually"]');
    record(
      "Empty address results can focus manual miles without changing the form",
      await page.evaluate(() => document.activeElement?.getAttribute("data-testid") === "mileage-miles"),
    );

    await page.click('[data-testid="mileage-start-address"]');
    await page.keyboard.down("Control");
    await page.keyboard.press("A");
    await page.keyboard.up("Control");
    await page.keyboard.type(expectedForm.start);
    await page.click('[data-testid="mileage-calculate"]');
    await page.waitForSelector('[data-testid="mileage-route-confirmation"]', { timeout: 15_000 });
    record(
      "A not-found address can be corrected and retried without losing the route confirmation",
      await page.$eval('[data-testid="mileage-route-confirmation"]', element => element.textContent?.includes("14.2 mi via driving route") ?? false),
    );

    const staleRouteReady = new Promise<void>(resolve => { resolveHeldRoute = resolve; });
    holdNextRoute = true;
    await page.click('[data-testid="mileage-calculate"]');
    await staleRouteReady;
    await page.click('[data-testid="mileage-start-address"]');
    await page.keyboard.down("Control");
    await page.keyboard.press("A");
    await page.keyboard.up("Control");
    await page.keyboard.type("100 Main St, Owensboro KY (stale)");
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="mileage-route-confirmation"]')
        && document.querySelector<HTMLButtonElement>('[data-testid="mileage-calculate"]')?.disabled === false,
      { timeout: 5_000 },
    );
    await page.click('[data-testid="mileage-start-address"]');
    await page.keyboard.down("Control");
    await page.keyboard.press("A");
    await page.keyboard.up("Control");
    await page.keyboard.type("100 Main St, Owensboro KY");
    await heldRouteRequest?.respond({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ code: "Ok", routes: [{ distance: 22_852 }] }),
    });
    await new Promise(resolve => setTimeout(resolve, 250));
    const staleResult = await readForm(page);
    record(
      "Stale in-flight route results cannot restore the confirmation badge",
      !staleResult.hasConfirmation && staleResult.miles === "14.2" && staleResult.start === expectedForm.start,
      JSON.stringify(staleResult),
    );

    routingFailuresRemaining = 1;
    await page.click('[data-testid="mileage-calculate"]');
    await page.waitForSelector('[data-testid="mileage-route-error"]', { timeout: 15_000 });
    const routingFailure = await readForm(page);
    const routingErrorText = await page.$eval('[data-testid="mileage-route-error"]', element => element.textContent ?? "");
    record(
      "Routing failure explains the problem and removes route confirmation",
      routingErrorText.includes("Routing service unavailable")
        && !routingFailure.hasConfirmation
        && routingFailure.date === expectedForm.date
        && routingFailure.start === expectedForm.start
        && routingFailure.end === expectedForm.end
        && routingFailure.purpose === expectedForm.purpose
        && routingFailure.job === expectedForm.job,
      JSON.stringify(routingFailure),
    );
    record(
      "Routing failure also offers retry and manual miles actions",
      await page.$('[data-testid="mileage-route-retry"]') !== null
        && await page.$('[data-testid="mileage-enter-manually"]') !== null,
    );

    await page.click('[data-testid="mileage-enter-manually"]');
    record(
      "Manual miles action focuses the Miles field",
      await page.evaluate(() => document.activeElement?.getAttribute("data-testid") === "mileage-miles"),
    );
    await page.type('[data-testid="mileage-miles"]', "14.2");
    await page.click('[data-testid="mileage-save"]');
    await page.waitForFunction(
      () => document.body.innerText.includes("Trip saved!"),
      { timeout: 15_000 },
    );
    record(
      "Manual miles can be saved after routing failure with the original trip details",
      savedRequestBody?.date === expectedForm.date
        && savedRequestBody?.miles === 14.2
        && savedRequestBody?.startLocation === expectedForm.start
        && savedRequestBody?.endLocation === expectedForm.end
        && savedRequestBody?.purpose === expectedForm.purpose
        && savedRequestBody?.classification === "business"
        && savedRequestBody?.jobId === JOB_ID,
      JSON.stringify(savedRequestBody),
    );
    record(
      "Recovery browser check did not send unexpected API writes",
      unexpectedMutations.length === 0,
      unexpectedMutations.join(", "),
    );

    await page.screenshot({ path: `${SHOTS}/mileage-route-recovery.png`, fullPage: true });
  } finally {
    if (sessionId) await deleteSession(sessionId).catch(() => undefined);
    await browser.close();
  }

  const failures = results.filter(result => !result.pass);
  if (failures.length > 0) {
    process.exitCode = 1;
    console.error(`\n${failures.length} mileage route recovery browser check(s) failed.`);
  } else {
    console.log(`\nAll ${results.length} mileage route recovery browser checks passed.`);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});