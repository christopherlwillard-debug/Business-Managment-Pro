import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import cookieParser from "cookie-parser";

const h = vi.hoisted(() => ({
  ownerId: "owner-1" as string | null,
  belongsToBusiness: true,
  sessions: {} as Record<string, any>,
  selectQueue: [] as any[][],
  inserts: [] as any[],
  updates: [] as any[],
  lockCount: 0,
  missingSelects: 0,
}));

vi.mock("@workspace/db", () => {
  function takeSelect(): Promise<any[]> {
    const next = h.selectQueue.shift();
    if (next === undefined) {
      h.missingSelects += 1;
      return Promise.reject(new Error("Missing queued select"));
    }
    return Promise.resolve(next);
  }

  const chain: any = {
    from: () => chain,
    where: () => chain,
    limit: () => takeSelect(),
    for: (mode: string) => {
      if (mode === "update") h.lockCount += 1;
      return takeSelect();
    },
    then: (resolve: (value: any[]) => unknown, reject: (reason: unknown) => unknown) =>
      takeSelect().then(resolve, reject),
  };

  const ops = {
    select: () => chain,
    insert: () => ({
      values: (values: any) => {
        h.inserts.push(values);
        return { returning: () => Promise.resolve([{ id: 501, ...values }]) };
      },
    }),
    update: () => ({
      set: (values: any) => {
        h.updates.push(values);
        return { where: () => Promise.resolve() };
      },
    }),
  };

  return {
    db: {
      ...ops,
      transaction: async (callback: (tx: typeof ops) => Promise<unknown>) => callback(ops),
    },
    plaidConnectionsTable: {},
    bankImportBatchesTable: {},
    bankTransactionsTable: { id: {}, status: {} },
    bankTransactionInvoiceLinksTable: {},
    bankTransactionExpenseLinksTable: {},
  };
});

vi.mock("@workspace/db/schema", () => ({
  expensesTable: {},
  otherIncomeTable: {},
  invoicesTable: {},
  clientsTable: {},
  subPaymentRecordsTable: {},
  subcontractorsTable: {},
  jobsTable: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({})),
  like: vi.fn(() => ({})),
  isNotNull: vi.fn(() => ({})),
  isNull: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  gte: vi.fn(() => ({})),
  lte: vi.fn(() => ({})),
  notInArray: vi.fn(() => ({})),
  sql: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
}));

vi.mock("../lib/matchingEngine.js", () => ({
  getSuggestions: vi.fn(),
  attemptAutoMatch: vi.fn(),
}));

vi.mock("../lib/plaid.js", () => ({
  getPlaidClient: vi.fn(),
  isPlaidConfigured: () => true,
  extractPlaidError: vi.fn(),
}));

vi.mock("../lib/auth", () => ({
  getSessionId: (req: any) => req.cookies?.sid,
  getSession: (sid: string) => Promise.resolve(h.sessions[sid] ?? null),
  clearSession: vi.fn(async () => undefined),
  updateSession: vi.fn(async () => undefined),
  getOidcConfig: vi.fn(),
}));

vi.mock("../lib/business-scope.js", () => ({
  resolveMutationBusiness: vi.fn(async () => ({
    ok: true,
    business: { id: 8, slug: "general_contracting" },
  })),
  belongsToBusiness: vi.fn(() => h.belongsToBusiness),
}));

vi.mock("./guards.js", () => ({
  wrapAsync: (fn: any) => (req: any, res: any, next: any) => Promise.resolve(fn(req, res, next)).catch(next),
  getOwnerId: () => Promise.resolve(h.ownerId),
  getRequestUserId: (req: any) => req.user?.id,
}));

const { default: plaidRouter } = await import("./plaid.js");
const { authMiddleware } = await import("../middlewares/authMiddleware.js");

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(authMiddleware);
app.use("/", plaidRouter);

function bankTxn(status = "unmatched") {
  return {
    id: 41,
    status,
    description: "MENARDS 1234",
    amount: "27.28",
    date: "2026-08-27",
    transactionType: "debit",
  };
}

function validBody() {
  return {
    description: "Electrical Tape",
    vendor: "Menards",
    category: "Tools/Equipment",
    businessLine: "general_contracting",
    notes: "Service supplies",
  };
}

beforeEach(() => {
  h.ownerId = "owner-1";
  h.belongsToBusiness = true;
  h.sessions = {
    "owner-session": { user: { id: "owner-1" }, expires_at: Math.floor(Date.now() / 1000) + 3600 },
    "worker-session": { user: { id: "worker-2" }, expires_at: Math.floor(Date.now() / 1000) + 3600 },
  };
  h.selectQueue.length = 0;
  h.inserts.length = 0;
  h.updates.length = 0;
  h.lockCount = 0;
  h.missingSelects = 0;
});

afterEach(() => {
  expect(h.missingSelects).toBe(0);
  expect(h.selectQueue).toHaveLength(0);
});

describe("POST /transactions/:txnId/file-as-expense", () => {
  it("rejects a request without an authenticated user before any write", async () => {
    const response = await request(app)
      .post("/transactions/41/file-as-expense")
      .send(validBody());

    expect(response.status).toBe(401);
    expect(h.inserts).toHaveLength(0);
    expect(h.updates).toHaveLength(0);
  });

  it("rejects an authenticated non-owner before any write", async () => {
    const response = await request(app)
      .post("/transactions/41/file-as-expense")
      .set("Cookie", "sid=worker-session")
      .send(validBody());

    expect(response.status).toBe(403);
    expect(h.inserts).toHaveLength(0);
    expect(h.updates).toHaveLength(0);
  });

  it("rejects invalid expense input without reading or writing financial rows", async () => {
    const response = await request(app)
      .post("/transactions/41/file-as-expense")
      .set("Cookie", "sid=owner-session")
      .send({ ...validBody(), category: "Not a real category" });

    expect(response.status).toBe(400);
    expect(h.inserts).toHaveLength(0);
    expect(h.updates).toHaveLength(0);
    expect(h.lockCount).toBe(0);
  });

  it("rejects a job from another business without creating an expense", async () => {
    h.belongsToBusiness = false;
    h.selectQueue.push([bankTxn()], [{ businessId: 99, businessLine: "asphalt_sealing" }]);

    const response = await request(app)
      .post("/transactions/41/file-as-expense")
      .set("Cookie", "sid=owner-session")
      .send({ ...validBody(), jobId: 99 });

    expect(response.status).toBe(404);
    expect(h.inserts).toHaveLength(0);
    expect(h.updates).toHaveLength(0);
    expect(h.lockCount).toBe(0);
  });

  it("locks the bank row and copies its exact amount and date into one owned expense", async () => {
    h.selectQueue.push([bankTxn()], [bankTxn()]);

    const response = await request(app)
      .post("/transactions/41/file-as-expense")
      .set("Cookie", "sid=owner-session")
      .send(validBody());

    expect(response.status).toBe(201);
    expect(h.lockCount).toBe(1);
    expect(h.inserts).toEqual([expect.objectContaining({
      amount: "27.28",
      date: "2026-08-27",
      description: "Electrical Tape",
      vendor: "Menards",
      category: "Tools/Equipment",
      businessId: 8,
      businessLine: "general_contracting",
    })]);
    expect(h.updates).toEqual([{ status: "matched", matchedExpenseId: 501 }]);
  });

  it("returns 409 without inserting when the locked row was already matched", async () => {
    h.selectQueue.push([bankTxn()], [bankTxn("matched")]);

    const response = await request(app)
      .post("/transactions/41/file-as-expense")
      .set("Cookie", "sid=owner-session")
      .send(validBody());

    expect(response.status).toBe(409);
    expect(h.lockCount).toBe(1);
    expect(h.inserts).toHaveLength(0);
    expect(h.updates).toHaveLength(0);
  });
});