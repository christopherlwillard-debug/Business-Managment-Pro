// Integration tests for invoice state-transition endpoints (Task #1127).
//
// These pin the lifecycle rules that guard the contractor billing workflow:
//   draft → approved (POST /accept)   — assigns invoice number
//   approved → sent  (only after confirmed provider delivery)
//   sent → paid etc  (PATCH /status)  — VALID_TRANSITIONS enforced
//   sent → partiallyPaid → paid       (POST /record-payment) — amountPaid accumulates
//
// The DB layer is fully mocked so no database connection is required.
// Each test pushes expected results onto a shared queue that the mock drains
// in the order the route handler issues selects/limits.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import { createStrictQueryQueue } from "../test/strict-query-queue";

// ── Hoisted mutable state — must be declared before vi.mock calls ─────────────
const h = vi.hoisted(() => ({
  // Queue of result arrays. Each .where() / .limit() call shifts one off.
  selectQueue: undefined as any,
  // Queue for db.execute() calls that return rows (e.g. UPDATE … RETURNING).
  // Each element is the rows array for one execute call.
  executeQueue: undefined as any,
  // Record of every .set(data) call (for asserting what was written to DB).
  updates: [] as any[],
  inserts: [] as any[],
  mutationResolution: undefined as any,
  updateReturningOverride: undefined as any[] | undefined,
  canonicalOwner: undefined as any,
  // Controls whether isSquareConfigured() returns true in a given test.
  squareConfigured: false,
  gmailProxy: vi.fn(),
  scenario: "no request",
}));

// ── Mock @workspace/db ────────────────────────────────────────────────────────
// Returns a fluent chain; .where() and .limit() pop the next result off the queue.
vi.mock("@workspace/db", () => {
  const chain: any = {
    from:      () => chain,
    leftJoin:  () => chain,
    orderBy:   () => chain,
    inArray:   () => chain,
    where:     () => {
      return Promise.resolve(h.selectQueue.take(h.scenario));
    },
    limit:     () => {
      return Promise.resolve(h.selectQueue.take(h.scenario));
    },
  };
  const dbOps = {
    select:  () => chain,
    update:  () => ({
      set: (data: any) => {
        h.updates.push(data);
        return {
          where: () => {
            const result = Promise.resolve() as Promise<void> & { returning: () => Promise<any[]> };
            result.returning = () => Promise.resolve(
              h.updateReturningOverride ?? [{ id: 42, ...data }],
            );
            return result;
          },
        };
      },
    }),
    insert:  () => ({
      values: (data: any) => {
        h.inserts.push(data);
        return {
        returning: () => Promise.resolve([{ id: 42 }]),
        };
      },
    }),
    execute: () => {
      return Promise.resolve({ rows: h.executeQueue.take(h.scenario) });
    },
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
vi.mock("@replit/connectors-sdk", () => ({
  ReplitConnectors: class {
    proxy = h.gmailProxy;
  },
}));
vi.mock("./material-lists", () => ({
  initializeLegacyMaterialAssignments: vi.fn(),
  syncMaterialsToInvoice: vi.fn(),
  syncMaterialsToJobInvoice: vi.fn(),
}));
vi.mock("../lib/business-scope.js", () => ({
  requestedBusiness: async () => null,
  resolveMutationBusiness: async () => h.mutationResolution,
  canonicalRecordBusiness: async () => h.canonicalOwner,
  generalContractingBusiness: async () => ({ id: 1, slug: "general_contracting" }),
  belongsToBusiness: () => true,
}));
vi.mock("../lib/launchBrowser.js",          () => ({ launchBrowser:              vi.fn() }));
vi.mock("../lib/generateChecklistPdf.js",   () => ({ generateChecklistPdfBuffer: vi.fn() }));
vi.mock("../lib/generateMaterialsPdf.js",   () => ({ generateMaterialsPdfBuffer: vi.fn() }));

// ── Import router + helpers AFTER mocks are hoisted ───────────────────────────
const mod = await import("./invoices");
const invoiceRouter = mod.default;
const { calcInvoice, calcInvoiceFromStored, fmt } = mod;
const communicationMod = await import("../lib/invoiceCommunication");

// Grab the spy handle for deleteSquarePaymentLink from the module mock.
const squareMod = await import("../lib/square.js");
const deleteSquarePaymentLink = vi.mocked(squareMod.deleteSquarePaymentLink);
const invoiceEmailMod = await import("../lib/invoiceEmail");
const sendInvoiceEmail = vi.mocked(invoiceEmailMod.sendInvoiceEmail);

// ── Mount in a minimal Express app ───────────────────────────────────────────
const app = express();
app.use(express.json());
app.use((_req, _res, next) => {
  h.scenario = `${_req.method} ${_req.path}`;
  (_req as any).user = { id: 1, claims: { sub: "user_1" } };
  next();
});
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
  h.selectQueue = createStrictQueryQueue<any[]>({ kind: "select" });
  h.executeQueue = createStrictQueryQueue<any[]>({ kind: "execute" });
  h.updates.length = 0;
  h.inserts.length = 0;
  h.mutationResolution = {
    ok: true,
    explicit: false,
    business: { id: 1, slug: "general_contracting" },
  };
  h.updateReturningOverride = undefined;
  h.canonicalOwner = { state: "blank" };
  h.squareConfigured = false;
  h.gmailProxy.mockReset();
  deleteSquarePaymentLink.mockClear();
  sendInvoiceEmail.mockReset();
  h.scenario = "no request";
});

afterEach(() => {
  h.selectQueue.assertConsumed(h.scenario);
  h.executeQueue.assertConsumed(h.scenario);
  vi.unstubAllGlobals();
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

  it("writes General Contracting ownership when no business is selected", async () => {
    h.selectQueue.push([fakeInvoice({ status: "draft", invoiceNumber: null })]);

    const res = await request(app).post("/").send({ issueDate: "2026-07-10" });

    expect(res.status).toBe(201);
    expect(h.inserts[0]).toMatchObject({
      businessId: 1,
      businessLine: "general_contracting",
    });
  });

  it("inherits a linked Asphalt job's canonical ownership", async () => {
    h.canonicalOwner = { state: "resolved", business: { id: 9, slug: "asphalt_sealing" } };
    h.selectQueue.push(
      [{ id: 55, businessId: 9, businessLine: "asphalt_sealing" }],
      [fakeInvoice({ status: "draft", invoiceNumber: null, jobId: 55, businessId: 9, businessLine: "asphalt_sealing" })],
    );

    const res = await request(app).post("/").send({ issueDate: "2026-07-10", jobId: 55 });

    expect(res.status).toBe(201);
    expect(h.inserts[0]).toMatchObject({
      jobId: 55,
      businessId: 9,
      businessLine: "asphalt_sealing",
    });
  });

  it("rejects an explicit invoice owner that conflicts with its linked job", async () => {
    h.mutationResolution = {
      ok: true,
      explicit: true,
      business: { id: 1, slug: "general_contracting" },
    };
    h.canonicalOwner = { state: "resolved", business: { id: 9, slug: "asphalt_sealing" } };
    h.selectQueue.push([{ id: 55, businessId: 9, businessLine: "asphalt_sealing" }]);

    const res = await request(app).post("/").send({
      issueDate: "2026-07-10",
      jobId: 55,
      businessLine: "general_contracting",
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/conflicts with the linked job/i);
    expect(h.inserts).toHaveLength(0);
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
  it("rebuilds totals from stored line items", () => {
    expect(calcInvoiceFromStored([
      { quantity: 2, unitPrice: 125 },
      { quantity: 1, unitPrice: 50 },
    ], "10").total).toBeCloseTo(330);
  });
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

  it("rounds each line, subtotal, tax, and total to cents consistently", () => {
    const r = calcInvoice([
      { quantity: 1, unitPrice: 1.005 },
      { quantity: 3, unitPrice: 0.333 },
    ], 8.25);

    expect(r.lineTotals).toEqual([1.01, 1.00]);
    expect(r.subtotal).toBe(2.01);
    expect(r.taxAmount).toBe(0.17);
    expect(r.total).toBe(2.18);
  });

  it("reopens a saved invoice with the same rounded live totals", () => {
    const reopened = fmt(fakeInvoice({
      lineItems: [
        { description: "Precision line", quantity: 1, unitPrice: 1.005 },
        { description: "Fractional quantity", quantity: 3, unitPrice: 0.333 },
      ],
      subtotal: "2.01",
      taxRate: "8.25",
      taxAmount: "0.17",
      total: "2.18",
    }));

    expect(reopened.liveTotals).toEqual({
      lineTotals: [1.01, 1],
      subtotal: 2.01,
      taxAmount: 0.17,
      total: 2.18,
    });
    expect(reopened.calculationStatus.storedTotalsMatch).toBe(true);
    expect(reopened.lineItems.map((line: any) => line.total)).toEqual([1.01, 1]);
  });

  it("returns zeros for empty line items", () => {
    const r = calcInvoice([], null);
    expect(r.subtotal).toBe(0);
    expect(r.total).toBe(0);
  });

  it("includes an accepted mileage surcharge line exactly once in invoice totals", () => {
    const r = calcInvoice([
      { description: "Labor", quantity: 1, unitPrice: 500 },
      { description: "Mileage surcharge — 60.0 mi route", quantity: 3, unitPrice: 150 },
    ], null);
    expect(r.subtotal).toBe(950);
    expect(r.total).toBe(950);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /:id/accept — draft → approved
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /:id/accept", () => {
  it("transitions a draft invoice to approved and assigns an invoice number", async () => {
    // Inside the transaction:
    // 1) tx.select status check (invoicesTable .where)
    // 2) tx.execute atomic UPDATE … RETURNING (settings counter)
    // 3) tx.select collision check — empty means number is free
    // After transaction:
    // 4) buildInvoiceQuery .where
    h.selectQueue.push(
      [{ status: "draft", invoiceNumber: null }],
      [],  // collision check: "INV-1001" is not taken
      [fakeInvoice({ status: "approved", invoiceNumber: "INV-1001" })],
    );
    // The atomic counter UPDATE RETURNING resolves to { rows: [{ num, prefix }] }
    h.executeQueue.push([{ num: 1001, prefix: "INV-" }]);

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
// POST /:id/mark-sent — manual SENT is forbidden
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /:id/mark-sent", () => {
  it("rejects manual status changes so SENT only represents confirmed delivery", async () => {
    const res = await request(app).post("/42/mark-sent").send();

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/disabled/i);
    expect(h.updates).toHaveLength(0);
  });
});

describe("GET /:id — confirmed Gmail delivery reconciliation", () => {
  it("repairs an approved invoice when its verified Gmail event was accepted", async () => {
    const completedAt = new Date("2026-09-02T19:57:42.023Z");
    h.selectQueue.push(
      [fakeInvoice({ status: "approved", sentAt: null, sentMethod: null })],
      [{
        invoiceId: 42,
        eventType: "initial_invoice",
        status: "accepted",
        provider: "gmail",
        providerMessageId: "gmail-message-1",
        metadata: { gmailEvidenceVerified: true },
        completedAt,
      }],
    );

    const res = await request(app).get("/42");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("sent");
    expect(res.body.sentAt).toBe(completedAt.toISOString());
    expect(res.body.sentMethod).toBe("gmail");
    expect(h.updates).toContainEqual(expect.objectContaining({
      status: "sent",
      sentAt: completedAt,
      sentMethod: "gmail",
    }));
  });

  it("reconciles Gmail acceptance with a provider message ID without a metadata marker", async () => {
    const completedAt = new Date("2026-09-02T19:57:42.023Z");
    h.selectQueue.push(
      [fakeInvoice({ status: "approved", sentAt: null, sentMethod: null })],
      [{
        invoiceId: 42,
        eventType: "initial_invoice",
        status: "accepted",
        provider: "gmail",
        providerMessageId: "unverified-message",
        metadata: {},
        completedAt,
      }],
    );

    const res = await request(app).get("/42");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("sent");
    expect(res.body.sentAt).toBe(completedAt.toISOString());
    expect(h.updates).toContainEqual(expect.objectContaining({
      status: "sent",
      sentMethod: "gmail",
      sentAt: completedAt,
    }));
  });

  it("does not reconcile an invoice from a pending Gmail event", async () => {
    h.selectQueue.push(
      [fakeInvoice({ status: "approved" })],
      [{
        invoiceId: 42,
        eventType: "initial_invoice",
        status: "pending",
        provider: "gmail",
        providerMessageId: null,
        completedAt: null,
      }],
    );

    const res = await request(app).get("/42");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("approved");
    expect(res.body.sentAt).toBeNull();
    expect(h.updates).toHaveLength(0);
  });
});

describe("gmailRepairRequiredInvoiceIds", () => {
  it("flags only unverified Gmail deliveries when no confirmed send enables reminders", async () => {
    h.selectQueue.push([
      {
        invoiceId: 42,
        eventType: "initial_invoice",
        status: "pending",
        provider: "gmail",
        providerMessageId: "gmail-message-needing-repair",
        metadata: {},
        requestedAt: new Date("2026-09-05T12:00:00.000Z"),
      },
      {
        invoiceId: 42,
        eventType: "resend_invoice",
        status: "accepted",
        provider: "gmail",
        providerMessageId: "later-verified-resend",
        metadata: { gmailEvidenceVerified: true },
        requestedAt: new Date("2026-09-05T13:00:00.000Z"),
      },
      {
        invoiceId: 43,
        eventType: "initial_invoice",
        status: "accepted",
        provider: "gmail",
        providerMessageId: "gmail-message-verified",
        metadata: { gmailEvidenceVerified: true },
        requestedAt: new Date("2026-09-05T12:00:00.000Z"),
      },
      {
        invoiceId: 44,
        eventType: "initial_invoice",
        status: "pending",
        provider: "gmail",
        providerMessageId: null,
        metadata: {},
        requestedAt: new Date("2026-09-05T12:00:00.000Z"),
      },
      {
        invoiceId: 45,
        eventType: "initial_invoice",
        status: "pending",
        provider: "gmail",
        providerMessageId: "gmail-message-needing-repair",
        metadata: {},
        requestedAt: new Date("2026-09-05T12:00:00.000Z"),
      },
    ]);

    const result = await communicationMod.gmailRepairRequiredInvoiceIds([
      { id: 42, status: "approved", acceptedAt: "2026-09-05T10:00:00.000Z" },
      { id: 43, status: "sent", acceptedAt: "2026-09-05T10:00:00.000Z" },
      { id: 44, status: "approved", acceptedAt: "2026-09-05T10:00:00.000Z" },
      { id: 45, status: "approved", acceptedAt: "2026-09-05T10:00:00.000Z" },
    ]);

    expect([...result]).toEqual([44, 45]);
    expect(h.updates).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Browser Gmail finalization — adversarial status/evidence checks
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /:id/communications/:eventId/finalize", () => {
  const pendingEvent = (overrides: Record<string, any> = {}) => ({
    id: 77,
    invoiceId: 42,
    eventType: "initial_invoice",
    channel: "gmail",
    provider: "gmail",
    status: "pending",
    recipient: "client@example.com",
    subject: "Invoice INV-1001",
    ...overrides,
  });

  const verifiedGmailResponse = (overrides: Record<string, any> = {}) => ({
    ok: true,
    json: async () => ({
      id: "gmail-message-1",
      labelIds: ["SENT"],
      payload: {
        headers: [
          { name: "To", value: "client@example.com" },
          { name: "Subject", value: "Invoice INV-1001" },
          { name: "X-BuildPro-Delivery-ID", value: "77" },
        ],
      },
      ...overrides,
    }),
  });

  const recoveredGmailResponses = (requestedAt: Date) => [
    {
      ok: true,
      json: async () => ({
        messages: [{ id: "gmail-message-1", threadId: "gmail-thread-1" }],
      }),
    },
    {
      ok: true,
      json: async () => ({
        id: "gmail-message-1",
        threadId: "gmail-thread-1",
        internalDate: String(requestedAt.getTime()),
        labelIds: ["SENT"],
        payload: {
          headers: [
            { name: "To", value: "client@example.com" },
            { name: "Subject", value: "Invoice INV-1001" },
            { name: "X-BuildPro-Delivery-ID", value: "77" },
          ],
        },
      }),
    },
  ];

  it("idempotently checkpoints provider evidence without finalizing the event or invoice", async () => {
    h.selectQueue.push([pendingEvent()]);
    h.updateReturningOverride = [pendingEvent({
      providerMessageId: "gmail-message-1",
      providerThreadId: "gmail-thread-1",
    })];

    const res = await request(app)
      .post("/42/communications/77/finalize")
      .send({
        status: "pending",
        providerMessageId: "gmail-message-1",
        providerThreadId: "gmail-thread-1",
      });

    expect(res.status).toBe(200);
    expect(res.body.evidenceRetained).toBe(true);
    expect(h.updates).toContainEqual(expect.objectContaining({
      providerMessageId: "gmail-message-1",
      providerThreadId: "gmail-thread-1",
    }));
    expect(h.updates).not.toContainEqual(expect.objectContaining({ status: "accepted" }));
    expect(h.updates).not.toContainEqual(expect.objectContaining({ status: "sent" }));
    expect(h.inserts).toHaveLength(0);
  });

  it("does not overwrite a pending Gmail event resolved during recovery", async () => {
    const requestedAt = new Date("2026-09-05T12:00:00.000Z");
    h.selectQueue.push([pendingEvent({ requestedAt })]);
    h.updateReturningOverride = [];
    h.gmailProxy
      .mockResolvedValueOnce(recoveredGmailResponses(requestedAt)[0])
      .mockResolvedValueOnce(recoveredGmailResponses(requestedAt)[1]);

    const res = await request(app)
      .post("/42/communications/77/recover-gmail")
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already resolved/i);
    expect(h.updates).not.toContainEqual(expect.objectContaining({ status: "sent" }));
  });

  it("reconciles the existing event and invoice from one exact server Gmail match", async () => {
    const requestedAt = new Date("2026-09-05T12:00:00.000Z");
    h.selectQueue.push([pendingEvent({ requestedAt })]);
    h.gmailProxy
      .mockResolvedValueOnce(recoveredGmailResponses(requestedAt)[0])
      .mockResolvedValueOnce(recoveredGmailResponses(requestedAt)[1]);

    const res = await request(app)
      .post("/42/communications/77/recover-gmail")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.recovered).toBe(true);
    expect(h.updates).toContainEqual(expect.objectContaining({
      status: "accepted",
      provider: "gmail",
      providerMessageId: "gmail-message-1",
      providerThreadId: "gmail-thread-1",
    }));
    expect(h.updates).toContainEqual(expect.objectContaining({
      status: "sent",
      sentMethod: "gmail",
    }));
    expect(h.inserts).toHaveLength(0);
    expect(h.gmailProxy.mock.calls.every(([, path]) => !String(path).includes("/send"))).toBe(true);
  });

  it("retries metadata recovery with a reconnected token without sending a new invoice", async () => {
    const requestedAt = new Date("2026-09-05T12:00:00.000Z");
    h.selectQueue.push([pendingEvent({ requestedAt })]);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [{ id: "gmail-message-1", threadId: "gmail-thread-1" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "gmail-message-1",
          threadId: "gmail-thread-1",
          internalDate: String(requestedAt.getTime() + 2_000),
          labelIds: ["SENT"],
          payload: {
            headers: [
              { name: "To", value: "client@example.com" },
              { name: "Subject", value: "Invoice INV-1001" },
              { name: "X-BuildPro-Delivery-ID", value: "77" },
            ],
          },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const res = await request(app)
      .post("/42/communications/77/recover-gmail")
      .send({ accessToken: "fresh-gmail-token" });

    expect(res.status).toBe(200);
    expect(res.body.recovered).toBe(true);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      headers: { Authorization: "Bearer fresh-gmail-token" },
    }));
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes("/send"))).toBe(true);
    expect(h.gmailProxy).not.toHaveBeenCalled();
    expect(h.updates).toContainEqual(expect.objectContaining({
      status: "accepted",
      providerMessageId: "gmail-message-1",
    }));
    expect(h.updates).toContainEqual(expect.objectContaining({
      status: "sent",
      sentMethod: "gmail",
    }));
  });

  it("clears a stale pending event when no exact Gmail message exists", async () => {
    const requestedAt = new Date("2026-09-05T12:00:00.000Z");
    h.selectQueue.push([pendingEvent({ requestedAt })]);
    h.gmailProxy.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [] }),
    });

    const res = await request(app)
      .post("/42/communications/77/recover-gmail")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.recovered).toBe(false);
    expect(res.body.invoiceStatusUnchanged).toBe(true);
    expect(h.updates).toContainEqual(expect.objectContaining({
      status: "failed",
      errorCode: "gmail_message_not_found",
    }));
    expect(h.updates).not.toContainEqual(expect.objectContaining({ status: "sent" }));
    expect(h.inserts).toHaveLength(0);
    expect(h.gmailProxy.mock.calls.every(([, path]) => !String(path).includes("/send"))).toBe(true);
  });

  it.each(["failed", "unknown"] as const)(
    "records a %s attempt even after the invoice becomes paid or voided",
    async status => {
      h.selectQueue.push([pendingEvent()]);

      const res = await request(app)
        .post("/42/communications/77/finalize")
        .send({ status, errorMessage: "Gmail send did not complete" });

      expect(res.status).toBe(200);
      expect(h.updates).toContainEqual(expect.objectContaining({ status }));
      expect(h.updates).not.toContainEqual(expect.objectContaining({ status: "sent" }));
    },
  );

  it("does not let a non-Gmail pending event transition the invoice to SENT", async () => {
    h.selectQueue.push(
      [pendingEvent({ channel: "email", provider: "smtp" })],
      [{ status: "approved" }],
    );

    const res = await request(app)
      .post("/42/communications/77/finalize")
      .send({ status: "accepted", providerMessageId: "smtp-message-1" });

    expect(res.status).toBe(200);
    expect(h.updates).toContainEqual(expect.objectContaining({ status: "accepted" }));
    expect(h.updates).not.toContainEqual(expect.objectContaining({ status: "sent" }));
  });

  it("finalizes Gmail acceptance without making a secondary metadata request", async () => {
    h.selectQueue.push([pendingEvent()], [{ status: "approved" }]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await request(app)
      .post("/42/communications/77/finalize")
      .send({
        status: "accepted",
        providerMessageId: "gmail-message-1",
        providerThreadId: "gmail-thread-1",
      });

    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(h.updates).toContainEqual(expect.objectContaining({
      status: "accepted",
      providerMessageId: "gmail-message-1",
      providerThreadId: "gmail-thread-1",
      metadata: expect.objectContaining({ gmailAcceptanceRecorded: true }),
    }));
    expect(h.updates).toContainEqual(expect.objectContaining({
      status: "sent",
      sentMethod: "gmail",
    }));
  });

  it("keeps delayed Gmail evidence attached to the pending event for a later repair", async () => {
    h.selectQueue.push(
      [pendingEvent({ providerMessageId: "gmail-message-1" })],
      [{ status: "approved" }],
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(verifiedGmailResponse()));

    const res = await request(app)
      .post("/42/communications/77/finalize")
      .send({
        status: "accepted",
        providerMessageId: "gmail-message-1",
        providerThreadId: "gmail-thread-1",
        gmailAccessToken: "gmail-token",
      });

    expect(res.status).toBe(200);
    expect(h.updates).toContainEqual(expect.objectContaining({
      status: "accepted",
      providerMessageId: "gmail-message-1",
    }));
    expect(h.updates).toContainEqual(expect.objectContaining({
      status: "sent",
      sentMethod: "gmail",
    }));
  });

  it("rejects replacing the Gmail message attached to a pending repair", async () => {
    h.selectQueue.push([pendingEvent({ providerMessageId: "gmail-message-1" })]);

    const res = await request(app)
      .post("/42/communications/77/finalize")
      .send({
        status: "accepted",
        providerMessageId: "different-message",
        gmailAccessToken: "gmail-token",
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/different Gmail message/i);
    expect(h.updates).toHaveLength(0);
  });

  it("sets SENT from Gmail acceptance and the returned message ID", async () => {
    h.selectQueue.push([pendingEvent()], [{ status: "approved" }]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await request(app)
      .post("/42/communications/77/finalize")
      .send({
        status: "accepted",
        providerMessageId: "gmail-message-1",
        providerThreadId: "gmail-thread-1",
      });

    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(h.updates).toContainEqual(expect.objectContaining({
      status: "accepted",
      providerMessageId: "gmail-message-1",
    }));
    const acceptedEventUpdate = h.updates.find(update =>
      update.status === "accepted" && update.providerMessageId === "gmail-message-1"
    );
    const sentCompatibilityUpdate = h.updates.find(update => update.status === "sent");
    expect(sentCompatibilityUpdate).toEqual(expect.objectContaining({
      status: "sent",
      sentMethod: "gmail",
    }));
    expect(sentCompatibilityUpdate.sentAt).toBe(acceptedEventUpdate.completedAt);
  });

  it("idempotently repairs SENT when Gmail history was accepted but the invoice update did not finish", async () => {
    const completedAt = new Date("2026-09-02T19:57:42.023Z");
    h.selectQueue.push([pendingEvent({
      status: "accepted",
      providerMessageId: "gmail-message-1",
      providerThreadId: "gmail-thread-1",
      completedAt,
      metadata: { gmailEvidenceVerified: true },
    })]);

    const res = await request(app)
      .post("/42/communications/77/finalize")
      .send({
        status: "accepted",
        providerMessageId: "gmail-message-1",
        providerThreadId: "gmail-thread-1",
        gmailAccessToken: "gmail-token",
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("accepted");
    expect(h.updates).toContainEqual(expect.objectContaining({
      status: "sent",
      sentMethod: "gmail",
      sentAt: completedAt,
    }));
    expect(h.updates).not.toContainEqual(expect.objectContaining({
      status: "accepted",
    }));
  });

  it("does not promote an accepted Gmail event that has no message evidence", async () => {
    h.selectQueue.push([pendingEvent({
      status: "accepted",
      providerMessageId: null,
      completedAt: new Date("2026-09-02T19:57:42.023Z"),
    })]);

    const res = await request(app)
      .post("/42/communications/77/finalize")
      .send({ status: "accepted", gmailAccessToken: "gmail-token" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/no message evidence/i);
    expect(h.updates).toHaveLength(0);
  });

  it("repairs SENT in place from a legacy accepted event with a Gmail message ID", async () => {
    const completedAt = new Date("2026-09-02T19:57:42.023Z");
    h.selectQueue.push([pendingEvent({
      status: "accepted",
      providerMessageId: "gmail-message-1",
      completedAt,
      metadata: {},
    })]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await request(app)
      .post("/42/communications/77/finalize")
      .send({
        status: "accepted",
        providerMessageId: "gmail-message-1",
      });

    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(h.updates).toContainEqual(expect.objectContaining({
      status: "sent",
      sentMethod: "gmail",
      sentAt: completedAt,
    }));
  });

  it("rejects a retry that tries to attach different Gmail evidence to an accepted event", async () => {
    h.selectQueue.push([pendingEvent({
      status: "accepted",
      providerMessageId: "gmail-message-1",
    })]);

    const res = await request(app)
      .post("/42/communications/77/finalize")
      .send({
        status: "accepted",
        providerMessageId: "different-message",
        gmailAccessToken: "gmail-token",
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/different Gmail message/i);
    expect(h.updates).toHaveLength(0);
  });
});

describe("POST /:id/send-reminder", () => {
  const reminderInvoice = fakeInvoice({
    status: "sent",
    clientEmail: "client@example.com",
    clientName: "Client",
    reminderOptOut: false,
  });

  it("rejects a reminder without confirmed Gmail invoice evidence", async () => {
    h.selectQueue.push([reminderInvoice], [{}], []);

    const res = await request(app).post("/42/send-reminder").send();

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not been successfully sent through Gmail/i);
    expect(sendInvoiceEmail).not.toHaveBeenCalled();
  });

  it("allows a reminder after confirmed Gmail invoice evidence", async () => {
    h.selectQueue.push(
      [reminderInvoice],
      [{}],
      [{
        invoiceId: 42,
        eventType: "initial_invoice",
        status: "accepted",
        provider: "gmail",
        providerMessageId: "gmail-invoice-message-1",
        metadata: { gmailEvidenceVerified: true },
      }],
      [reminderInvoice],
    );
    sendInvoiceEmail.mockResolvedValue({
      provider: "gmail",
      messageId: "reminder-message-1",
    });

    const res = await request(app).post("/42/send-reminder").send();

    expect(res.status).toBe(200);
    expect(sendInvoiceEmail).toHaveBeenCalledOnce();
    expect(h.updates).toContainEqual(expect.objectContaining({
      status: "accepted",
      providerMessageId: "reminder-message-1",
    }));
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

  it("blocks approved → sent unless a provider send finalizes it", async () => {
    h.selectQueue.push([{ status: "approved", invoiceNumber: "INV-1001" }]);

    const res = await request(app).patch("/42/status").send({ status: "sent" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid transition/i);
    expect(h.updates).toHaveLength(0);
  });

  it("explains the required Issue → Gmail flow when a draft tries to jump to SENT", async () => {
    h.selectQueue.push([{ status: "draft", invoiceNumber: null }]);

    const res = await request(app).patch("/42/status").send({ status: "sent" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/issued first/i);
    expect(res.body.error).toMatch(/Gmail/i);
    expect(h.updates).toHaveLength(0);
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

    const res = await request(app).post("/42/void").send({ reason: "Customer cancellation" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("cancelled");

    const update = h.updates.find((u: any) => u.status === "cancelled");
    expect(update).toBeTruthy();
    expect(update.squarePaymentLinkId).toBeNull();
    expect(update.squarePaymentLinkUrl).toBeNull();
  });

  it("returns 400 when voiding a draft (use delete instead)", async () => {
    h.selectQueue.push([{ status: "draft", squarePaymentLinkId: null }]);

    const res = await request(app).post("/42/void").send({ reason: "Customer cancellation" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/draft/i);
    expect(h.updates).toHaveLength(0);
  });

  it("returns 400 when voiding an already-cancelled invoice", async () => {
    h.selectQueue.push([{ status: "cancelled", squarePaymentLinkId: null }]);

    const res = await request(app).post("/42/void").send({ reason: "Customer cancellation" });

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

    const res = await request(app).post("/42/void").send({ reason: "Customer cancellation" });

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

    const res = await request(app).post("/42/void").send({ reason: "Customer cancellation" });

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

// ─────────────────────────────────────────────────────────────────────────────
// PUT /:id — field preservation guards (Task #1297 / #1298 regression)
//
// The PUT handler must never silently null out clientId / jobId when those
// fields are simply absent from the request body, and must never touch
// amountPaid (payment recording has its own endpoint).
// ─────────────────────────────────────────────────────────────────────────────
describe("PUT /:id — field preservation guards", () => {
  it("does NOT write clientId when omitted from the body (preserves existing client link)", async () => {
    h.selectQueue.push(
      [{ status: "draft", invoiceNumber: null }],          // voided-guard check
      [fakeInvoice({ status: "draft", clientId: 7 })],     // buildInvoiceQuery after update
    );

    await request(app).put("/42").send({
      issueDate: "2026-07-10",
      lineItems: [{ description: "Labor", quantity: 1, unitPrice: 500 }],
      // clientId intentionally absent — should not appear in the DB write
    });

    expect(h.updates).toHaveLength(1);
    expect("clientId" in h.updates[0]).toBe(false);
  });

  it("does NOT write jobId when omitted from the body (preserves existing job link)", async () => {
    h.selectQueue.push(
      [{ status: "draft", invoiceNumber: null }],
      [fakeInvoice({ status: "draft", jobId: 3 })],
    );

    await request(app).put("/42").send({
      issueDate: "2026-07-10",
      lineItems: [{ description: "Materials", quantity: 2, unitPrice: 200 }],
      // jobId intentionally absent
    });

    expect(h.updates).toHaveLength(1);
    expect("jobId" in h.updates[0]).toBe(false);
  });

  it("writes clientId when explicitly provided as a positive integer", async () => {
    h.selectQueue.push(
      [{ status: "draft", invoiceNumber: null }],
      [],
      [fakeInvoice({ status: "draft", clientId: 5 })],
    );

    await request(app).put("/42").send({
      issueDate: "2026-07-10",
      clientId: 5,
      lineItems: [{ description: "Labor", quantity: 1, unitPrice: 500 }],
    });

    expect(h.updates).toHaveLength(1);
    expect("clientId" in h.updates[0]).toBe(true);
    expect(h.updates[0].clientId).toBe(5);
  });

  it("sets clientId to null when explicitly sent as null (intentional detach)", async () => {
    h.selectQueue.push(
      [{ status: "draft", invoiceNumber: null }],
      [],
      [fakeInvoice({ status: "draft", clientId: null })],
    );

    await request(app).put("/42").send({
      issueDate: "2026-07-10",
      clientId: null,
      lineItems: [{ description: "Labor", quantity: 1, unitPrice: 500 }],
    });

    expect(h.updates).toHaveLength(1);
    expect("clientId" in h.updates[0]).toBe(true);
    expect(h.updates[0].clientId).toBeNull();
  });

  it("sets jobId to null when explicitly sent as null (intentional detach)", async () => {
    h.selectQueue.push(
      [{ status: "draft", invoiceNumber: null }],
      [fakeInvoice({ status: "draft", jobId: null })],
    );

    await request(app).put("/42").send({
      issueDate: "2026-07-10",
      jobId: null,
      lineItems: [{ description: "Labor", quantity: 1, unitPrice: 500 }],
    });

    expect(h.updates).toHaveLength(1);
    expect("jobId" in h.updates[0]).toBe(true);
    expect(h.updates[0].jobId).toBeNull();
  });

  it("never includes amountPaid in the update set regardless of what the body sends", async () => {
    // A stale or malicious payload carrying amountPaid: 0 must not wipe a
    // recorded payment — amountPaid is managed exclusively via /record-payment.
    h.selectQueue.push(
      [{ status: "partiallyPaid", invoiceNumber: "INV-1001" }],
      [fakeInvoice({ status: "partiallyPaid", amountPaid: "500.00" })],
    );

    await request(app).put("/42").send({
      issueDate: "2026-07-10",
      amountPaid: 0,   // body attempts to wipe the payment
      lineItems: [{ description: "Labor", quantity: 1, unitPrice: 1000 }],
    });

    expect(h.updates).toHaveLength(1);
    expect("amountPaid" in h.updates[0]).toBe(false);
  });

  it("returns 400 when trying to edit a voided invoice", async () => {
    h.selectQueue.push([{ status: "cancelled", invoiceNumber: "INV-1001" }]);

    const res = await request(app).put("/42").send({
      issueDate: "2026-07-10",
      lineItems: [{ description: "Labor", quantity: 1, unitPrice: 500 }],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/voided/i);
    expect(h.updates).toHaveLength(0);
  });

  it("returns 404 when invoice does not exist", async () => {
    h.selectQueue.push([]);

    const res = await request(app).put("/99").send({
      issueDate: "2026-07-10",
      lineItems: [{ description: "Labor", quantity: 1, unitPrice: 500 }],
    });

    expect(res.status).toBe(404);
    expect(h.updates).toHaveLength(0);
  });
});
