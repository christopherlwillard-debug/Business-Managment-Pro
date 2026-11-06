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
  };
  return { db: { select: () => chain } };
});

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

const { default: paymentsRouter } = await import("./payments");
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
