import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

const h = vi.hoisted(() => ({
  queue: [] as any[][],
  projections: [] as unknown[],
  summarizedRows: [] as unknown[],
}));

vi.mock("@workspace/db", () => {
  function chain(projection: unknown) {
    const c: any = {
      from: () => c,
      where: () => c,
      innerJoin: () => c,
      groupBy: () => c,
      limit: () => c,
      then(resolve: (value: any) => unknown, reject: (error: unknown) => unknown) {
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
});

describe("GET /tax-reports/schedule-c", () => {
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
});