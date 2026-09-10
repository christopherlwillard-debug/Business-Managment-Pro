/* Authenticated browser regression check for invoice delivery evidence.
 *
 * Run:
 *   pnpm --filter @workspace/api-server run verify:invoice-delivery
 *
 * The check creates temporary approved invoices representing confirmed Gmail
 * delivery, an unresolved pending attempt, and no delivery evidence. It drives
 * the real Invoices page, blocks every browser write, and removes all fixtures
 * and the development session in every exit path.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { and, eq, inArray } from "drizzle-orm";
import type { Page } from "puppeteer";
import { db } from "@workspace/db";
import {
  businessesTable,
  clientsTable,
  invoiceCommunicationEventsTable,
  invoicesTable,
  sessionsTable,
  settingsTable,
} from "@workspace/db/schema";
import { createTestLoginProof, SESSION_COOKIE } from "../src/lib/auth";
import { launchBrowser } from "../src/lib/launchBrowser";

const BASE = "http://localhost:80";
const SHOTS = "/tmp/e2e-invoice-delivery-shots";
// The invoice list sorts the digits in invoice numbers as a PostgreSQL
// integer. Keep the generated suffix below the 32-bit integer limit.
const FIXTURE_PREFIX = `E2E-INVOICE-DELIVERY-${Date.now() % 1_000_000}`;

if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
  throw new Error("Refusing to run invoice delivery verification against a production deployment");
}

const results: { name: string; pass: boolean; detail?: string }[] = [];

function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
}

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

type Fixture = {
  clientId: number;
  invoiceIds: number[];
  pendingInvoiceId: number;
  pendingEventId: number;
  pendingMessageId: string;
  pendingThreadId: string;
  acceptedNumber: string;
  pendingNumber: string;
  unsentNumber: string;
};

type VerificationBusiness = { id: number; slug: string };

async function createFixture(business: VerificationBusiness): Promise<Fixture> {
  const [client] = await db.insert(clientsTable).values({
    name: `${FIXTURE_PREFIX} Client`,
    email: "invoice-delivery-e2e@example.invalid",
    businessLine: business.slug,
    businessId: business.id,
  }).returning({ id: clientsTable.id });

  const numbers = {
    accepted: `${FIXTURE_PREFIX}-ACCEPTED`,
    pending: `${FIXTURE_PREFIX}-PENDING`,
    unsent: `${FIXTURE_PREFIX}-UNSENT`,
  };
  const today = new Date().toISOString().slice(0, 10);

  const invoices = await db.insert(invoicesTable).values([
    {
      invoiceNumber: numbers.accepted,
      clientId: client.id,
      status: "approved",
      issueDate: today,
      dueDate: today,
      subtotal: "125.00",
      total: "125.00",
      acceptedAt: new Date(Date.now() - 10_000),
      businessLine: business.slug,
      businessId: business.id,
      lineItems: [{ id: 1, description: "Confirmed delivery fixture", quantity: 1, unitPrice: 125, total: 125 }],
    },
    {
      invoiceNumber: numbers.pending,
      clientId: client.id,
      status: "approved",
      issueDate: today,
      dueDate: today,
      subtotal: "175.00",
      total: "175.00",
      acceptedAt: new Date(Date.now() - 9_000),
      businessLine: business.slug,
      businessId: business.id,
      lineItems: [{ id: 1, description: "Pending delivery fixture", quantity: 1, unitPrice: 175, total: 175 }],
    },
    {
      invoiceNumber: numbers.unsent,
      clientId: client.id,
      status: "approved",
      issueDate: today,
      dueDate: today,
      subtotal: "225.00",
      total: "225.00",
      businessLine: business.slug,
      businessId: business.id,
      lineItems: [{ id: 1, description: "Unsent delivery fixture", quantity: 1, unitPrice: 225, total: 225 }],
    },
  ]).returning({ id: invoicesTable.id });

  const [accepted, pending, unsent] = invoices;
  if (!accepted || !pending || !unsent) throw new Error("Unable to create invoice delivery fixtures");

  const requestedAt = new Date(Date.now() - 5_000);
  await db.insert(invoiceCommunicationEventsTable).values({
    invoiceId: accepted.id,
    businessId: business.id,
    eventType: "initial_invoice",
    channel: "gmail",
    provider: "gmail",
    status: "accepted",
    recipient: "invoice-delivery-e2e@example.invalid",
    subject: `Invoice ${numbers.accepted}`,
    requestedAt,
    completedAt: new Date(Date.now() - 4_000),
    source: "e2e-invoice-delivery-verify",
    providerMessageId: `e2e-gmail-message-${randomUUID()}`,
    providerThreadId: `e2e-gmail-thread-${randomUUID()}`,
  });
  const pendingMessageId = `e2e-gmail-message-${randomUUID()}`;
  const pendingThreadId = `e2e-gmail-thread-${randomUUID()}`;
  const [pendingEvent] = await db.insert(invoiceCommunicationEventsTable).values({
    invoiceId: pending.id,
    businessId: business.id,
    eventType: "initial_invoice",
    channel: "gmail",
    provider: "gmail",
    status: "pending",
    recipient: "invoice-delivery-e2e@example.invalid",
    subject: `Invoice ${numbers.pending}`,
    requestedAt: new Date(Date.now() - 3_000),
    source: "e2e-invoice-delivery-verify",
  }).returning({ id: invoiceCommunicationEventsTable.id });
  if (!pendingEvent) throw new Error("Unable to create pending invoice delivery event");

  return {
    clientId: client.id,
    invoiceIds: [accepted.id, pending.id, unsent.id],
    pendingInvoiceId: pending.id,
    pendingEventId: pendingEvent.id,
    pendingMessageId,
    pendingThreadId,
    acceptedNumber: numbers.accepted,
    pendingNumber: numbers.pending,
    unsentNumber: numbers.unsent,
  };
}

async function deleteFixture(fixture: Fixture) {
  await db.delete(invoiceCommunicationEventsTable)
    .where(inArray(invoiceCommunicationEventsTable.invoiceId, fixture.invoiceIds));
  await db.delete(invoicesTable).where(inArray(invoicesTable.id, fixture.invoiceIds));
  await db.delete(clientsTable).where(eq(clientsTable.id, fixture.clientId));
}

async function rowForInvoice(page: Page, invoiceNumber: string) {
  return page.evaluate(number => {
    const node = [...document.querySelectorAll("tr")]
      .find(row => (row.textContent ?? "").includes(number));
    if (!node) return null;
    const select = node.querySelector("select") as HTMLSelectElement | null;
    const renderedText = (node as HTMLElement).innerText ?? node.textContent ?? "";
    return {
      text: renderedText,
      status: select?.value
        ?? ((renderedText.match(/\b(approved|sent|overdue|partiallyPaid|paid|draft|cancelled)\b/i)?.[1] ?? null)?.toLowerCase() ?? null),
      buttons: [...node.querySelectorAll("button")].map(button => (button.textContent ?? "").trim()),
    };
  }, invoiceNumber);
}

async function openInvoice(page: Page, invoiceNumber: string) {
  const opened = await page.evaluate(number => {
    const row = [...document.querySelectorAll("tr")]
      .find(candidate => (candidate.textContent ?? "").includes(number));
    if (!row) return false;
    (row as HTMLElement).click();
    return true;
  }, invoiceNumber);
  if (!opened) throw new Error(`Could not open invoice row ${invoiceNumber}`);
  await page.waitForFunction(
    number => document.body.innerText.includes(`Invoice ${number}`),
    { timeout: 15_000 },
    invoiceNumber,
  );
  await page.waitForFunction(
    () => document.body.innerText.includes("Communication & delivery"),
    { timeout: 15_000 },
  );
  await sleep(300);
}

async function clickGmailToolbarButton(page: Page, expectedText: string) {
  return page.evaluate(text => {
    const button = [...document.querySelectorAll("button")]
      .find(candidate =>
        candidate.getAttribute("title")?.includes("Gmail")
        && (candidate.textContent ?? "").includes(text),
      );
    if (!button) return false;
    (button as HTMLButtonElement).click();
    return true;
  }, expectedText);
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const [[settings], [business]] = await Promise.all([
    db.select({ ownerUserId: settingsTable.ownerUserId }).from(settingsTable).limit(1),
    db.select({ id: businessesTable.id, slug: businessesTable.slug })
      .from(businessesTable)
      .where(eq(businessesTable.slug, "general_contracting"))
      .limit(1),
  ]);
  if (!settings?.ownerUserId) throw new Error("No configured owner available for authenticated verification");
  if (!business) throw new Error("The general_contracting development business is required for verification");

  let fixture: Fixture | undefined;
  let sessionId: string | undefined;
  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
  const unexpectedWrites: string[] = [];
  const finalizeRequests: { url: string; body: Record<string, unknown> }[] = [];
  const prohibitedInvoiceDeliveryRequests: string[] = [];

  try {
    fixture = await createFixture(business);
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    await page.setRequestInterception(true);
    page.on("request", request => {
      const method = request.method().toUpperCase();
      const url = request.url();
      if (["GET", "HEAD", "OPTIONS"].includes(method)) {
        void request.continue();
        return;
      }
      const expectedFinalizePath = `/api/invoices/${fixture!.pendingInvoiceId}/communications/${fixture!.pendingEventId}/finalize`;
      if (method === "POST" && new URL(url).pathname === expectedFinalizePath) {
        let body: Record<string, unknown> = {};
        try {
          body = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
        } catch {
          body = { parseError: true };
        }
        finalizeRequests.push({ url, body });
        void request.continue();
        return;
      }
      if (
        url.includes("/recover-gmail")
        || url.includes("/communications/prepare")
        || url.includes("googleapis.com")
        || url.includes("/api/auth/google")
      ) {
        prohibitedInvoiceDeliveryRequests.push(`${method} ${url}`);
      }
      unexpectedWrites.push(`${method} ${url}`);
      void request.abort("blockedbyclient");
    });

    // The matching durable browser checkpoint is the evidence under test.
    // The inert token keeps the existing connected-state UI assertions
    // available; request interception still proves repair never refreshes
    // authorization, searches Gmail metadata, prepares, or sends.
    await page.evaluateOnNewDocument((invoiceId, eventId, messageId, threadId) => {
      localStorage.setItem("bp_gauth_v1", JSON.stringify({
        token: "e2e-no-send-token",
        email: "invoice-delivery-e2e@example.invalid",
        expiresAt: Date.now() + 3_600_000,
      }));
      localStorage.setItem(`invoice-gmail-finalization:${invoiceId}`, JSON.stringify({
        invoiceId,
        eventId,
        providerMessageId: messageId,
        providerThreadId: threadId,
      }));
    }, fixture.pendingInvoiceId, fixture.pendingEventId, fixture.pendingMessageId, fixture.pendingThreadId);

    const returnTo = "/invoices";
    const proof = createTestLoginProof(returnTo);
    const loginParams = new URLSearchParams({ returnTo, ...proof });
    await page.goto(`${BASE}/api/dev-test-login?${loginParams}`, {
      waitUntil: "networkidle2",
      timeout: 60_000,
    });
    sessionId = (await page.cookies()).find(cookie => cookie.name === SESSION_COOKIE)?.value;
    if (!sessionId) throw new Error("Development login did not create a session cookie");

    await page.goto(`${BASE}/invoices`, { waitUntil: "networkidle2", timeout: 60_000 });
    await page.waitForFunction(
      numbers => numbers.every(number => document.body.innerText.includes(number)),
      { timeout: 30_000 },
      [fixture.acceptedNumber, fixture.pendingNumber, fixture.unsentNumber],
    );
    record(
      "Authenticated Invoices page loads all delivery fixtures",
      page.url().endsWith("/invoices")
        && !(await page.evaluate(() => /log in|sign in/i.test(document.body.innerText.slice(0, 500)))),
      page.url(),
    );

    const acceptedRow = await rowForInvoice(page, fixture.acceptedNumber);
    record(
      "Verified Gmail evidence reconciles to Sent",
      acceptedRow?.status === "sent" && !acceptedRow.buttons.includes("Send Invoice"),
      `status=${acceptedRow?.status ?? "missing"}, buttons=${acceptedRow?.buttons.join("|") ?? "missing"}`,
    );

    const pendingRow = await rowForInvoice(page, fixture.pendingNumber);
    record(
      "Pending invoice remains Approved with the initial send action",
      pendingRow?.status === "approved" && pendingRow.buttons.includes("Send Invoice"),
      `status=${pendingRow?.status ?? "missing"}, buttons=${pendingRow?.buttons.join("|") ?? "missing"}`,
    );

    const unsentRow = await rowForInvoice(page, fixture.unsentNumber);
    record(
      "Approved invoice without sent evidence offers Send Invoice",
      unsentRow?.status === "approved" && unsentRow.buttons.includes("Send Invoice"),
      `status=${unsentRow?.status ?? "missing"}, buttons=${unsentRow?.buttons.join("|") ?? "missing"}`,
    );

    await openInvoice(page, fixture.acceptedNumber);
    record(
      "Sent invoice detail offers Resend Invoice",
      await clickGmailToolbarButton(page, "Resend Invoice"),
    );
    await page.evaluate(() => {
      const close = [...document.querySelectorAll("button")]
        .find(button => !button.textContent?.trim() && button.getAttribute("class")?.includes("text-blue-400"));
      (close as HTMLButtonElement | undefined)?.click();
    });

    await page.evaluate(() => {
      const close = [...document.querySelectorAll("button")]
        .find(button => !button.textContent?.trim() && button.getAttribute("class")?.includes("text-blue-400"));
      (close as HTMLButtonElement | undefined)?.click();
    });
    await sleep(150);
    await page.goto(`${BASE}/invoices`, { waitUntil: "networkidle2", timeout: 60_000 });
    await page.waitForFunction(
      number => document.body.innerText.includes(number),
      { timeout: 15_000 },
      fixture.pendingNumber,
    );

    await openInvoice(page, fixture.pendingNumber);
    await sleep(1_000);
    await page.waitForFunction(
      () => document.body.innerText.includes("Repair delivery history"),
      { timeout: 15_000 },
    );
    const clickedRepair = await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")]
        .find(candidate => (candidate.textContent ?? "").trim() === "Repair delivery history");
      if (!button) return false;
      (button as HTMLButtonElement).click();
      return true;
    });
    await page.waitForFunction(
      () => document.body.innerText.includes("The invoice is now marked Sent."),
      { timeout: 15_000 },
    );
    record(
      "Known-message repair uses the stored browser checkpoint",
      clickedRepair
        && finalizeRequests.length === 1
        && finalizeRequests[0]?.body.status === "accepted"
        && finalizeRequests[0]?.body.providerMessageId === fixture.pendingMessageId
        && finalizeRequests[0]?.body.providerThreadId === fixture.pendingThreadId,
      JSON.stringify({ clickedRepair, finalizeRequests }),
    );
    record(
      "Known-message repair avoids Gmail permission and resend paths",
      prohibitedInvoiceDeliveryRequests.length === 0,
      prohibitedInvoiceDeliveryRequests.join(", "),
    );
    const [[repairedEvent], [repairedInvoice]] = await Promise.all([
      db.select({
        status: invoiceCommunicationEventsTable.status,
        providerMessageId: invoiceCommunicationEventsTable.providerMessageId,
      }).from(invoiceCommunicationEventsTable)
        .where(eq(invoiceCommunicationEventsTable.id, fixture.pendingEventId))
        .limit(1),
      db.select({
        status: invoicesTable.status,
        sentAt: invoicesTable.sentAt,
      }).from(invoicesTable)
        .where(eq(invoicesTable.id, fixture.pendingInvoiceId))
        .limit(1),
    ]);
    record(
      "Existing event becomes accepted and invoice becomes Sent",
      repairedEvent?.status === "accepted"
        && repairedEvent.providerMessageId === fixture.pendingMessageId
        && repairedInvoice?.status === "sent"
        && Boolean(repairedInvoice.sentAt),
      JSON.stringify({ repairedEvent, repairedInvoice }),
    );
    await page.screenshot({ path: `${SHOTS}/invoice-delivery-states.png`, fullPage: true });
    record(
      "Browser verification issued no unexpected writes",
      unexpectedWrites.length === 0,
      unexpectedWrites.join(", "),
    );
  } finally {
    if (browser) await browser.close();
    if (sessionId) await db.delete(sessionsTable).where(eq(sessionsTable.sid, sessionId));
    if (fixture) await deleteFixture(fixture);

    if (fixture) {
      const [remainingInvoices, remainingEvents, remainingClients, remainingSessions] = await Promise.all([
        db.select({ id: invoicesTable.id }).from(invoicesTable).where(inArray(invoicesTable.id, fixture.invoiceIds)),
        db.select({ id: invoiceCommunicationEventsTable.id }).from(invoiceCommunicationEventsTable)
          .where(inArray(invoiceCommunicationEventsTable.invoiceId, fixture.invoiceIds)),
        db.select({ id: clientsTable.id }).from(clientsTable).where(eq(clientsTable.id, fixture.clientId)),
        sessionId
          ? db.select({ sid: sessionsTable.sid }).from(sessionsTable).where(eq(sessionsTable.sid, sessionId))
          : Promise.resolve([]),
      ]);
      record(
        "All temporary invoices, events, client, and session are removed",
        remainingInvoices.length === 0
          && remainingEvents.length === 0
          && remainingClients.length === 0
          && remainingSessions.length === 0,
      );
    }
  }

  const failures = results.filter(result => !result.pass);
  if (failures.length > 0) {
    process.exitCode = 1;
    console.error(`\n${failures.length} invoice delivery browser check(s) failed.`);
  } else {
    console.log(`\nAll ${results.length} invoice delivery browser checks passed.`);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});