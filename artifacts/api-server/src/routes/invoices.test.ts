// Integration tests for invoice state-transition endpoints (Task #1127).
//
// These pin the lifecycle rules that guard the contractor billing workflow:
//   draft → approved (POST /accept)   — assigns invoice number
//   approved → sent  (POST /mark-sent)
//   sent → paid etc  (PATCH /status)  — VALID_TRANSITIONS enforced
//   sent → partiallyPaid → paid       (POST /record-payment) — amountPaid accumulates
//
// The DB layer is fully mocked so no database connection is required.
// Each test pushes expected results onto a shared queue that the mock drains
// in the order the route handler issues selects/limits.
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// ── Hoisted mutable state — must be declared before vi.mock calls ─────────────
const h = vi.hoisted(() => ({
  // Queue of result arrays. Each .where() / .limit() call shifts one off.
  selectQueue: [] as any[][],
  // Record of every .set(data) call (for asserting what was written to DB).
  updates: [] as any[],
  // Controls whether isSquareConfigured() returns true in a given test.
  squareConfigured: false,
}));

// ── Mock @workspace/db ────────────────────────────────────────────────────────
// Returns a fluent chain; .where() and .limit() pop the next result off the queue.
vi.mock("@workspace/db", () => {
  const chain: any = {
    from:      () => chain,
    leftJoin:  () => chain,
    orderBy:   () => chain,
    inArray:   () => chain,
    where:     () => Promise.resolve(h.selectQueue.shift() ?? []),
    limit:     () => Promise.resolve(h.selectQueue.shift() ?? []),
  };
  const dbOps = {
    select:  () => chain,
    update:  () => ({
      set: (data: any) => {
        h.updates.push(data);
        return { where: () => Promise.resolve() };
      },
    }),
    insert:  () => ({
      values: () => ({
        returning: () => Promise.resolve([{ id: 42 }]),
      }),
    }),
    execute: () => Promise.resolve(),
    delete:  () => ({ where: () => Promise.resolve() }),
  };
  return {
    db: {
      ...dbOps,
      transaction: async (callback: (tx: any) => Promise<any>) => callback(dbOps),
    },
  };
});

// ── Mock external dependencies so routes load without real infra ──────────────
vi.mock("../lib/square.js", () => ({
  isSquareConfigured:      () => h.squareConfigured,
  deleteSquarePaymentLink: vi.fn(),
}));
vi.mock("../lib/invoiceEmail", () => ({
  sendInvoiceEmail: vi.fn(),
}));
vi.mock("../lib/launchBrowser.js",          () => ({ launchBrowser:              vi.fn() }));
vi.mock("../lib/generateChecklistPdf.js",   () => ({ generateChecklistPdfBuffer: vi.fn() }));
vi.mock("../lib/generateMaterialsPdf.js",   () => ({ generateMaterialsPdfBuffer: vi.fn() }));

// ── Import router + helpers AFTER mocks are hoisted ───────────────────────────
const mod = await import("./invoices");
const invoiceRouter = mod.default;
const { calcInvoice } = mod;

// Grab the spy handle for deleteSquarePaymentLink from the module mock.
const squareMod = await import("../lib/square.js");
const deleteSquarePaymentLink = vi.mocked(squareMod.deleteSquarePaymentLink);

// ── Mount in a minimal Express app ───────────────────────────────────────────
const app = express();
app.use(express.json());
app.use("/", invoiceRouter);

// ── Helpers ───────────────────────────────────────────────────────────────────
function fakeInvoice(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    id: 42,
    invoiceNumber: "INV-1001",
    clientId: null,
    jobId: null,
    status: "approved",
    issueDate: "2026-07-10",
    dueDate: null,
    subtotal: "1000.00",
    taxRate: null,
    taxAmount: "0.00",
    total: "1000.00",
    amountPaid: null,
    lastManualPaidAt: null,
    lineItems: [],
    attachments: [],
    notes: null,
    terms: null,
    locationName: null,
    city: null,
    state: null,
    businessLine: null,
    stripePaymentLinkId: null,
    stripePaymentLinkUrl: null,
    stripePaymentIntentId: null,
    stripePaidAt: null,
    squarePaymentLinkId: null,
    squarePaymentLinkUrl: null,
    squarePaidAt: null,
    payToken: null,
    remindersSentAt: [],
    acceptedAt: null,
    sentAt: null,
    sentMethod: null,
    createdAt: new Date(),
    clientName: null,
    clientEmail: null,
    clientAddress: null,
    clientPhone: null,
    clientCity: null,
    clientState: null,
    clientZip: null,
    clientNotes: null,
    jobTitle: null,
    jobCity: null,
    jobState: null,
    ...overrides,
  };
}

// ── Reset mock state between tests ────────────────────────────────────────────
beforeEach(() => {
  h.selectQueue.length = 0;
  h.updates.length = 0;
  h.squareConfigured = false;
  deleteSquarePaymentLink.mockClear();
});

// ─────────────────────────────────────────────────────────────────────────────
// validateLineItems — exported helper unit tests
// ─────────────────────────────────────────────────────────────────────────────
const { validateLineItems } = mod;

describe("validateLineItems", () => {
  it("returns null for a valid array of line items", () => {
    expect(validateLineItems([
      { description: "Labor", quantity: 2, unitPrice: 75 },
    ])).toBeNull();
  });

  it("returns null for an empty array (no line items)", () => {
    expect(validateLineItems([])).toBeNull();
  });

  it("returns null when unitPrice is 0 (free line item)", () => {
    expect(validateLineItems([
      { description: "Free service", quantity: 1, unitPrice: 0 },
    ])).toBeNull();
  });

  it("returns an error string when description is missing", () => {
    const err = validateLineItems([{ description: "", quantity: 1, unitPrice: 50 }]);
    expect(err).toMatch(/description/i);
  });

  it("returns an error string when quantity is 0", () => {
    const err = validateLineItems([{ description: "Labor", quantity: 0, unitPrice: 50 }]);
    expect(err).toMatch(/quantity/i);
  });

  it("returns an error string when quantity is negative", () => {
    const err = validateLineItems([{ description: "Labor", quantity: -1, unitPrice: 50 }]);
    expect(err).toMatch(/quantity/i);
  });

  it("returns an error string when unitPrice is negative", () => {
    const err = validateLineItems([{ description: "Labor", quantity: 1, unitPrice: -5 }]);
    expect(err).toMatch(/unit price/i);
  });

  it("returns an error string when quantity is not a number", () => {
    const err = validateLineItems([{ description: "Labor", quantity: "two", unitPrice: 50 }]);
    expect(err).toMatch(/number/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST / — line item validation on create
// ─────────────────────────────────────────────────────────────────────────────
describe("POST / — line item validation", () => {
  it("creates a draft invoice when line items are valid", async () => {
    // buildInvoiceQuery().where() after insert
    h.selectQueue.push([fakeInvoice({ status: "draft", invoiceNumber: null })]);

    const res = await request(app).post("/").send({
      issueDate: "2026-07-10",
      lineItems: [{ description: "Sealing", quantity: 1, unitPrice: 500 }],
    });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("draft");
  });

  it("creates a draft invoice when lineItems is omitted (defaults to empty)", async () => {
    h.selectQueue.push([fakeInvoice({ status: "draft", invoiceNumber: null })]);

    const res = await request(app).post("/").send({ issueDate: "2026-07-10" });

    expect(res.status).toBe(201);
  });

  it("returns 400 when a line item has no description", async () => {
    const res = await request(app).post("/").send({
      issueDate: "2026-07-10",
      lineItems: [{ description: "", quantity: 1, unitPrice: 100 }],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/description/i);
  });

  it("returns 400 when a line item has quantity = 0", async () => {
    const res = await request(app).post("/").send({
      issueDate: "2026-07-10",
      lineItems: [{ description: "Labor", quantity: 0, unitPrice: 100 }],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/quantity/i);
  });

  it("returns 400 when a line item has a negative unit price", async () => {
    const res = await request(app).post("/").send({
      issueDate: "2026-07-10",
      lineItems: [{ description: "Labor", quantity: 1, unitPrice: -10 }],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unit price/i);
  });

  it("returns 400 when quantity is a string instead of a number", async () => {
    const res = await request(app).post("/").send({
      issueDate: "2026-07-10",
      lineItems: [{ description: "Labor", quantity: "lots", unitPrice: 50 }],
    });

    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /:id — line item validation on update
// ─────────────────────────────────────────────────────────────────────────────
describe("PUT /:id — line item validation", () => {
  it("updates the invoice when line items are valid", async () => {
    h.selectQueue.push(
      [{ status: "draft", invoiceNumber: null }],   // voided guard check
      [fakeInvoice({ status: "draft" })],            // buildInvoiceQuery after update
    );

    const res = await request(app).put("/42").send({
      issueDate: "2026-07-10",
      lineItems: [{ description: "Materials", quantity: 3, unitPrice: 200 }],
    });

    expect(res.status).toBe(200);
  });

  it("returns 400 when a line item has no description", async () => {
    h.selectQueue.push([{ status: "draft", invoiceNumber: null }]);

    const res = await request(app).put("/42").send({
      issueDate: "2026-07-10",
      lineItems: [{ description: "", quantity: 2, unitPrice: 100 }],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/description/i);
  });

  it("returns 400 when a line item quantity is negative", async () => {
    h.selectQueue.push([{ status: "draft", invoiceNumber: null }]);

    const res = await request(app).put("/42").send({
      issueDate: "2026-07-10",
      lineItems: [{ description: "Labor", quantity: -5, unitPrice: 100 }],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/quantity/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calcInvoice — pure function unit tests
// ─────────────────────────────────────────────────────────────────────────────
describe("calcInvoice", () => {
  it("sums line items with no tax", () => {
    const r = calcInvoice([
      { quantity: 2, unitPrice: 150 },
      { quantity: 1, unitPrice: 200 },
    ], null);
    expect(r.subtotal).toBe(500);
    expect(r.taxAmount).toBe(0);
    expect(r.total).toBe(500);
  });

  it("applies tax rate correctly", () => {
    const r = calcInvoice([{ quantity: 1, unitPrice: 1000 }], 10);
    expect(r.subtotal).toBe(1000);
    expect(r.taxAmount).toBeCloseTo(100);
    expect(r.total).toBeCloseTo(1100);
  });

  it("returns zeros for empty line items", () => {
    const r = calcInvoice([], null);
    expect(r.subtotal).toBe(0);
    expect(r.total).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /:id/accept — draft → approved
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /:id/accept", () => {
  it("transitions a draft invoice to approved and assigns an invoice number", async () => {
    // Inside the transaction:
    // 1) tx.select status check (invoicesTable .where)
    // 2) tx.select settings (settingsTable .limit)
    // After transaction:
    // 3) buildInvoiceQuery .where
    h.selectQueue.push(
      [{ status: "draft", invoiceNumber: null }],
      [{ id: 1, invoicePrefix: "INV-", invoiceNextNumber: 1001 }],
      [fakeInvoice({ status: "approved", invoiceNumber: "INV-1001" })],
    );

    const res = await request(app).post("/42/accept").send();

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("approved");
    expect(res.body.invoiceNumber).toBe("INV-1001");

    // verify status update was written
    const statusUpdate = h.updates.find((u: any) => u.status === "approved");
    expect(statusUpdate).toBeTruthy();
    expect(statusUpdate.acceptedAt).toBeInstanceOf(Date);
  });

  it("returns 400 when invoice is already approved (not a draft)", async () => {
    h.selectQueue.push([{ status: "approved", invoiceNumber: "INV-1001" }]);

    const res = await request(app).post("/42/accept").send();

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/draft/i);
  });

  it("returns 400 when invoice is sent", async () => {
    h.selectQueue.push([{ status: "sent", invoiceNumber: "INV-1001" }]);

    const res = await request(app).post("/42/accept").send();

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/draft/i);
  });

  it("returns 404 when invoice does not exist", async () => {
    h.selectQueue.push([]); // empty result = not found

    const res = await request(app).post("/99/accept").send();

    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /:id/mark-sent — approved → sent
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /:id/mark-sent", () => {
  it("transitions an approved invoice to sent", async () => {
    h.selectQueue.push(
      [{ status: "approved" }],
      [fakeInvoice({ status: "sent", invoiceNumber: "INV-1001" })],
    );

    const res = await request(app).post("/42/mark-sent").send();

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("sent");

    const update = h.updates.find((u: any) => u.status === "sent");
    expect(update).toBeTruthy();
    expect(update.sentMethod).toBe("manual");
    expect(update.sentAt).toBeInstanceOf(Date);
  });

  it("allows re-marking an already-sent invoice as sent (idempotent)", async () => {
    h.selectQueue.push(
      [{ status: "sent" }],
      [fakeInvoice({ status: "sent" })],
    );

    const res = await request(app).post("/42/mark-sent").send();

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("sent");
  });

  it("returns 400 when invoice is still a draft", async () => {
    h.selectQueue.push([{ status: "draft" }]);

    const res = await request(app).post("/42/mark-sent").send();

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/approved or sent/i);
  });

  it("returns 400 when invoice is paid", async () => {
    h.selectQueue.push([{ status: "paid" }]);

    const res = await request(app).post("/42/mark-sent").send();

    expect(res.status).toBe(400);
  });

  it("returns 404 when invoice does not exist", async () => {
    h.selectQueue.push([]);

    const res = await request(app).post("/99/mark-sent").send();

    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /:id/status — VALID_TRANSITIONS enforcement
// ─────────────────────────────────────────────────────────────────────────────
describe("PATCH /:id/status", () => {
  it("allows sent → paid", async () => {
    h.selectQueue.push(
      [{ status: "sent", invoiceNumber: "INV-1001" }],
      [fakeInvoice({ status: "paid" })],
    );

    const res = await request(app).patch("/42/status").send({ status: "paid" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("paid");
    const update = h.updates.find((u: any) => u.status === "paid");
    expect(update).toBeTruthy();
  });

  it("allows sent → overdue", async () => {
    h.selectQueue.push(
      [{ status: "sent", invoiceNumber: "INV-1001" }],
      [fakeInvoice({ status: "overdue" })],
    );

    const res = await request(app).patch("/42/status").send({ status: "overdue" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("overdue");
  });

  it("allows sent → partiallyPaid", async () => {
    h.selectQueue.push(
      [{ status: "sent", invoiceNumber: "INV-1001" }],
      [fakeInvoice({ status: "partiallyPaid", amountPaid: "500.00" })],
    );

    const res = await request(app).patch("/42/status").send({ status: "partiallyPaid" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("partiallyPaid");
  });

  it("allows approved → cancelled", async () => {
    h.selectQueue.push(
      [{ status: "approved", invoiceNumber: "INV-1001" }],
      [fakeInvoice({ status: "cancelled" })],
    );

    const res = await request(app).patch("/42/status").send({ status: "cancelled" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("cancelled");
  });

  it("blocks approved → paid (invalid transition)", async () => {
    h.selectQueue.push([{ status: "approved", invoiceNumber: "INV-1001" }]);

    const res = await request(app).patch("/42/status").send({ status: "paid" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid transition/i);
  });

  it("blocks paid → sent (terminal status — no transitions allowed)", async () => {
    h.selectQueue.push([{ status: "paid", invoiceNumber: "INV-1001" }]);

    const res = await request(app).patch("/42/status").send({ status: "sent" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid transition/i);
  });

  it("blocks modification of a cancelled (voided) invoice", async () => {
    h.selectQueue.push([{ status: "cancelled", invoiceNumber: "INV-1001" }]);

    const res = await request(app).patch("/42/status").send({ status: "sent" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/voided/i);
  });

  it("returns 404 when invoice does not exist", async () => {
    h.selectQueue.push([]);

    const res = await request(app).patch("/99/status").send({ status: "paid" });

    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /:id/record-payment — partial payment tracking
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /:id/record-payment", () => {
  it("records a partial payment and advances status to partiallyPaid", async () => {
    h.selectQueue.push(
      [{ status: "sent", total: "1000.00", amountPaid: null }],
      [fakeInvoice({ status: "partiallyPaid", amountPaid: "300.00" })],
    );

    const res = await request(app)
      .post("/42/record-payment")
      .send({ amount: 300, paidAt: "2026-07-10" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("partiallyPaid");

    const update = h.updates.find((u: any) => u.status === "partiallyPaid");
    expect(update).toBeTruthy();
    expect(parseFloat(update.amountPaid)).toBeCloseTo(300);
    expect(update.lastManualPaidAt).toBeInstanceOf(Date);
  });

  it("accumulates amountPaid on top of an existing partial payment", async () => {
    h.selectQueue.push(
      [{ status: "partiallyPaid", total: "1000.00", amountPaid: "300.00" }],
      [fakeInvoice({ status: "partiallyPaid", amountPaid: "600.00" })],
    );

    const res = await request(app)
      .post("/42/record-payment")
      .send({ amount: 300, paidAt: "2026-07-11" });

    expect(res.status).toBe(200);
    const update = h.updates.find((u: any) => u.status === "partiallyPaid");
    expect(parseFloat(update.amountPaid)).toBeCloseTo(600);
  });

  it("auto-advances to paid when cumulative amount covers the total", async () => {
    h.selectQueue.push(
      [{ status: "partiallyPaid", total: "1000.00", amountPaid: "700.00" }],
      [fakeInvoice({ status: "paid", amountPaid: "1000.00" })],
    );

    const res = await request(app)
      .post("/42/record-payment")
      .send({ amount: 300, paidAt: "2026-07-12" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("paid");

    const update = h.updates.find((u: any) => u.status === "paid");
    expect(parseFloat(update.amountPaid)).toBeCloseTo(1000); // capped at total
  });

  it("caps amountPaid at the invoice total (no overpayment)", async () => {
    h.selectQueue.push(
      [{ status: "sent", total: "500.00", amountPaid: null }],
      [fakeInvoice({ status: "paid", amountPaid: "500.00" })],
    );

    await request(app)
      .post("/42/record-payment")
      .send({ amount: 9999, paidAt: "2026-07-10" });

    const update = h.updates.find((u: any) => u.status === "paid");
    expect(parseFloat(update.amountPaid)).toBe(500); // capped at total
  });

  it("persists the payment date from the request body", async () => {
    h.selectQueue.push(
      [{ status: "sent", total: "1000.00", amountPaid: null }],
      [fakeInvoice({ status: "partiallyPaid" })],
    );

    await request(app)
      .post("/42/record-payment")
      .send({ amount: 100, paidAt: "2026-06-15" });

    const update = h.updates.find((u: any) => u.lastManualPaidAt);
    expect(update).toBeTruthy();
    // Date should be on or around 2026-06-15
    const d = update.lastManualPaidAt as Date;
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(5); // June (0-indexed)
    expect(d.getUTCDate()).toBe(15);
  });

  it("returns 400 for a zero or negative amount", async () => {
    const res = await request(app)
      .post("/42/record-payment")
      .send({ amount: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/positive/i);
  });

  it("returns 400 for a missing amount", async () => {
    const res = await request(app)
      .post("/42/record-payment")
      .send({});

    expect(res.status).toBe(400);
  });

  it("returns 400 when recording payment on a draft invoice", async () => {
    h.selectQueue.push([{ status: "draft", total: "1000.00", amountPaid: null }]);

    const res = await request(app)
      .post("/42/record-payment")
      .send({ amount: 100 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/draft/i);
  });

  it("returns 400 when recording payment on a cancelled invoice", async () => {
    h.selectQueue.push([{ status: "cancelled", total: "1000.00", amountPaid: null }]);

    const res = await request(app)
      .post("/42/record-payment")
      .send({ amount: 100 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cancelled/i);
  });

  it("returns 404 when invoice does not exist", async () => {
    h.selectQueue.push([]);

    const res = await request(app)
      .post("/99/record-payment")
      .send({ amount: 100 });

    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /:id/revert-to-draft — approved/sent with no payments → draft
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /:id/revert-to-draft", () => {
  it("reverts an approved invoice to draft, clears number/sentAt/acceptedAt", async () => {
    // transaction: 1) status check, 2) settings (for counter check), 3) buildInvoiceQuery after update
    h.selectQueue.push(
      [{ status: "approved", invoiceNumber: "INV-1001", amountPaid: null }],
      [{ id: 1, invoicePrefix: "INV-", invoiceNextNumber: 1002 }],
      [fakeInvoice({ status: "draft", invoiceNumber: null, sentAt: null, acceptedAt: null })],
    );

    const res = await request(app).post("/42/revert-to-draft").send();

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("draft");
    expect(res.body.invoiceNumber).toBeNull();

    const update = h.updates.find((u: any) => u.status === "draft");
    expect(update).toBeTruthy();
    expect(update.invoiceNumber).toBeNull();
    expect(update.sentAt).toBeNull();
    expect(update.acceptedAt).toBeNull();
    expect(update.sentMethod).toBeNull();
  });

  it("decrements the counter when reverting the most recently issued number", async () => {
    // INV-1001 is counter-1 (counter = 1002) → decrement to 1001
    h.selectQueue.push(
      [{ status: "sent", invoiceNumber: "INV-1001", amountPaid: null }],
      [{ id: 1, invoicePrefix: "INV-", invoiceNextNumber: 1002 }],
      [fakeInvoice({ status: "draft", invoiceNumber: null })],
    );

    await request(app).post("/42/revert-to-draft").send();

    const settingsUpdate = h.updates.find((u: any) => u.invoiceNextNumber !== undefined);
    expect(settingsUpdate).toBeTruthy();
    expect(settingsUpdate.invoiceNextNumber).toBe(1001);
  });

  it("does NOT decrement the counter when reverting a non-latest number", async () => {
    // INV-1000 is not counter-1 (counter = 1002, so last issued = INV-1001) → no decrement
    h.selectQueue.push(
      [{ status: "approved", invoiceNumber: "INV-1000", amountPaid: null }],
      [{ id: 1, invoicePrefix: "INV-", invoiceNextNumber: 1002 }],
      [fakeInvoice({ status: "draft", invoiceNumber: null })],
    );

    await request(app).post("/42/revert-to-draft").send();

    const settingsUpdate = h.updates.find((u: any) => u.invoiceNextNumber !== undefined);
    expect(settingsUpdate).toBeUndefined();
  });

  it("returns 400 when the invoice has recorded payments", async () => {
    h.selectQueue.push(
      [{ status: "sent", invoiceNumber: "INV-1001", amountPaid: "250.00" }],
    );

    const res = await request(app).post("/42/revert-to-draft").send();

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/payment/i);
    expect(h.updates).toHaveLength(0);
  });

  it("returns 400 when the invoice is already a draft", async () => {
    h.selectQueue.push(
      [{ status: "draft", invoiceNumber: null, amountPaid: null }],
    );

    const res = await request(app).post("/42/revert-to-draft").send();

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/approved or sent/i);
    expect(h.updates).toHaveLength(0);
  });

  it("returns 400 when the invoice is cancelled (voided)", async () => {
    h.selectQueue.push(
      [{ status: "cancelled", invoiceNumber: "INV-1001", amountPaid: null }],
    );

    const res = await request(app).post("/42/revert-to-draft").send();

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/approved or sent/i);
  });

  it("returns 400 when the invoice is paid", async () => {
    h.selectQueue.push(
      [{ status: "paid", invoiceNumber: "INV-1001", amountPaid: "1000.00" }],
    );

    const res = await request(app).post("/42/revert-to-draft").send();

    expect(res.status).toBe(400);
  });

  it("returns 404 when invoice does not exist", async () => {
    h.selectQueue.push([]);

    const res = await request(app).post("/99/revert-to-draft").send();

    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /:id/void — irreversible audit-safe cancellation
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /:id/void", () => {
  it("transitions an approved invoice to cancelled", async () => {
    // 1) status check fetch
    // 2) buildInvoiceQuery fetch after update
    h.selectQueue.push(
      [{ status: "approved", squarePaymentLinkId: null }],
      [fakeInvoice({ status: "cancelled" })],
    );

    const res = await request(app).post("/42/void").send();

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("cancelled");

    const update = h.updates.find((u: any) => u.status === "cancelled");
    expect(update).toBeTruthy();
    expect(update.squarePaymentLinkId).toBeNull();
    expect(update.squarePaymentLinkUrl).toBeNull();
  });

  it("returns 400 when voiding a draft (use delete instead)", async () => {
    h.selectQueue.push([{ status: "draft", squarePaymentLinkId: null }]);

    const res = await request(app).post("/42/void").send();

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/draft/i);
    expect(h.updates).toHaveLength(0);
  });

  it("returns 400 when voiding an already-cancelled invoice", async () => {
    h.selectQueue.push([{ status: "cancelled", squarePaymentLinkId: null }]);

    const res = await request(app).post("/42/void").send();

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already voided/i);
    expect(h.updates).toHaveLength(0);
  });

  it("attempts Square payment link cleanup on void when configured", async () => {
    h.squareConfigured = true;

    h.selectQueue.push(
      [{ status: "approved", squarePaymentLinkId: "sq-link-abc123" }],
      [fakeInvoice({ status: "cancelled" })],
    );

    const res = await request(app).post("/42/void").send();

    expect(res.status).toBe(200);
    expect(deleteSquarePaymentLink).toHaveBeenCalledOnce();
    expect(deleteSquarePaymentLink).toHaveBeenCalledWith("sq-link-abc123");
  });

  it("still voids even if Square link deletion throws (best-effort)", async () => {
    h.squareConfigured = true;
    deleteSquarePaymentLink.mockRejectedValueOnce(new Error("Square API down"));

    h.selectQueue.push(
      [{ status: "sent", squarePaymentLinkId: "sq-link-xyz" }],
      [fakeInvoice({ status: "cancelled" })],
    );

    const res = await request(app).post("/42/void").send();

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("cancelled");

    const update = h.updates.find((u: any) => u.status === "cancelled");
    expect(update).toBeTruthy();
  });

  it("returns 404 when invoice does not exist", async () => {
    h.selectQueue.push([]);

    const res = await request(app).post("/99/void").send();

    expect(res.status).toBe(404);
  });
});
