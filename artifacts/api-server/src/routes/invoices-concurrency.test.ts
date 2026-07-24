// Real-database concurrency test for POST /:id/accept
//
// Proves that the atomic UPDATE … RETURNING pattern in the /accept endpoint
// prevents two simultaneous accepts from receiving the same invoice number,
// or skipping a number between them.
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
import { invoicesTable, settingsTable } from "@workspace/db/schema";
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
