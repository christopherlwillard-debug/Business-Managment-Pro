import fs from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer";
import { createTestLoginProof, deleteSession, SESSION_COOKIE } from "../src/lib/auth.js";

const previewUrl = process.env.PHASE3_PREVIEW_URL;
if (!previewUrl || process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
  throw new Error("Run this verifier only against an explicit development preview URL.");
}
const origin = new URL(previewUrl).origin;
if (!/\.replit\.dev$/.test(new URL(origin).hostname) && !["localhost", "127.0.0.1"].includes(new URL(origin).hostname)) {
  throw new Error("The authenticated review target must be a development preview.");
}

const outputDir = path.resolve("../../generated-artifacts/phase3-review");
await fs.mkdir(outputDir, { recursive: true });
const quoteEstimate = {
  id: 991001,
  clientId: 991002,
  clientName: "Example Test Customer",
  title: "Phase 3 Review — Kitchen Update",
  status: "won",
  businessId: 1,
  businessLine: "general_contracting",
  jobType: "Kitchen update",
  workAddress: "100 Example Test Way",
  lineItems: [{ category: "Labor", description: "Install cabinets", quantity: 1, unit: "lot", unitCost: 1250.5 }],
  subtotal: 1250.5,
  total: 1250.5,
  createdAt: "2026-11-10T12:00:00.000Z",
  depositPaidAt: null,
  depositPaidAmount: null,
};
const quoteItem = {
  estimateId: quoteEstimate.id,
  businessId: 1,
  title: quoteEstimate.title,
  clientName: quoteEstimate.clientName,
  total: 1250.5,
  jobId: null,
  revisionSnapshotId: 991003,
  revision: 1,
  documentStatus: "viewed",
  decision: "approved",
  decisionMethod: "online",
  decisionAt: "2026-11-11T12:00:00.000Z",
  decisionContact: "Example Test Customer",
  authorizationStatus: "not_authorized",
  workAddress: quoteEstimate.workAddress,
  terms: "Deposit due before work starts.",
  acceptedScope: [{ description: "Install cabinets", quantity: 1, unit: "lot", amount: 1250.5 }],
  nextFollowUpAt: null,
  nextFollowUpEventId: null,
  nextFollowUpSource: null,
  followUpDue: false,
};

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
let sid: string | undefined;
try {
  const proof = createTestLoginProof("/estimates");
  const loginUrl = new URL("/api/dev-test-login", origin);
  loginUrl.search = new URLSearchParams({ ...proof, returnTo: "/estimates" }).toString();
  const loginPage = await browser.newPage();
  const loginResponse = await loginPage.goto(loginUrl.toString(), { waitUntil: "networkidle2" });
  if (!loginResponse?.ok()) throw new Error(`Development test login returned ${loginResponse?.status() ?? "no response"}.`);
  const sessionCookie = (await loginPage.cookies(origin)).find(cookie => cookie.name === SESSION_COOKIE);
  if (!sessionCookie?.value) throw new Error("The development test session cookie was not issued.");
  sid = sessionCookie.value;

  async function capture(viewport: { width: number; height: number }, fileName: string, includeModal = false) {
    const page = await browser.newPage({ viewport });
    const unexpectedWrites: string[] = [];
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.setRequestInterception(true);
    page.on("request", request => {
      const url = new URL(request.url());
      const method = request.method().toUpperCase();
      if (url.pathname === "/api/estimates/quote-center") {
        void request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({
          items: [quoteItem],
          summary: {
            totalQuotes: 1, draftCount: 0, awaitingCount: 0, viewedCount: 0,
            acceptedCount: 1, authorizedCount: 0, declinedCount: 0, expiredCount: 0,
            followUpsDueCount: 0, archivedCount: 0,
            potentialValue: 0, acceptedValue: 1250.5, authorizedValue: 0, convertedValue: 0,
          },
        }) });
        return;
      }
      if (url.pathname === "/api/estimates") {
        void request.respond({ status: 200, contentType: "application/json", body: JSON.stringify([quoteEstimate]) });
        return;
      }
      if (url.pathname === "/api/clients") {
        void request.respond({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
        return;
      }
      if (method === "GET" || method === "HEAD") {
        void request.continue();
        return;
      }
      unexpectedWrites.push(`${method} ${url.pathname}`);
      void request.abort("blockedbyclient");
    });
    await page.goto(new URL("/estimates", origin).toString(), { waitUntil: "networkidle2" });
    await page.waitForFunction(() => document.body.innerText.includes("Quote Center"), { timeout: 30000 });
    if (includeModal) {
      await page.waitForSelector("button", { timeout: 30000 });
      await page.evaluate(() => {
        const button = [...document.querySelectorAll("button")].find(item => item.textContent?.trim() === "Authorize");
        button?.click();
      });
      await page.waitForFunction(() => document.body.innerText.includes("Review the accepted revision before authorizing work."));
      await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        if (!dialog || !dialog.textContent?.includes("Example Test Customer")
          || !dialog.textContent.includes("100 Example Test Way")
          || !dialog.textContent.includes("Install cabinets")
          || !dialog.textContent.includes("1,250.50")) {
          throw new Error("Authorization review is missing accepted quote details.");
        }
      });
    }
    await page.screenshot({ path: path.join(outputDir, fileName), fullPage: true });
    const title = await page.title();
    const visible = await page.evaluate(() => document.body.innerText.slice(0, 3000));
    if (unexpectedWrites.length) throw new Error(`Unexpected browser writes: ${unexpectedWrites.join(", ")}`);
    if (pageErrors.length) throw new Error(`Browser errors: ${pageErrors.join("; ")}`);
    await page.close();
    return { title, visibleText: visible, unexpectedWrites, pageErrors };
  }

  async function capturePublicApproval() {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
    const unexpectedWrites: string[] = [];
    const pageErrors: string[] = [];
    const token = "z".repeat(43);
    const publicQuote = {
      quoteNumber: "991001",
      revision: 1,
      title: "Phase 3 Review — Kitchen Update",
      issuedAt: "2026-11-10T12:00:00.000Z",
      expiresAt: null,
      customerName: "Example Test Customer",
      workAddress: "100 Example Test Way",
      jobType: "Kitchen update",
      terms: "Deposit due before work starts.",
      items: [{ description: "Install cabinets", quantity: 1, unit: "lot", amount: 1250.5 }],
      subtotal: 1250.5,
      adjustment: 0,
      tax: 0,
      total: 1250.5,
      brand: {
        name: "Example Test Business",
        address: "1 Test Street",
        city: "Test City",
        state: "KY",
        zip: "40000",
        phone: null,
        email: null,
        website: null,
      },
      logoUrl: null,
      response: null,
    };
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.setRequestInterception(true);
    page.on("request", request => {
      const url = new URL(request.url());
      const method = request.method().toUpperCase();
      if (url.pathname === `/api/public/quotes/${token}` && method === "GET") {
        void request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(publicQuote) });
        return;
      }
      if (method === "GET" || method === "HEAD") {
        void request.continue();
        return;
      }
      unexpectedWrites.push(`${method} ${url.pathname}`);
      void request.abort("blockedbyclient");
    });
    await page.goto(new URL(`/quote/${token}`, origin).toString(), { waitUntil: "networkidle2" });
    await page.waitForFunction(() => document.body.innerText.includes("What would you like to do?"));
    await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find(item => item.textContent?.trim() === "Approve quote");
      button?.click();
    });
    await page.waitForFunction(() => document.body.innerText.includes("Approve this quote?")
      && document.body.innerText.includes("Confirm response")
      && document.body.innerText.includes("It does not authorize work."));
    await page.screenshot({ path: path.join(outputDir, "public-quote-approval.png"), fullPage: true });
    if (unexpectedWrites.length) throw new Error(`Unexpected public quote writes: ${unexpectedWrites.join(", ")}`);
    if (pageErrors.length) throw new Error(`Public quote browser errors: ${pageErrors.join("; ")}`);
    const visible = await page.evaluate(() => document.body.innerText.slice(0, 2000));
    await page.close();
    return { visibleText: visible, unexpectedWrites, pageErrors };
  }

  const desktop = await capture({ width: 1440, height: 1000 }, "quote-center-desktop.png", true);
  const mobile = await capture({ width: 402, height: 874 }, "quote-center-mobile.png");
  const publicApproval = await capturePublicApproval();
  console.log(JSON.stringify({ authenticated: true, fixtureData: "synthetic only", desktop, mobile, publicApproval, screenshots: [
    "generated-artifacts/phase3-review/quote-center-desktop.png",
    "generated-artifacts/phase3-review/quote-center-mobile.png",
    "generated-artifacts/phase3-review/public-quote-approval.png",
  ] }));
} finally {
  if (sid) await deleteSession(sid);
  await browser.close();
}
