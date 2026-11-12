import { createTestLoginProof, deleteSession, SESSION_COOKIE } from "../src/lib/auth.js";
import { launchBrowser } from "../src/lib/launchBrowser.js";

const BASE = process.env.BUILDPRO_E2E_BASE_URL ?? "http://localhost:80";
if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
  throw new Error("Refusing to run Aerial Quote UI verification against a deployment.");
}

const baseUrl = new URL(BASE);
const hostname = baseUrl.hostname.replace(/^\[|\]$/g, "");
if (baseUrl.protocol !== "http:" || !["localhost", "127.0.0.1", "::1"].includes(hostname)) {
  throw new Error("Aerial Quote UI verification must use the local development preview.");
}

const browser = await launchBrowser();
let sessionId: string | undefined;
const blockedWrites: string[] = [];
const pageErrors: string[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const proof = createTestLoginProof("/aerial-quote");
  const loginUrl = new URL("/api/dev-test-login", baseUrl.origin);
  loginUrl.search = new URLSearchParams({ ...proof, returnTo: "/aerial-quote" }).toString();
  const loginResponse = await page.goto(loginUrl.toString(), { waitUntil: "networkidle2" });
  if (!loginResponse?.ok()) {
    throw new Error(`Development test login returned ${loginResponse?.status() ?? "no response"}.`);
  }
  const cookie = (await page.cookies(baseUrl.origin)).find(item => item.name === SESSION_COOKIE);
  if (!cookie?.value) throw new Error("The signed development test session was not issued.");
  sessionId = cookie.value;

  await page.setRequestInterception(true);
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("request", request => {
    const url = new URL(request.url());
    const method = request.method().toUpperCase();

    if (method === "GET" && url.pathname === "/api/aerial-quote/properties") {
      const businessId = Number(url.searchParams.get("businessId"));
      void request.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{
          id: 990001,
          businessId,
          clientId: null,
          label: "Read-only sharing fixture",
          street: "100 Test Road",
          city: "Testville",
          state: "KY",
          zip: "40000",
          notes: null,
        }]),
      });
      return;
    }
    if (method === "GET" && url.pathname === "/api/aerial-quote/properties/990001/access") {
      void request.respond({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    if (method === "GET" && url.pathname === "/api/aerial-quote/properties/990001/measurement-revisions") {
      void request.respond({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    if (method === "GET" && url.pathname === "/api/aerial-quote/pricing-profiles") {
      void request.respond({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    if (method === "GET" || method === "HEAD") {
      void request.continue();
      return;
    }
    blockedWrites.push(`${method} ${url.pathname}`);
    void request.abort("blockedbyclient");
  });

  await page.goto(new URL("/aerial-quote", baseUrl.origin).toString(), { waitUntil: "networkidle2" });
  await page.waitForFunction(() => document.body.innerText.includes("Aerial Quote"), { timeout: 30_000 });
  await page.waitForFunction(() => [...document.querySelectorAll("select")]
    .some(select => [...select.options].some(option => option.value === "990001")), { timeout: 30_000 });
  await page.select("select", "990001");
  await page.waitForFunction(() => document.body.innerText.includes("Share with another division"), { timeout: 30_000 });

  const visible = await page.evaluate(() => ({
    pageTitle: document.body.innerText.includes("Aerial Quote"),
    selectedProperty: document.body.innerText.includes("Read-only sharing fixture"),
    divisionSelector: Boolean(document.querySelector('select[aria-label="Division to share with"]')),
    permissionSelector: Boolean(document.querySelector('select[aria-label="Access permission"]')),
    shareButton: [...document.querySelectorAll("button")].some(button => button.textContent?.trim() === "Share property"),
  }));
  if (!visible.pageTitle || !visible.selectedProperty || !visible.divisionSelector
    || !visible.permissionSelector || !visible.shareButton) {
    throw new Error(`Sharing controls were incomplete: ${JSON.stringify(visible)}`);
  }
  if (blockedWrites.length) throw new Error(`Unexpected browser writes were blocked: ${blockedWrites.join(", ")}`);
  if (pageErrors.length) throw new Error(`Browser errors: ${pageErrors.join("; ")}`);
  console.log(JSON.stringify({ authenticated: true, syntheticPropertyData: true, visible, blockedWrites, pageErrors }));
} finally {
  if (sessionId) await deleteSession(sessionId);
  await browser.close();
}
