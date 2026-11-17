/* Development-only regression check for the Phase 2A invoice reference flow.
 *
 * This creates temporary contract-work-order, job, client, and invoice rows in
 * the development database, reads them through the real API/UI, renders a PDF,
 * and removes all fixture records in finally.
 */
import { execFileSync } from "node:child_process";
import { eq } from "drizzle-orm";
import {
  businessesTable,
  clientsTable,
  contactsTable,
  contractClientProgramsTable,
  contractWorkOrdersTable,
  db,
  invoicesTable,
  jobsTable,
} from "@workspace/db";
import { createTestLoginProof, deleteSession, SESSION_COOKIE } from "../src/lib/auth";
import { buildInvoiceEmailHtml } from "../src/lib/invoiceEmail";
import { launchBrowser } from "../src/lib/launchBrowser";

const BASE = process.env.BUILDPRO_E2E_BASE_URL ?? "http://localhost:80";
const baseUrl = new URL(BASE);
const host = baseUrl.hostname.replace(/^\[|\]$/g, "");

if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
  throw new Error("Refusing to create invoice-reference fixtures in production");
}
if (baseUrl.protocol !== "http:" || !["localhost", "127.0.0.1", "::1"].includes(host)) {
  throw new Error(`Refusing non-local invoice-reference target ${baseUrl.origin}`);
}

type Fixture = {
  businessId?: number;
  otherBusinessId?: number;
  payerClientId?: number;
  homeownerContactId?: number;
  programId?: number;
  jobId?: number;
  workOrderId?: number;
  contractInvoiceId?: number;
  ordinaryInvoiceId?: number;
  contractInvoiceNumber?: string;
  ordinaryInvoiceNumber?: string;
  externalOrderNumber?: string;
  payerName?: string;
  homeownerName?: string;
};

const results: Array<{ name: string; pass: boolean; detail?: string }> = [];
const blockedWrites: string[] = [];
function check(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
}

async function createFixture(): Promise<Fixture> {
  const fixture: Fixture = {};
  const businesses = await db.select({
    id: businessesTable.id,
    slug: businessesTable.slug,
    legalBusinessId: businessesTable.legalBusinessId,
  }).from(businessesTable);
  const business = businesses.find(row => row.slug === "general_contracting");
  if (!business) throw new Error("General Contracting business fixture is required");
  fixture.businessId = business.id;
  const otherBusiness = businesses.find(row =>
    row.id !== business.id && row.legalBusinessId !== business.legalBusinessId,
  );
  if (!otherBusiness) throw new Error("A separate business is required for isolation verification");
  fixture.otherBusinessId = otherBusiness.id;

  const shortTime = Math.floor(Date.now() / 1000) % 1_000_000;
  const suffix = `${shortTime}${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}`;
  fixture.externalOrderNumber = `SAGE-TEST-${suffix}`;
  fixture.contractInvoiceNumber = `INV-TEST-CONTRACT-${suffix}`;
  fixture.ordinaryInvoiceNumber = `INV-TEST-ORDINARY-${suffix}`;
  fixture.payerName = `E2E Contract Payer ${suffix}`;
  fixture.homeownerName = `E2E Homeowner ${suffix}`;
  const date = new Date().toISOString().slice(0, 10);

  const [payer] = await db.insert(clientsTable).values({
    name: fixture.payerName,
    email: "invoice-reference-test@example.invalid",
    businessId: business.id,
    businessLine: business.slug,
  }).returning({ id: clientsTable.id });
  if (!payer) throw new Error("Could not create payer fixture");
  fixture.payerClientId = payer.id;

  const [homeowner] = await db.insert(contactsTable).values({
    name: fixture.homeownerName,
    type: "Client",
  }).returning({ id: contactsTable.id });
  if (!homeowner) throw new Error("Could not create homeowner fixture");
  fixture.homeownerContactId = homeowner.id;

  const [program] = await db.insert(contractClientProgramsTable).values({
    businessId: business.id,
    payerClientId: payer.id,
    name: `Invoice reference test ${suffix}`,
  }).returning({ id: contractClientProgramsTable.id });
  if (!program) throw new Error("Could not create contract program fixture");
  fixture.programId = program.id;

  const [job] = await db.insert(jobsTable).values({
    title: `Invoice reference test job ${suffix}`,
    clientId: payer.id,
    businessId: business.id,
    businessLine: business.slug,
    status: "scheduled",
  }).returning({ id: jobsTable.id });
  if (!job) throw new Error("Could not create accepted-job fixture");
  fixture.jobId = job.id;

  const [workOrder] = await db.insert(contractWorkOrdersTable).values({
    businessId: business.id,
    programId: program.id,
    externalOrderNumber: fixture.externalOrderNumber,
    title: `Invoice reference work order ${suffix}`,
    homeownerContactId: homeowner.id,
    status: "accepted",
    jobId: job.id,
    acceptedAt: new Date(),
  }).returning({ id: contractWorkOrdersTable.id });
  if (!workOrder) throw new Error("Could not create accepted work-order fixture");
  fixture.workOrderId = workOrder.id;

  const invoiceValues = {
    clientId: payer.id,
    businessId: business.id,
    businessLine: business.slug,
    status: "approved",
    issueDate: date,
    subtotal: "125.00",
    taxRate: "0.00",
    taxAmount: "0.00",
    total: "125.00",
    lineItems: [{ description: "Test repair", quantity: 1, unitPrice: 125 }],
  } as const;
  const [contractInvoice] = await db.insert(invoicesTable).values({
    ...invoiceValues,
    jobId: job.id,
    invoiceNumber: fixture.contractInvoiceNumber,
  }).returning({ id: invoicesTable.id });
  if (!contractInvoice) throw new Error("Could not create contract invoice fixture");
  fixture.contractInvoiceId = contractInvoice.id;

  const [ordinaryInvoice] = await db.insert(invoicesTable).values({
    ...invoiceValues,
    jobId: null,
    invoiceNumber: fixture.ordinaryInvoiceNumber,
  }).returning({ id: invoicesTable.id });
  if (!ordinaryInvoice) throw new Error("Could not create ordinary invoice fixture");
  fixture.ordinaryInvoiceId = ordinaryInvoice.id;
  return fixture;
}

async function cleanupFixture(fixture: Fixture) {
  if (fixture.contractInvoiceId != null) {
    await db.delete(invoicesTable).where(eq(invoicesTable.id, fixture.contractInvoiceId));
  }
  if (fixture.ordinaryInvoiceId != null) {
    await db.delete(invoicesTable).where(eq(invoicesTable.id, fixture.ordinaryInvoiceId));
  }
  if (fixture.workOrderId != null) {
    await db.delete(contractWorkOrdersTable).where(eq(contractWorkOrdersTable.id, fixture.workOrderId));
  }
  if (fixture.jobId != null) await db.delete(jobsTable).where(eq(jobsTable.id, fixture.jobId));
  if (fixture.programId != null) {
    await db.delete(contractClientProgramsTable).where(eq(contractClientProgramsTable.id, fixture.programId));
  }
  if (fixture.payerClientId != null) {
    await db.delete(clientsTable).where(eq(clientsTable.id, fixture.payerClientId));
  }
  if (fixture.homeownerContactId != null) {
    await db.delete(contactsTable).where(eq(contactsTable.id, fixture.homeownerContactId));
  }
}

async function main() {
  let fixture: Fixture = {};
  let sessionId: string | undefined;
  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
  try {
    fixture = await createFixture();
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1100 });
    await page.evaluateOnNewDocument(() => localStorage.setItem("buildpro_selection_mode", "all"));
    await page.setRequestInterception(true);
    page.on("request", request => {
      const method = request.method().toUpperCase();
      if (method === "GET" || method === "HEAD" || method === "OPTIONS") return request.continue();
      blockedWrites.push(`${method} ${request.url()}`);
      return request.abort();
    });

    const proof = createTestLoginProof("/invoices");
    const login = new URL("/api/dev-test-login", BASE);
    login.searchParams.set("returnTo", "/invoices");
    login.searchParams.set("timestamp", proof.timestamp);
    login.searchParams.set("nonce", proof.nonce);
    login.searchParams.set("signature", proof.signature);
    await page.goto(login.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector('input[placeholder*="Search by client"]', { timeout: 60_000 });

    const ownDetail = await page.evaluate(async ({ id, businessId }) => {
      const response = await fetch(`/api/invoices/${id}?businessId=${businessId}`, { credentials: "include" });
      return { status: response.status, body: await response.json() };
    }, { id: fixture.contractInvoiceId!, businessId: fixture.businessId! });
    check("Invoice API returns the linked external order number", ownDetail.status === 200
      && ownDetail.body.contractExternalOrderNumber === fixture.externalOrderNumber,
    ownDetail.body.contractExternalOrderNumber ?? `HTTP ${ownDetail.status}`);
    check("Invoice remains billed to the contract payer", ownDetail.body.clientId === fixture.payerClientId
      && ownDetail.body.clientName === fixture.payerName
      && ownDetail.body.clientName !== fixture.homeownerName,
    ownDetail.body.clientName ?? "payer missing");

    const listScope = await page.evaluate(async ({ businessId, invoiceNumber }) => {
      const response = await fetch(`/api/invoices?businessId=${businessId}&includeDrafts=true`, { credentials: "include" });
      const body = await response.json().catch(() => null);
      const rows = Array.isArray(body) ? body : [];
      return {
        status: response.status,
        row: rows.find((item: any) => item.invoiceNumber === invoiceNumber) ?? null,
        bodySummary: Array.isArray(body) ? `rows=${body.length}` : JSON.stringify(body),
      };
    }, { businessId: fixture.businessId!, invoiceNumber: fixture.contractInvoiceNumber! });
    check("Invoice list API returns the linked reference", listScope.status === 200
      && listScope.row?.contractExternalOrderNumber === fixture.externalOrderNumber);
    if (!listScope.row) console.log(`Invoice list API detail: ${listScope.bodySummary}`);

    const crossBusiness = await page.evaluate(async ({ id, businessId }) => {
      const response = await fetch(`/api/invoices/${id}?businessId=${businessId}`, { credentials: "include" });
      return { status: response.status, body: await response.json().catch(() => ({})) };
    }, { id: fixture.contractInvoiceId!, businessId: fixture.otherBusinessId! });
    check("Another business cannot retrieve the invoice reference", crossBusiness.status === 404
      && crossBusiness.body.contractExternalOrderNumber == null, `HTTP ${crossBusiness.status}`);

    const search = page.locator('input[placeholder*="Search by client"]');
    await search.fill(fixture.contractInvoiceNumber!);
    const contractRowVisible = await page.waitForFunction(
      (number: string) => document.body.innerText.includes(number),
      { timeout: 30_000 },
      fixture.contractInvoiceNumber!,
    ).then(() => true).catch(() => false);
    const contractRow = await page.evaluate((number: string) => {
      const row = [...document.querySelectorAll("tr")].find(item => item.innerText.includes(number));
      return row?.innerText ?? "";
    }, fixture.contractInvoiceNumber!);
    check("Invoice list view shows the payer and external order number", contractRowVisible
      && contractRow.includes(fixture.payerName!) && contractRow.includes(fixture.externalOrderNumber!),
      contractRow.slice(0, 240));
    await page.evaluate((number: string) => {
      [...document.querySelectorAll("tr")].find(item => item.innerText.includes(number))?.click();
    }, fixture.contractInvoiceNumber!);
    await page.waitForFunction(
      (number: string) => document.body.innerText.includes(`External work order: ${number}`),
      { timeout: 30_000 },
      fixture.externalOrderNumber!,
    );
    const detail = await page.evaluate(() => ({
      text: document.body.innerText,
      billTo: (document.querySelector('input[placeholder*="Client name"]') as HTMLInputElement | null)?.value ?? "",
    }));
    check("Invoice detail view shows the external number and payer",
      detail.text.toLowerCase().includes("payer / bill to")
        && detail.text.includes(`External work order: ${fixture.externalOrderNumber}`)
        && detail.billTo === fixture.payerName
        && !detail.text.includes(fixture.homeownerName!),
      detail.text.slice(-900));

    await page.keyboard.press("Escape");
    await search.fill(fixture.ordinaryInvoiceNumber!);
    await page.waitForFunction(
      (number: string) => document.body.innerText.includes(number),
      { timeout: 30_000 },
      fixture.ordinaryInvoiceNumber!,
    );
    const ordinaryRow = await page.evaluate((number: string) => {
      const row = [...document.querySelectorAll("tr")].find(item => item.innerText.includes(number));
      return row?.innerText ?? "";
    }, fixture.ordinaryInvoiceNumber!);
    check("Ordinary invoice list omits the external reference",
      ordinaryRow.includes(fixture.ordinaryInvoiceNumber!)
        && !ordinaryRow.includes("External work order:"));
    await page.evaluate((number: string) => {
      [...document.querySelectorAll("tr")].find(item => item.innerText.includes(number))?.click();
    }, fixture.ordinaryInvoiceNumber!);
    await page.waitForFunction(
      (number: string) => document.body.innerText.includes(number),
      { timeout: 30_000 },
      fixture.ordinaryInvoiceNumber!,
    );
    const ordinaryDetail = await page.evaluate(() => document.body.innerText);
    check("Ordinary invoice detail omits the external reference",
      ordinaryDetail.toLowerCase().includes("bill to")
        && ordinaryDetail.includes(fixture.ordinaryInvoiceNumber!)
        && !ordinaryDetail.includes("External work order:"),
      ordinaryDetail.slice(-700));

    const cookies = await page.cookies(BASE);
    const session = cookies.find(cookie => cookie.name === SESSION_COOKIE);
    if (!session) throw new Error("Development test session cookie was not set");
    sessionId = session.value;
    const emailHtml = buildInvoiceEmailHtml({
      invoiceNumber: fixture.contractInvoiceNumber!,
      issueDate: new Date().toISOString().slice(0, 10),
      clientName: fixture.payerName!,
      contractExternalOrderNumber: fixture.externalOrderNumber!,
      lineItems: [{ description: "Test repair", quantity: 1, unitPrice: 125 }],
      subtotal: "125.00",
      taxRate: "0",
      taxAmount: "0",
      total: "125.00",
    }, { companyName: "BuildPro Test" });
    const pdfResponse = await fetch(new URL("/api/invoices/render-html-pdf", BASE), {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `${SESSION_COOKIE}=${session.value}` },
      body: JSON.stringify({ html: emailHtml }),
    });
    const pdfData = pdfResponse.ok ? await pdfResponse.json() : null;
    if (pdfData?.pdfBase64) {
      const text = execFileSync("pdftotext", ["-", "-"], {
        input: Buffer.from(pdfData.pdfBase64, "base64"),
        encoding: "utf8",
      });
      check("Generated invoice PDF includes the external number",
        text.includes(fixture.externalOrderNumber!));
    } else {
      check("Generated invoice PDF includes the external number", false, `HTTP ${pdfResponse.status}`);
    }
    check("Browser made no unexpected writes", blockedWrites.length === 0, blockedWrites.join(", "));
  } finally {
    try { await browser?.close(); } catch {}
    if (sessionId) await deleteSession(sessionId).catch(() => undefined);
    await cleanupFixture(fixture);
    const leftovers = await Promise.all([
      fixture.contractInvoiceId == null ? Promise.resolve([]) : db.select({ id: invoicesTable.id }).from(invoicesTable).where(eq(invoicesTable.id, fixture.contractInvoiceId)),
      fixture.ordinaryInvoiceId == null ? Promise.resolve([]) : db.select({ id: invoicesTable.id }).from(invoicesTable).where(eq(invoicesTable.id, fixture.ordinaryInvoiceId)),
      fixture.workOrderId == null ? Promise.resolve([]) : db.select({ id: contractWorkOrdersTable.id }).from(contractWorkOrdersTable).where(eq(contractWorkOrdersTable.id, fixture.workOrderId)),
      fixture.jobId == null ? Promise.resolve([]) : db.select({ id: jobsTable.id }).from(jobsTable).where(eq(jobsTable.id, fixture.jobId)),
      fixture.programId == null ? Promise.resolve([]) : db.select({ id: contractClientProgramsTable.id }).from(contractClientProgramsTable).where(eq(contractClientProgramsTable.id, fixture.programId)),
      fixture.payerClientId == null ? Promise.resolve([]) : db.select({ id: clientsTable.id }).from(clientsTable).where(eq(clientsTable.id, fixture.payerClientId)),
      fixture.homeownerContactId == null ? Promise.resolve([]) : db.select({ id: contactsTable.id }).from(contactsTable).where(eq(contactsTable.id, fixture.homeownerContactId)),
    ]);
    check("Temporary development fixtures were removed", leftovers.every(rows => rows.length === 0));
  }

  const passed = results.filter(result => result.pass).length;
  console.log(`\n${passed}/${results.length} checks passed.`);
  if (passed !== results.length) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
