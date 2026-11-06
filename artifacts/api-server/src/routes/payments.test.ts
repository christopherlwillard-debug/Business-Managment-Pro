import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";

const h = vi.hoisted(() => ({
  rows: [] as any[],
  scope: null as any,
  requestedBusiness: vi.fn(),
  queryConditions: [] as any[],
}));

vi.mock("@workspace/db", () => {
  const chain: any = {
    from: () => chain,
    leftJoin: () => chain,
    orderBy: () => Promise.resolve(h.rows),
    where: (condition: unknown) => {
      h.queryConditions.push(condition);
      return chain;
    },
    then: (resolve: (value: any) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(h.rows).then(resolve, reject),
  };
  return { db: { select: () => chain } };
});

vi.mock("drizzle-orm", () => ({
  eq: (...args: unknown[]) => ({ operator: "eq", args }),
  and: (...args: unknown[]) => ({ operator: "and", args }),
  desc: (...args: unknown[]) => ({ operator: "desc", args }),
}));

vi.mock("@workspace/db/schema", () => ({
  paymentsTable: {
    id: "payments.id",
    subcontractorId: "payments.subcontractor_id",
    businessId: "payments.business_id",
    amount: "payments.amount",
    paymentDate: "payments.payment_date",
    year: "payments.year",
    description: "payments.description",
    invoiceNumber: "payments.invoice_number",
    notes: "payments.notes",
    paymentMethod: "payments.payment_method",
    createdAt: "payments.created_at",
  },
  subcontractorsTable: { id: "subcontractors.id", name: "subcontractors.name" },
}));

vi.mock("../lib/business-scope.js", () => ({
  requestedBusiness: h.requestedBusiness,
  hasRequestedBusiness: () => h.scope !== null,
  invalidBusinessScope: () => false,
  resolveMutationBusiness: async () => ({ ok: true, explicit: false, business: { id: 1, slug: "general_contracting" } }),
  mutationBusinessPredicate: () => ({ scoped: true }),
}));

const { default: paymentsRouter, parseSubcontractorPaymentAmount, isValidPaymentDate } = await import("./payments");
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).user = { id: 1, claims: { sub: "test-user" } };
  next();
});
app.use("/", paymentsRouter);

beforeEach(() => {
  h.rows = [];
  h.scope = { id: 9, slug: "asphalt_sealing" };
  h.requestedBusiness.mockImplementation(async () => h.scope);
  h.queryConditions.length = 0;
});

afterEach(() => vi.clearAllMocks());

describe("subcontractor payment input validation", () => {
  it("normalizes valid payment amounts and rejects malformed values", () => {
    expect(parseSubcontractorPaymentAmount("125.5")).toBe("125.50");
    expect(parseSubcontractorPaymentAmount(20)).toBe("20.00");
    for (const value of ["0", "-5", "10junk", "1e3", "1.999", "10000000000.00", "Infinity"]) {
      expect(parseSubcontractorPaymentAmount(value)).toBeNull();
    }
  });

  it("accepts only real calendar dates", () => {
    expect(isValidPaymentDate("2026-11-06")).toBe(true);
    expect(isValidPaymentDate("2026-02-30")).toBe(false);
    expect(isValidPaymentDate("2026-13-01")).toBe(false);
    expect(isValidPaymentDate("2026-2-01")).toBe(false);
  });
});

describe("subcontractor payment read business scope", () => {
  it("adds the selected business predicate to payment list reads", async () => {
    h.rows = [{
      id: 12, subcontractorId: 3, subcontractorName: "Sub",
      amount: "125.00", paymentDate: "2026-11-01", year: 2026,
      description: null, invoiceNumber: null, notes: null,
      paymentMethod: null, createdAt: new Date("2026-11-01T12:00:00Z"),
    }];

    const response = await request(app).get("/?year=2026");

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(h.queryConditions).toHaveLength(1);
    expect(h.queryConditions[0]).toBeTruthy();
    expect(h.requestedBusiness).toHaveBeenCalledTimes(1);
  });

  it("does not return a payment owned by a different selected business", async () => {
    h.rows = [];
    const response = await request(app).get("/12");
    expect(response.status).toBe(404);
    expect(h.queryConditions).toHaveLength(1);
    expect(h.requestedBusiness).toHaveBeenCalledTimes(1);
  });

  it("preserves the existing all-business list when no business is selected", async () => {
    h.scope = null;
    h.rows = [];
    const response = await request(app).get("/");
    expect(response.status).toBe(200);
    expect(h.queryConditions).toHaveLength(0);
  });
});
