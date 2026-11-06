// Tests for POST /plaid/transactions/:txnId/match-invoices
//
// Covers:
//   - Happy path: valid credit deposit matched to 2 approved invoices whose sum matches
//   - Rejection of cancelled invoices
//   - Rejection of draft invoices
//   - Rejection of mixed-validity selections (one cancelled + one valid)
//   - Amount mismatch rejected
//   - Fewer than 2 invoices rejected
//   - Debit transactions rejected
//   - Already-matched transaction rejected
//
// The DB layer is fully mocked; no database connection required.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";

// ── Hoisted mutable state ─────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  selectQueue: [] as any[][],
  executeQueue: [] as any[][],
  updates: [] as any[],
  inserts: [] as any[],
  deletes: [] as any[],
  consumedSelectSlots: 0,
  missingSelectSlots: [] as number[],
  consumedExecuteSlots: 0,
  missingExecuteSlots: [] as number[],
  scenario: "no request",
}));

// ── Mock @workspace/db ────────────────────────────────────────────────────────
vi.mock("@workspace/db", () => {
  const chain: any = {
    from:      () => chain,
    leftJoin:  () => chain,
    orderBy:   () => chain,
    where:     () => {
      const slot = h.consumedSelectSlots++;
      const queued = h.selectQueue.shift();
      if (queued === undefined) {
        h.missingSelectSlots.push(slot);
        return Promise.reject(new Error(`[${h.scenario}] missing queued select slot [${slot}]`));
      }
      return Promise.resolve(queued);
    },
    limit:     () => {
      const slot = h.consumedSelectSlots++;
      const queued = h.selectQueue.shift();
      if (queued === undefined) {
        h.missingSelectSlots.push(slot);
        return Promise.reject(new Error(`[${h.scenario}] missing queued select slot [${slot}]`));
      }
      return Promise.resolve(queued);
    },
  };
  const dbOps = {
    select:  () => chain,
    update:  () => ({
      set: (data: any) => {
        h.updates.push(data);
        return { where: () => ({ returning: () => Promise.resolve([{ id: 1, ...data }]) }) };
      },
    }),
    insert:  () => ({
      values: (rows: any) => {
        h.inserts.push(rows);
        return { returning: () => Promise.resolve([{ id: 99 }]) };
      },
    }),
    delete:  () => ({ where: () => Promise.resolve() }),
    execute: () => {
      const slot = h.consumedExecuteSlots++;
      const queued = h.executeQueue.shift();
      if (queued === undefined) {
        h.missingExecuteSlots.push(slot);
        return Promise.reject(new Error(`[${h.scenario}] missing queued execute slot [${slot}]`));
      }
      return Promise.resolve({ rows: queued });
    },
  };
  return {
    db: {
      ...dbOps,
      transaction: async (callback: (tx: any) => Promise<any>) => callback(dbOps),
    },
    plaidConnectionsTable:            {},
    bankImportBatchesTable:            {},
    bankTransactionsTable:             {},
    bankTransactionInvoiceLinksTable:  {},
  };
});

vi.mock("../lib/matchingEngine.js", () => ({
  getSuggestions:    vi.fn().mockResolvedValue([]),
  attemptAutoMatch:  vi.fn().mockResolvedValue(null),
}));
vi.mock("../lib/plaid.js", () => ({
  isPlaidConfigured:   () => true,
  getPlaidClient:      vi.fn(),
  extractPlaidError:   vi.fn(),
}));
vi.mock("./guards.js", () => ({
  wrapAsync:        (fn: any) => fn,
  getOwnerId:       () => Promise.resolve("user-1"),
  getRequestUserId: (_req: any) => "user-1",
}));

const { default: plaidRouter, getPlaidInvoicePaymentStatus } = await import("./plaid.js");

const app = express();
app.use(express.json());
app.use("/", (req, _res, next) => {
  h.scenario = `${req.method} ${req.path}`;
  next();
}, plaidRouter);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function fakeTxn(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    amount: "1273.48",
    transactionType: "credit",
    status: "unmatched",
    ...overrides,
  };
}

function fakeInvoice(id: number, status: string, total: string) {
  return { id, total, amountPaid: "0.00", status, invoiceNumber: `WIL-${1000 + id}` };
}

beforeEach(() => {
  h.selectQueue.length = 0;
  h.executeQueue.length = 0;
  h.updates.length = 0;
  h.inserts.length = 0;
  h.deletes.length = 0;
  h.consumedSelectSlots = 0;
  h.missingSelectSlots.length = 0;
  h.consumedExecuteSlots = 0;
  h.missingExecuteSlots.length = 0;
  h.scenario = "no request";
});

afterEach(() => {
  expect(h.missingSelectSlots, `[${h.scenario}] missing queued select slot(s)`).toHaveLength(0);
  expect(h.selectQueue, `[${h.scenario}] unconsumed queued select slot(s)`).toHaveLength(0);
  expect(h.missingExecuteSlots, `[${h.scenario}] missing queued execute slot(s)`).toHaveLength(0);
  expect(h.executeQueue, `[${h.scenario}] unconsumed queued execute slot(s)`).toHaveLength(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /:txnId/match-invoices
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /transactions/:txnId/match-invoices", () => {
  it("returns 400 with fewer than 2 invoice IDs", async () => {
    const res = await request(app)
      .post("/transactions/1/match-invoices")
      .send({ invoiceIds: [42] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least 2/i);
  });

  it("returns 400 when invoiceIds is missing", async () => {
    const res = await request(app)
      .post("/transactions/1/match-invoices")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least 2/i);
  });

  it("returns 404 when transaction not found", async () => {
    h.selectQueue.push([]); // txn lookup returns nothing
    const res = await request(app)
      .post("/transactions/99/match-invoices")
      .send({ invoiceIds: [1, 2] });
    expect(res.status).toBe(404);
  });

  it("returns 409 when transaction is already matched", async () => {
    h.selectQueue.push([fakeTxn({ status: "matched" })]);
    const res = await request(app)
      .post("/transactions/1/match-invoices")
      .send({ invoiceIds: [1, 2] });
    expect(res.status).toBe(409);
  });

  it("returns 400 for a debit transaction", async () => {
    h.selectQueue.push([fakeTxn({ transactionType: "debit" })]);
    const res = await request(app)
      .post("/transactions/1/match-invoices")
      .send({ invoiceIds: [1, 2] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/credit/i);
  });

  it("returns 400 when a cancelled invoice is selected", async () => {
    h.selectQueue.push([fakeTxn()]);
    // invoices fetch: one approved, one cancelled
    h.selectQueue.push([
      fakeInvoice(1, "approved", "1091.21"),
      fakeInvoice(2, "cancelled", "182.27"),
    ]);
    const res = await request(app)
      .post("/transactions/1/match-invoices")
      .send({ invoiceIds: [1, 2] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/WIL-1002/);
    expect(res.body.error).toMatch(/cannot match/i);
  });

  it("returns 400 when a draft invoice is selected", async () => {
    h.selectQueue.push([fakeTxn()]);
    h.selectQueue.push([
      fakeInvoice(1, "sent", "1000.00"),
      fakeInvoice(2, "draft", "273.48"),
    ]);
    const res = await request(app)
      .post("/transactions/1/match-invoices")
      .send({ invoiceIds: [1, 2] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/WIL-1002/);
    expect(res.body.error).toMatch(/cannot match/i);
  });

  it("returns 400 when a voided invoice is selected", async () => {
    h.selectQueue.push([fakeTxn()]);
    h.selectQueue.push([
      fakeInvoice(1, "approved", "1000.00"),
      fakeInvoice(2, "void", "273.48"),
    ]);
    const res = await request(app)
      .post("/transactions/1/match-invoices")
      .send({ invoiceIds: [1, 2] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot match/i);
  });

  it("returns 400 when invoice totals don't match the deposit amount", async () => {
    h.selectQueue.push([fakeTxn({ amount: "1273.48" })]);
    h.selectQueue.push([
      fakeInvoice(1, "approved", "1000.00"),
      fakeInvoice(2, "sent", "100.00"),  // sum = 1100, not 1273.48
    ]);
    const res = await request(app)
      .post("/transactions/1/match-invoices")
      .send({ invoiceIds: [1, 2] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/do not match/i);
  });

  it("returns 400 when an already-paid invoice is selected", async () => {
    h.selectQueue.push([fakeTxn()]);
    h.selectQueue.push([
      fakeInvoice(1, "approved", "1091.21"),
      fakeInvoice(2, "paid", "182.27"),
    ]);
    const res = await request(app)
      .post("/transactions/1/match-invoices")
      .send({ invoiceIds: [1, 2] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot match/i);
  });

  it("succeeds and marks both approved invoices paid when totals match", async () => {
    // Txn lookup
    h.selectQueue.push([fakeTxn({ amount: "1273.48" })]);
    // Invoices lookup (both approved, sums to 1273.48)
    h.selectQueue.push([
      fakeInvoice(1, "approved", "1091.21"),
      fakeInvoice(2, "approved", "182.27"),
    ]);
    // Inside the transaction: re-check txn status
    h.selectQueue.push([{ status: "unmatched" }]);

    const res = await request(app)
      .post("/transactions/1/match-invoices")
      .send({ invoiceIds: [1, 2] });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.invoiceIds).toEqual([1, 2]);

    // Both invoices should have been updated to paid
    const paidUpdates = h.updates.filter(u => u.status === "paid");
    expect(paidUpdates).toHaveLength(2);

    // Junction rows should have been inserted
    const junctionInsert = h.inserts.find(
      (ins) => Array.isArray(ins) && ins.some((r: any) => r.invoiceId !== undefined),
    );
    expect(junctionInsert).toBeTruthy();
  });

  it("succeeds for sent + partiallyPaid using remaining balances (non-zero amountPaid)", async () => {
    // Deposit: $350. Invoice 1: sent, total $300, amountPaid $0 → remaining $300.
    // Invoice 2: partiallyPaid, total $400, amountPaid $50 → remaining $350.
    // Wait — we need both remainders to sum to the deposit.
    // Invoice 1 remaining $300 + Invoice 2 remaining $50 = $350.
    h.selectQueue.push([fakeTxn({ amount: "350.00" })]);
    h.selectQueue.push([
      { id: 1, total: "300.00", amountPaid: "0.00",  status: "sent",          invoiceNumber: "WIL-1001" },
      { id: 2, total: "450.00", amountPaid: "400.00", status: "partiallyPaid", invoiceNumber: "WIL-1002" },
    ]);
    h.selectQueue.push([{ status: "unmatched" }]);

    const res = await request(app)
      .post("/transactions/1/match-invoices")
      .send({ invoiceIds: [1, 2] });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    // Both invoices should be updated to paid
    const paidUpdates = h.updates.filter((u: any) => u.status === "paid");
    expect(paidUpdates).toHaveLength(2);
  });

  it("rejects when deposit matches invoice totals but not remaining balances", async () => {
    // Deposit: $750 = sum of full totals but NOT sum of remainders
    // Invoice 1: total $500, amountPaid $250 → remaining $250
    // Invoice 2: total $250, amountPaid $0  → remaining $250
    // Remaining sum = $500, not $750 → should fail
    h.selectQueue.push([fakeTxn({ amount: "750.00" })]);
    h.selectQueue.push([
      { id: 1, total: "500.00", amountPaid: "250.00", status: "partiallyPaid", invoiceNumber: "WIL-1001" },
      { id: 2, total: "250.00", amountPaid: "0.00",   status: "sent",          invoiceNumber: "WIL-1002" },
    ]);
    const res = await request(app)
      .post("/transactions/1/match-invoices")
      .send({ invoiceIds: [1, 2] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/do not match/i);
  });

  it("returns 400 when a 'partial' (wrong spelling) status is used — only partiallyPaid is canonical", async () => {
    h.selectQueue.push([fakeTxn()]);
    h.selectQueue.push([
      fakeInvoice(1, "approved", "1091.21"),
      fakeInvoice(2, "partial", "182.27"),
    ]);
    const res = await request(app)
      .post("/transactions/1/match-invoices")
      .send({ invoiceIds: [1, 2] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot match/i);
  });
});


describe("Plaid invoice payment status vocabulary", () => {
  it("uses partiallyPaid for an invoice with an outstanding balance", () => {
    expect(getPlaidInvoicePaymentStatus(125, 500)).toBe("partiallyPaid");
  });

  it("uses paid only when the collected amount covers the invoice total", () => {
    expect(getPlaidInvoicePaymentStatus(500, 500)).toBe("paid");
    expect(getPlaidInvoicePaymentStatus(550, 500)).toBe("paid");
  });
});
