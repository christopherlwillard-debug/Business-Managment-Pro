import { describe, expect, it, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";

const h = vi.hoisted(() => ({
  selectQueue: [] as any[][],
  insertCount: 0,
}));

vi.mock("@workspace/db", () => {
  function chain() {
    const c: any = {
      from: () => c,
      where: () => c,
      innerJoin: () => c,
      leftJoin: () => c,
      orderBy: () => c,
      groupBy: () => c,
      limit: () => c,
      then(resolve: (value: any) => any, reject: (error: any) => any) {
        const value = h.selectQueue.shift();
        if (value === undefined) {
          return Promise.reject(new Error("Unexpected database query")).then(resolve, reject);
        }
        return Promise.resolve(value).then(resolve, reject);
      },
    };
    return c;
  }

  return {
    db: {
      select: () => chain(),
      update: () => chain(),
      insert: () => {
        h.insertCount++;
        return chain();
      },
      delete: () => chain(),
    },
  };
});

vi.mock("../lib/business-scope.js", () => ({
  hasRequestedBusiness: () => false,
  requestedBusiness: vi.fn().mockResolvedValue(null),
  belongsToBusiness: vi.fn().mockReturnValue(true),
}));
vi.mock("./material-lists", () => ({ syncMaterialsToJobInvoice: vi.fn() }));
vi.mock("../lib/allocation.js", () => ({
  computeAllocationSplitPool: vi.fn(),
  computeSubOwed: vi.fn(),
}));
vi.mock("./invoices", () => ({
  calcInvoice: vi.fn(),
  buildInvoiceQuery: vi.fn(),
  fmt: (value: unknown) => String(value),
}));
vi.mock("../lib/productionBilling.js", () => ({
  buildProductionLineItems: vi.fn(),
  ensureProductionBillingSeed: vi.fn(),
}));

const { default: jobsRouter } = await import("./jobs");

const app = express();
app.use(express.json());
app.use("/jobs", jobsRouter);

function queueExpenseQueries({
  expenses = [],
  allocations = [],
  reimbursement = [],
}: {
  expenses?: any[];
  allocations?: any[];
  reimbursement?: any[];
} = {}) {
  h.selectQueue.push(expenses, allocations, reimbursement);
}

describe("GET /jobs/:id/expenses", () => {
  beforeEach(() => {
    h.selectQueue.length = 0;
    h.insertCount = 0;
  });

  it("returns ordinary costs with their source metadata and excludes non-job-cost rows", async () => {
    queueExpenseQueries({
      expenses: [
        {
          id: 1,
          date: "2026-08-01",
          category: "Materials",
          description: "Lumber",
          amount: "125.00",
          countsTowardJobProfit: true,
          sourceType: "Material List",
        },
        {
          id: 2,
          date: "2026-08-02",
          category: "Owner Pay",
          description: "Owner withdrawal",
          amount: "500.00",
          countsTowardJobProfit: true,
          sourceType: null,
        },
        {
          id: 3,
          date: "2026-08-03",
          category: "Subcontractor",
          description: "Sub labor",
          amount: "300.00",
          countsTowardJobProfit: true,
          sourceType: null,
        },
        {
          id: 4,
          date: "2026-08-04",
          category: "Travel",
          description: "Trip mileage",
          amount: "40.00",
          countsTowardJobProfit: false,
          sourceType: null,
        },
        {
          id: 5,
          date: "2026-08-05",
          category: "Labor",
          description: "Dewayne Lamb — Fixed Pay (outstanding)",
          amount: "800.00",
          subcontractorId: 42,
          countsTowardJobProfit: true,
          sourceType: "job_payroll",
        },
      ],
    });

    const response = await request(app).get("/jobs/10/expenses");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      expect.objectContaining({
        id: 1,
        category: "Materials",
        amount: "125.00",
        sourceType: "Material List",
      }),
    ]);
  });

  it("excludes subcontractor-linked Labor payroll from Job Costs", async () => {
    queueExpenseQueries({
      expenses: [{
        id: 21,
        date: "2026-08-05",
        category: "Labor",
        description: "Dewayne Lamb — Fixed Pay (outstanding)",
        amount: "800.00",
        subcontractorId: 42,
        countsTowardJobProfit: true,
        sourceType: "job_payroll",
      }],
    });

    const response = await request(app).get("/jobs/10/expenses");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("does not create payroll expense rows when recording outstanding sub pay", async () => {
    h.selectQueue.push([{
      subcontractorId: 42,
      compensationType: "fixed",
      fixedAmount: "800.00",
      allocationPct: null,
    }]);

    const response = await request(app).post("/jobs/10/record-sub-expenses");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, created: 0, skippedPayrollRows: 1 });
    expect(h.insertCount).toBe(0);
  });

  it("returns allocation-only costs as signed-safe synthetic detail rows", async () => {
    queueExpenseQueries({
      allocations: [{
        id: 7,
        date: "2026-08-05",
        category: "Materials",
        description: "Shared lumber",
        amount: "80.50",
        notes: "40% to this job",
      }],
    });

    const response = await request(app).get("/jobs/10/expenses");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      expect.objectContaining({
        id: -7,
        amount: 80.5,
        sourceType: "Job Allocation",
        description: "Shared lumber — allocated portion",
      }),
    ]);
  });

  it("includes a saved mileage reimbursement when no actual fuel expense exists", async () => {
    queueExpenseQueries({
      reimbursement: [{
        id: 9,
        amount: "42.75",
        recipientName: "Business owner",
        createdAt: "2026-08-06T12:00:00.000Z",
      }],
    });

    const response = await request(app).get("/jobs/10/expenses");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      expect.objectContaining({
        id: -1000009,
        category: "Mileage Reimbursement",
        amount: 42.75,
        sourceType: "Job Mileage Reimbursement",
      }),
    ]);
  });

  it("does not show a reimbursement when actual fuel replaces it in Job Costs", async () => {
    queueExpenseQueries({
      expenses: [{
        id: 11,
        date: "2026-08-07",
        category: "Fuel/Travel",
        description: "Gas station",
        amount: "65.00",
        countsTowardJobProfit: true,
        sourceType: null,
      }],
      reimbursement: [{
        id: 12,
        amount: "42.75",
        recipientName: "Business owner",
        createdAt: "2026-08-07T12:00:00.000Z",
      }],
    });

    const response = await request(app).get("/jobs/10/expenses");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      expect.objectContaining({ id: 11, category: "Fuel/Travel", amount: "65.00" }),
    ]);
    expect(response.body.some((row: any) => row.sourceType === "Job Mileage Reimbursement")).toBe(false);
  });

  it("returns an explicit empty list when no recorded cost source applies", async () => {
    queueExpenseQueries();

    const response = await request(app).get("/jobs/10/expenses");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });
});