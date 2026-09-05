// Real-database concurrency tests for invoice lifecycle endpoints.
//
// Proves that database locking protects both invoice number assignment and
// browser Gmail preparation from simultaneous requests.
//
// Unlike the mock-DB unit tests in invoices.test.ts, this file does NOT mock
// @workspace/db — it connects to the real dev PostgreSQL database so that
// actual row-level locking in the settings table is exercised.
//
// What is verified:
//   1. Both requests succeed (HTTP 200).
//   2. Each invoice receives a distinct invoice number.
//   3. The two numbers are consecutive — no gap between them.
//   4. The settings counter advances by exactly 2.
//
// Cleanup: test invoices are voided (status → cancelled) after the test so
// their assigned numbers remain in the audit trail and are not reused.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { vi } from "vitest";
import request from "supertest";
import express from "express";
import { db } from "@workspace/db";
import {
  invoiceCommunicationEventsTable,
  invoicesTable,
  settingsTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";

// ── Mock only external service dependencies ───────────────────────────────────
// @workspace/db is intentionally NOT mocked so real DB operations are used.
vi.mock("../lib/square.js", () => ({
  isSquareConfigured: () => false,
  deleteSquarePaymentLink: vi.fn(),
}));
vi.mock("../lib/invoiceEmail", () => ({ sendInvoiceEmail: vi.fn() }));
vi.mock("../lib/launchBrowser.js", () => ({ launchBrowser: vi.fn() }));
vi.mock("../lib/generateChecklistPdf.js", () => ({ generateChecklistPdfBuffer: vi.fn() }));
vi.mock("../lib/generateMaterialsPdf.js", () => ({ generateMaterialsPdfBuffer: vi.fn() }));
vi.mock("../lib/objectStorage.js", () => ({ ObjectStorageService: class {} }));

// Import the real invoice router AFTER mocks are declared
const { default: invoiceRouter } = await import("./invoices");

// Minimal Express app — no auth middleware so the router is hit directly
const app = express();
app.use(express.json());
app.use("/", invoiceRouter);

// ── Test state ────────────────────────────────────────────────────────────────
let idA: number;
let idB: number;
let gmailInvoiceId: number;
let counterBefore: number;

beforeAll(async () => {
  // Record the counter so we can verify it advances by exactly 2
  const [settings] = await db.select().from(settingsTable).limit(1);
  counterBefore = settings?.invoiceNextNumber ?? 1001;

  // Create two draft invoices directly in the DB — no invoice numbers yet
  const rows = await db
    .insert(invoicesTable)
    .values([
      {
        invoiceNumber: null,
        status: "draft",
        issueDate: "2099-01-01", // far-future date makes test rows easy to identify
        subtotal: "1.00",
        taxRate: null,
        taxAmount: "0.00",
        total: "1.00",
        lineItems: [],
        attachments: [],
      },
      {
        invoiceNumber: null,
        status: "draft",
        issueDate: "2099-01-01",
        subtotal: "2.00",
        taxRate: null,
        taxAmount: "0.00",
        total: "2.00",
        lineItems: [],
        attachments: [],
      },
    ])
    .returning({ id: invoicesTable.id });

  idA = rows[0].id;
  idB = rows[1].id;

  const [gmailInvoice] = await db
    .insert(invoicesTable)
    .values({
      invoiceNumber: null,
      status: "approved",
      acceptedAt: new Date(),
      issueDate: "2099-01-01",
      subtotal: "3.00",
      taxRate: null,
      taxAmount: "0.00",
      total: "3.00",
      lineItems: [],
      attachments: [],
    })
    .returning({ id: invoicesTable.id });

  gmailInvoiceId = gmailInvoice.id;
});

afterAll(async () => {
  // Void test invoices — keeps the assigned numbers in the audit trail and
  // satisfies the unique index (numbers stay on the record, not freed for reuse)
  await db
    .update(invoicesTable)
    .set({ status: "cancelled" })
    .where(eq(invoicesTable.id, idA));
  await db
    .update(invoicesTable)
    .set({ status: "cancelled" })
    .where(eq(invoicesTable.id, idB));
  await db
    .delete(invoicesTable)
    .where(eq(invoicesTable.id, gmailInvoiceId));
});

// ─────────────────────────────────────────────────────────────────────────────
// Concurrency: two simultaneous /accept calls → unique sequential numbers
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /:id/accept — concurrent real-DB", () => {
  it("assigns unique, consecutive numbers when two accepts fire simultaneously", async () => {
    // Fire both accepts at exactly the same moment via Promise.all.
    // The row-level lock on the settings table inside the atomic UPDATE … RETURNING
    // ensures the two requests serialize through the counter — one cannot steal
    // the same value the other already claimed.
    const [resA, resB] = await Promise.all([
      request(app).post(`/${idA}/accept`).send(),
      request(app).post(`/${idB}/accept`).send(),
    ]);

    // Both requests must have succeeded
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    const numA: string = resA.body.invoiceNumber;
    const numB: string = resB.body.invoiceNumber;

    // Each invoice must have received a number
    expect(numA).toBeTruthy();
    expect(numB).toBeTruthy();

    // Numbers must be distinct — no duplicates
    expect(numA).not.toBe(numB);

    // Extract the numeric suffixes from the invoice numbers (e.g. "Wil-1037" → 1037)
    const suffixA = parseInt(numA.replace(/\D/g, ""), 10);
    const suffixB = parseInt(numB.replace(/\D/g, ""), 10);

    expect(suffixA).toBeGreaterThan(0);
    expect(suffixB).toBeGreaterThan(0);

    // The two suffixes must be consecutive — no number was skipped between them
    const [lo, hi] = [suffixA, suffixB].sort((a, b) => a - b);
    expect(hi - lo).toBe(1);

    // The counter must have advanced by exactly 2
    const [settings] = await db.select().from(settingsTable).limit(1);
    expect(settings?.invoiceNextNumber).toBe(counterBefore + 2);
  });
});

describe("browser Gmail delivery lifecycle — concurrent real-DB", () => {
  it("blocks duplicate prepares and repairs interrupted attempts without another send", async () => {
    const prepareBody = {
      eventType: "initial_invoice",
      recipient: "concurrency-test@example.com",
      subject: "Concurrency test invoice",
    };

    const [firstPrepare, secondPrepare] = await Promise.all([
      request(app)
        .post(`/${gmailInvoiceId}/communications/prepare`)
        .send(prepareBody),
      request(app)
        .post(`/${gmailInvoiceId}/communications/prepare`)
        .send(prepareBody),
    ]);

    const created = [firstPrepare, secondPrepare].find(response => response.status === 201);
    const blocked = [firstPrepare, secondPrepare].find(response => response.status === 409);

    expect(created?.body.id).toEqual(expect.any(Number));
    expect(blocked?.body.eventId).toBe(created?.body.id);

    let events = await db
      .select()
      .from(invoiceCommunicationEventsTable)
      .where(eq(invoiceCommunicationEventsTable.invoiceId, gmailInvoiceId));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ id: created?.body.id, status: "pending" });

    const retryAfterClose = await request(app)
      .post(`/${gmailInvoiceId}/communications/prepare`)
      .send(prepareBody);

    expect(retryAfterClose.status).toBe(409);
    expect(retryAfterClose.body.eventId).toBe(created?.body.id);

    const failed = await request(app)
      .post(`/${gmailInvoiceId}/communications/${created?.body.id}/finalize`)
      .send({
        status: "failed",
        errorCode: "user_confirmed_not_sent",
        errorMessage: "User checked Gmail Sent and confirmed no message was sent.",
      });

    expect(failed.status).toBe(200);
    expect(failed.body.status).toBe("failed");

    const nextPrepare = await request(app)
      .post(`/${gmailInvoiceId}/communications/prepare`)
      .send(prepareBody);

    expect(nextPrepare.status).toBe(201);
    expect(nextPrepare.body.id).not.toBe(created?.body.id);

    await db
      .update(invoiceCommunicationEventsTable)
      .set({
        status: "accepted",
        providerMessageId: "gmail-concurrency-message",
        providerThreadId: "gmail-concurrency-thread",
        metadata: { gmailEvidenceVerified: true },
        completedAt: new Date(),
      })
      .where(eq(invoiceCommunicationEventsTable.id, nextPrepare.body.id));

    const repairPrompt = await request(app)
      .post(`/${gmailInvoiceId}/communications/prepare`)
      .send(prepareBody);

    expect(repairPrompt.status).toBe(409);
    expect(repairPrompt.body).toMatchObject({
      repairRequired: true,
      eventId: nextPrepare.body.id,
      providerMessageId: "gmail-concurrency-message",
    });

    const repaired = await request(app)
      .post(`/${gmailInvoiceId}/communications/${nextPrepare.body.id}/finalize`)
      .send({
        status: "accepted",
        providerMessageId: "gmail-concurrency-message",
      });

    expect(repaired.status).toBe(200);
    expect(repaired.body.id).toBe(nextPrepare.body.id);

    const [invoice] = await db
      .select({ status: invoicesTable.status, sentMethod: invoicesTable.sentMethod })
      .from(invoicesTable)
      .where(eq(invoicesTable.id, gmailInvoiceId));
    expect(invoice).toMatchObject({ status: "sent", sentMethod: "gmail" });

    events = await db
      .select()
      .from(invoiceCommunicationEventsTable)
      .where(eq(invoiceCommunicationEventsTable.invoiceId, gmailInvoiceId));
    expect(events).toHaveLength(2);
    expect(events.map(event => event.status).sort()).toEqual(["accepted", "failed"]);
  });
});
