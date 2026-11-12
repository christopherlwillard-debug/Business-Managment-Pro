import { createTestLoginProof, deleteSession, SESSION_COOKIE } from "../src/lib/auth.js";
import { launchBrowser } from "../src/lib/launchBrowser.js";

const BASE = process.env.BUILDPRO_E2E_BASE_URL ?? "http://localhost:80";
const baseUrl = new URL(BASE);
if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT
  || baseUrl.protocol !== "http:" || !["localhost", "127.0.0.1", "::1"].includes(baseUrl.hostname.replace(/^\[|\]$/g, ""))) {
  throw new Error("Property-edit verification must use the local development preview.");
}

const businessId = 770010;
const propertyId = 770011;
const property = {
  id: propertyId,
  businessId,
  clientId: null,
  label: "Existing Site",
  street: "10 Old Road",
  city: "Testville",
  state: "KY",
  zip: "42301",
  notes: "Old note",
  createdAt: "2026-11-12T12:00:00.000Z",
  updatedAt: "2026-11-12T12:00:00.000Z",
  accessPermission: "manage",
};
const business = {
  id: businessId,
  name: "Property Edit Fixture",
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
let updatePayload: Record<string, unknown> | null = null;

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const proof = createTestLoginProof("/aerial-quote");
  const loginUrl = new URL("/api/dev-test-login", baseUrl.origin);
  loginUrl.search = new URLSearchParams({ ...proof, returnTo: "/aerial-quote" }).toString();
  const loginResponse = await page.goto(loginUrl.toString(), { waitUntil: "networkidle2" });
  if (!loginResponse?.ok()) throw new Error(`Development test login returned ${loginResponse?.status() ?? "no response"}.`);
  const cookie = (await page.cookies(baseUrl.origin)).find(item => item.name === SESSION_COOKIE);
  if (!cookie?.value) throw new Error("The signed development test session was not issued.");
  sessionId = cookie.value;
  await page.evaluateOnNewDocument((selection: string) => {
    localStorage.setItem("buildpro_selection_mode", selection);
  }, String(businessId));

  await page.setRequestInterception(true);
  page.on("request", request => {
    const url = new URL(request.url());
    const method = request.method().toUpperCase();
    const path = url.pathname.includes("/api/") ? url.pathname.slice(url.pathname.indexOf("/api/")) : url.pathname;
    const respond = (body: unknown, status = 200) => request.respond({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
    if (method === "GET" && path === "/api/businesses") return void respond([business]);
    if (method === "GET" && path === "/api/aerial-quote/properties") return void respond([property]);
    if (method === "GET" && path === "/api/aerial-quote/pricing-profiles") return void respond([]);
    if (method === "GET" && path === "/api/clients") return void respond([]);
    if (method === "PUT" && path === `/api/aerial-quote/properties/${propertyId}`) {
      updatePayload = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
      return void respond({ ...property, ...updatePayload, accessPermission: "manage" });
    }
    if (method === "GET" || method === "HEAD") return void request.continue();
    blockedWrites.push(`${method} ${path}`);
    return void request.abort("blockedbyclient");
  });

  await page.goto(new URL("/aerial-quote", baseUrl.origin).toString(), { waitUntil: "networkidle2" });
  await page.waitForFunction(() => document.body.innerText.includes("Manual-first estimating"), { timeout: 30_000 });
  await page.evaluate((id: number, label: string) => {
    const propertySelect = [...document.querySelectorAll("select")].find(select =>
      [...select.options].some(option => option.value === String(id)));
    if (!propertySelect) throw new Error("Saved property selector was not found.");
    propertySelect.value = String(id);
    propertySelect.dispatchEvent(new Event("change", { bubbles: true }));
  }, propertyId);
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some(button => button.textContent?.trim() === "Edit selected property"), { timeout: 30_000 });
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find(item => item.textContent?.trim() === "Edit selected property");
    (button as HTMLButtonElement | undefined)?.click();
  });
  await page.evaluate(() => {
    const input = [...document.querySelectorAll("input")].find(item => (item as HTMLInputElement).value === "Existing Site") as HTMLInputElement | undefined;
    if (!input) throw new Error("The selected property's edit form was not populated.");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, "Updated Site");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find(item => item.textContent?.trim() === "Save property changes");
    (button as HTMLButtonElement | undefined)?.click();
  });
  const deadline = Date.now() + 10_000;
  while (!updatePayload && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));

  if (!updatePayload || updatePayload.businessId !== businessId || updatePayload.label !== "Updated Site") {
    throw new Error(`Expected an update request with the edited label and business scope; received ${JSON.stringify(updatePayload)}.`);
  }
  if (blockedWrites.length) throw new Error(`Unexpected browser writes were blocked: ${blockedWrites.join(", ")}`);
  console.log(JSON.stringify({ authenticated: true, fixtureData: "synthetic", updatePayload, blockedWrites }));
} finally {
  if (sessionId) await deleteSession(sessionId);
  await browser.close();
}
