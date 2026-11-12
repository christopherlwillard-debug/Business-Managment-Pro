import { createTestLoginProof, deleteSession, SESSION_COOKIE } from "../src/lib/auth.js";
import { launchBrowser } from "../src/lib/launchBrowser.js";

const BASE = process.env.BUILDPRO_E2E_BASE_URL ?? "http://localhost:80";
if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
  throw new Error("Refusing to run Client Profile verification against a deployment.");
}

const baseUrl = new URL(BASE);
const hostname = baseUrl.hostname.replace(/^\[|\]$/g, "");
if (baseUrl.protocol !== "http:" || !["localhost", "127.0.0.1", "::1"].includes(hostname)) {
  throw new Error("Client Profile verification must use the local development preview.");
}

const clientId = 770001;
const businessId = 770010;
const propertyId = 770002;
const revisionId = 770003;
const profileId = 770004;
const estimateId = 770005;
const client = {
  id: clientId,
  name: "Client Profile Test Fixture",
  email: "fixture@example.invalid",
  phone: "555-0100",
  address: "100 Example Road",
  city: "Testville",
  state: "KY",
  zip: "40000",
  notes: null,
  nextServiceDate: null,
  serviceIntervalMonths: null,
  businessLine: "general_contracting",
  businessId,
  squareCustomerId: null,
  createdAt: "2026-11-12T12:00:00.000Z",
  outstandingBalance: 0,
  hasOverdueInvoice: false,
  openInvoiceCount: 0,
};
const profile = {
  client,
  jobs: [],
  invoices: [],
  squarePayments: [],
  linkedProspects: [],
  routeStops: [],
  otherIncome: [],
  summary: {
    totalJobs: 0,
    totalInvoices: 0,
    paidInvoices: 0,
    totalRevenueCents: 0,
    squareRevenueCents: 0,
    otherRevenueCents: 0,
    paidInvoicesTotal: 0,
    upcomingStops: 0,
  },
};
const property = {
  id: propertyId,
  businessId: 0,
  clientId,
  label: "Test Warehouse",
  street: "200 Industrial Road",
  city: "Testville",
  state: "KY",
  zip: "40000",
  notes: null,
  createdAt: "2026-11-12T12:00:00.000Z",
};
const revision = {
  id: revisionId,
  propertyId,
  revision: 3,
  source: "manual",
  entries: [{ label: "Parking lot", category: "Parking", kind: "area", quantity: 12000, unit: "sq_ft" }],
  notes: null,
  createdAt: "2026-11-12T12:00:00.000Z",
};
const pricingProfile = {
  id: profileId,
  businessId: 0,
  serviceKey: "snow_removal",
  version: 2,
  displayName: "Snow removal",
  rules: {},
  createdAt: "2026-11-12T12:00:00.000Z",
};
const business = {
  id: businessId,
  name: "Client Profile Test Business",
  slug: "general_contracting",
  type: "contractor",
  logoUrl: null,
  invoiceLogoLayout: null,
  address: null,
  city: null,
  state: null,
  zip: null,
  phone: null,
  email: null,
  website: null,
  defaultQuoteTerms: null,
  defaultQuoteValidityDays: 30,
  licenseNumber: null,
  taxId: null,
  sortOrder: 0,
  enabledFeatures: [],
  parentBusinessId: null,
  legalBusinessId: businessId,
  createdAt: "2026-11-12T12:00:00.000Z",
};

const browser = await launchBrowser();
let sessionId: string | undefined;
const blockedWrites: string[] = [];
const pageErrors: string[] = [];
const calculationRequests: Record<string, unknown>[] = [];
const estimateRequests: Record<string, unknown>[] = [];
const seenApiRequests: string[] = [];
const responseNotes: string[] = [];

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const proof = createTestLoginProof("/clients");
  const loginUrl = new URL("/api/dev-test-login", baseUrl.origin);
  loginUrl.search = new URLSearchParams({ ...proof, returnTo: "/clients" }).toString();
  const loginResponse = await page.goto(loginUrl.toString(), { waitUntil: "networkidle2" });
  if (!loginResponse?.ok()) throw new Error(`Development test login returned ${loginResponse?.status() ?? "no response"}.`);
  const cookie = (await page.cookies(baseUrl.origin)).find(item => item.name === SESSION_COOKIE);
  if (!cookie?.value) throw new Error("The signed development test session was not issued.");
  sessionId = cookie.value;
  await page.evaluateOnNewDocument((selection: string) => {
    localStorage.setItem("buildpro_selection_mode", selection);
  }, String(businessId));

  await page.setRequestInterception(true);
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("response", async response => {
    const url = new URL(response.url());
    if (url.pathname.includes("/api/clients")) {
      responseNotes.push(`${response.status()} ${url.pathname} ${((await response.text().catch(() => ""))).slice(0, 200)}`);
    }
  });
  page.on("request", request => {
    const url = new URL(request.url());
    const method = request.method().toUpperCase();
    const apiPath = url.pathname.includes("/api/")
      ? url.pathname.slice(url.pathname.indexOf("/api/"))
      : url.pathname;
    if (apiPath.startsWith("/api/")) seenApiRequests.push(`${method} ${apiPath}`);
    const respond = (body: unknown, status = 200) => request.respond({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });

    if (method === "GET" && apiPath === "/api/clients") {
      void respond([client]);
      return;
    }
    if (method === "GET" && apiPath === "/api/businesses") {
      void respond([business]);
      return;
    }
    if (method === "GET" && apiPath === `/api/clients/${clientId}/profile`) {
      void respond(profile);
      return;
    }
    if (method === "GET" && apiPath === "/api/aerial-quote/properties") {
      const businessId = Number(url.searchParams.get("businessId"));
      property.businessId = businessId;
      pricingProfile.businessId = businessId;
      void respond([property]);
      return;
    }
    if (method === "GET" && apiPath === `/api/aerial-quote/properties/${propertyId}/measurement-revisions`) {
      void respond([revision]);
      return;
    }
    if (method === "GET" && apiPath === "/api/aerial-quote/pricing-profiles") {
      void respond([pricingProfile]);
      return;
    }
    if (method === "GET" && apiPath === "/api/estimates") {
      void respond([]);
      return;
    }
    if (method === "POST" && apiPath === "/api/aerial-quote/calculate") {
      calculationRequests.push(JSON.parse(request.postData() ?? "{}") as Record<string, unknown>);
      void respond({
        serviceKey: "snow_removal",
        profileVersion: 2,
        lineItems: [{
          id: 1,
          category: "Snow",
          description: "Parking lot clearing",
          quantity: 12000,
          unit: "sq_ft",
          unitCost: 0.12,
          total: 1440,
        }],
        subtotal: 1440,
        calculationSnapshot: { profileVersion: 2 },
      });
      return;
    }
    if (method === "POST" && apiPath === "/api/aerial-quote/estimates") {
      estimateRequests.push(JSON.parse(request.postData() ?? "{}") as Record<string, unknown>);
      void respond({
        id: estimateId,
        title: "Snow removal — Test Warehouse",
        clientId,
        propertyId,
        status: "draft",
        subtotal: 1440,
        total: 1440,
        workAddress: "200 Industrial Road, Testville, KY, 40000",
        lineItems: [],
        createdAt: "2026-11-12T12:00:00.000Z",
      }, 201);
      return;
    }
    if (method === "GET" || method === "HEAD") {
      void request.continue();
      return;
    }
    blockedWrites.push(`${method} ${apiPath}`);
    void request.abort("blockedbyclient");
  });

  await page.goto(new URL("/people?tab=clients", baseUrl.origin).toString(), { waitUntil: "networkidle2" });
  try {
    await page.waitForFunction(() => document.body.innerText.includes("Client Profile Test Fixture"), { timeout: 30_000 });
  } catch {
    const body = await page.evaluate(() => document.body.innerText.slice(0, 1400));
    throw new Error(`Client fixture did not render. Page: ${body}; API requests: ${seenApiRequests.join(", ")}; responses: ${responseNotes.join(" | ")}`);
  }
  await page.evaluate((fixtureName: string) => {
    const name = [...document.querySelectorAll("h3, span")].find(item => item.textContent?.trim() === fixtureName);
    const card = name?.closest('[class*="cursor-pointer"]');
    if (!card) throw new Error("Client card was not found.");
    (card as HTMLElement).click();
  }, client.name);

  await page.waitForFunction(() => [...document.querySelectorAll("button")].some(button => button.textContent?.trim() === "Properties"), { timeout: 30_000 });
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find(item => item.textContent?.trim() === "Properties");
    (button as HTMLButtonElement | undefined)?.click();
  });
  await page.waitForFunction(() => document.body.innerText.includes("Properties & Measurements"), { timeout: 30_000 });
  await page.waitForFunction(() => document.body.innerText.includes("Test Warehouse"), { timeout: 30_000 });
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find(item => item.textContent?.includes("Test Warehouse"));
    (button as HTMLButtonElement | undefined)?.click();
  });
  await page.waitForFunction(() => document.body.innerText.includes("Parking lot: 12,000 sq ft"), { timeout: 30_000 });
  await page.select("select", String(profileId));
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find(item => item.textContent?.trim() === "Calculate");
    (button as HTMLButtonElement | undefined)?.click();
  });
  await page.waitForFunction(() => document.body.innerText.includes("Calculated estimate"), { timeout: 30_000 });
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find(item => item.textContent?.trim() === "Create draft estimate");
    (button as HTMLButtonElement | undefined)?.click();
  });
  const createDeadline = Date.now() + 10_000;
  while (estimateRequests.length === 0 && Date.now() < createDeadline) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  if (calculationRequests.length !== 1 || estimateRequests.length !== 1) {
    throw new Error(`Expected one calculation and one estimate request; got ${calculationRequests.length} and ${estimateRequests.length}.`);
  }
  const expectedInputs = {
    businessId: Number(property.businessId),
    propertyId,
    measurementRevisionId: revisionId,
    serviceKey: "snow_removal",
    profileVersion: 2,
  };
  for (const [key, value] of Object.entries(expectedInputs)) {
    if (calculationRequests[0]?.[key] !== value || estimateRequests[0]?.[key] !== value) {
      throw new Error(`The ${key} input did not match the selected property, measurement, and profile.`);
    }
  }
  if (estimateRequests[0]?.clientId !== clientId || estimateRequests[0]?.title !== "Snow removal — Test Warehouse") {
    throw new Error("The estimate request did not keep the client and property context.");
  }
  if (blockedWrites.length) throw new Error(`Unexpected browser writes were blocked: ${blockedWrites.join(", ")}`);
  if (pageErrors.length) throw new Error(`Browser errors: ${pageErrors.join("; ")}`);

  console.log(JSON.stringify({
    authenticated: true,
    fixtureData: "synthetic",
    calculationRequests: calculationRequests.length,
    estimateRequests: estimateRequests.length,
    blockedWrites,
    pageErrors,
  }));
} finally {
  if (sessionId) await deleteSession(sessionId);
  await browser.close();
}
