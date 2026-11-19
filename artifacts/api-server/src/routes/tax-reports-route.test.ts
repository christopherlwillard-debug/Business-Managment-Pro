import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

const h = vi.hoisted(() => ({
  queue: [] as any[][],
  projections: [] as unknown[],
  summarizedRows: [] as unknown[],
  businessSelectFilters: [] as unknown[],
}));

vi.mock("@workspace/db", () => {
  function chain(projection: unknown) {
    let table: any;
    let whereClause: unknown;
    const c: any = {
      from: (value: any) => { table = value; return c; },
      where: (condition: unknown) => { whereClause = condition; return c; },
      innerJoin: () => c,
      groupBy: () => c,
      limit: () => c,
      then(resolve: (value: any) => unknown, reject: (error: unknown) => unknown) {
        if (table?.[Symbol.for("drizzle:Name")] === "businesses") {
          h.businessSelectFilters.push(whereClause);
        }
        const value = h.queue.shift() ?? [];
        return Promise.resolve(value).then(resolve, reject);
      },
    };
    h.projections.push(projection);
    return c;
  }
  return {
    db: {
      select: (projection: unknown) => chain(projection),
      insert: () => ({ values: () => ({ returning: () => Promise.resolve([]) }) }),
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    },
  };
});

vi.mock("../lib/irs-rates.js", () => ({
  summarizeMileageRecords: (rows: unknown[]) => {
    h.summarizedRows.push(rows);
    const totalMiles = rows.reduce<number>((sum, row: any) => sum + Number(row.miles), 0);
    return {
      totalMiles,
      totalDeduction: totalMiles * 0.76,
      ratePerMile: 0.76,
      ratePeriods: [],
    };
  },
}));

vi.mock("../lib/tax-estimate.js", () => ({
  getTaxAssumptions: () => ({ mealDeductionRate: 0.5 }),
}));

vi.mock("./invoices.js", () => ({
  calcInvoiceFromStored: () => ({ subtotal: 0, taxAmount: 0, total: 0 }),
}));

vi.mock("./guards", () => ({
  sectionGuard: () => (_req: any, _res: any, next: any) => next(),
}));

const { default: taxReportsRouter } = await import("./tax-reports.js");

const app = express();
app.use(express.json());
app.use("/tax-reports", taxReportsRouter);

beforeEach(() => {
  h.queue = [
    [{ taxAssumptions: null }], // settings
    [], // paid invoices
    [], // other income
    [], // expenses
    [{ date: "2026-07-15", miles: "10", classification: "business" }], // raw mileage rows
    [{ count: 1 }], // mileage count
    [], // fixed/allocation payments
    [], // draft invoices
    [], // mileage rows without classification
  ];
  h.projections = [];
  h.summarizedRows = [];
  h.businessSelectFilters = [];
});

function containsInactiveStatusColumn(value: unknown, seen = new Set<object>()): boolean {
  if (Array.isArray(value)) return value.some(item => containsInactiveStatusColumn(item, seen));
  if (!value || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  const node = value as Record<string, unknown>;
  if (typeof node.name === "string") return node.name === "is_active";
  if (Array.isArray(node.queryChunks)) return containsInactiveStatusColumn(node.queryChunks, seen);
  return Object.keys(node)
    .filter(key => key !== "table")
    .some(key => containsInactiveStatusColumn(node[key], seen));
}

describe("GET /tax-reports/schedule-c", () => {
  it("rejects an unknown business before running any financial totals", async () => {
    h.queue = [
      [{ taxAssumptions: null }],
      [],
    ];
    const response = await request(app).get("/tax-reports/schedule-c?year=2026&businessLine=not-a-real-business");
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Unknown business");
    expect(h.queue).toHaveLength(0);
  });

  it("rejects malformed tax years instead of partially parsing them", async () => {
    h.queue = [];
    const response = await request(app).get("/tax-reports/schedule-c?year=2026oops");
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("A valid tax year is required");
    expect(h.queue).toHaveLength(0);
  });

  it("loads raw mileage rows for the effective-date mileage engine", async () => {
    const response = await request(app).get("/tax-reports/schedule-c?year=2026");

    expect(response.status).toBe(200);
    expect(response.body.mileageData.totalBusinessMiles).toBe(10);
    expect(h.summarizedRows).toEqual([
      [{ date: "2026-07-15", miles: "10", classification: "business" }],
    ]);

    const mileageProjection = h.projections.find((projection: any) =>
      projection &&
      "date" in projection &&
      "miles" in projection &&
      "classification" in projection
    ) as Record<string, unknown> | undefined;
    expect(mileageProjection).toBeDefined();
    expect(mileageProjection).not.toHaveProperty("totalMiles");
  });

  it("includes historical receipts and expenses for an inactive division", async () => {
    const inactiveDivision = {
      id: 2,
      slug: "asphalt_sealing",
      name: "Asphalt Sealing",
      parentBusinessId: null,
      isActive: false,
    };
    h.queue = [
      [{ taxAssumptions: null }], // settings
      [inactiveDivision], // selected business
      [{ id: 2, slug: "asphalt_sealing", name: "Asphalt Sealing" }], // tax owner/member
      [], // paid invoices
      [{ total: "1000.00" }], // other income
      [{
        category: "Tools/Equipment",
        amount: "125.00",
        deductibleSum: "125.00",
        explicitDeductibleCount: "0",
        count: 1,
      }], // expenses by category
      [], // mileage rows
      [], // mileage row count
      [], // fixed/allocation payments
      [], // draft invoices
      [], // mileage rows without classification
    ];

    const response = await request(app)
      .get("/tax-reports/schedule-c?year=2026&businessLine=asphalt_sealing");

    expect(response.status).toBe(200);
    expect(response.body.grossReceipts).toBe(1000);
    expect(response.body.expenses.supplies).toBe(125);
    expect(response.body.totalExpenses).toBe(125);
    expect(h.businessSelectFilters).toHaveLength(2);
    expect(h.businessSelectFilters.some(condition => containsInactiveStatusColumn(condition))).toBe(false);
    expect(h.queue).toHaveLength(0);
  });
});