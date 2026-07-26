// Parity test: business-reserve estimatedTaxes must equal accounting totalEstimated
//
// The two endpoints use the same formulas but were historically computed
// independently, which led to drift when other_income rows were added.
// This test seeds both routes with identical data (including other_income rows)
// and asserts that the totals match to the cent.
//
// Select queue order:
//
//   GET /accounting?year=YEAR
//     [0-5] Promise.all([invoices, expenses, mileageLogs, subs, settings, otherIncome])
//     [6-7] computeDepreciationForYear → Promise.all([assets, assetBusinessUse])
//
//   GET /business-reserve
//     [0]   settings
//     [1-4] Promise.all([invoices, expenses, mileageLogs, otherIncome])
//     [5-6] computeDepreciationForYear → Promise.all([assets, assetBusinessUse])
//     [7]   growthFundDeployments
//     [8]   recurringExpenses
//     [9]   plaidConnections

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// ── Hoisted mutable queue ─────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  selectQueue: [] as any[][],
}));

// ── Mock @workspace/db ────────────────────────────────────────────────────────
vi.mock("@workspace/db", () => {
  function makeChain() {
    const c: any = {
      from:      () => c,
      where:     () => c,
      leftJoin:  () => c,
      innerJoin: () => c,
      orderBy:   () => c,
      groupBy:   () => c,
      limit:     () => c,
      then(resolve: (v: any) => any, reject: (e: any) => any) {
        return Promise.resolve(h.selectQueue.shift() ?? []).then(resolve, reject);
      },
    };
    return c;
  }
  return {
    db: {
      select: () => makeChain(),
      insert: () => ({ values: () => ({ returning: () => Promise.resolve([]) }) }),
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
      delete: () => ({ where: () => Promise.resolve() }),
    },
    // Export symbol so the router's top-level destructure doesn't throw
    plaidConnectionsTable: {},
  };
});

// ── Stub imported helpers ──────────────────────────────────────────────────────
vi.mock("./subcontractors",       () => ({ computeYtd: vi.fn().mockResolvedValue(0) }));
vi.mock("./guards",               () => ({
  sectionGuard: () => (_req: any, _res: any, next: any) => next(),
  ownerGuard:   () => (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../lib/irs-rates.js",    () => ({ getIrsMileageRate: vi.fn().mockResolvedValue(0.67) }));
vi.mock("../lib/allocation.js",   () => ({ computeAllocationSplitPools: vi.fn().mockResolvedValue([]) }));

// Import the router after mocks are in place
const { default: reportsRouter } = await import("./reports");

const app = express();
app.use(express.json());
app.use((_req, _res, next) => {
  (_req as any).user = { id: 1, claims: { sub: "user_1" } };
  next();
});
app.use("/reports", reportsRouter);

beforeEach(() => {
  h.selectQueue.length = 0;
});

// ── Shared seed data ───────────────────────────────────────────────────────────
// One paid invoice in Owensboro + one other_income row in Owensboro.
// The other_income row is the class of bug that was fixed: it must be included
// in both the OCC tax base and the netProfit base.

const YEAR = new Date().getFullYear();

const PAID_INVOICE = {
  id: 1,
  status: "paid",
  subtotal: "1000.00",
  taxAmount: "0",
  total: "1000.00",
  issueDate: `${YEAR}-06-01`,
  invoiceCity: "Owensboro",
  invoiceState: "KY",
  jobCity: null,
  jobState: null,
  clientName: "Test Client",
  invoiceNumber: "INV-001",
  businessLine: null,
  // business-reserve also fetches jobId
  jobId: null,
};

const OTHER_INCOME_ROW = {
  id: 1,
  amount: "200.00",
  date: `${YEAR}-06-01`,
  city: "Owensboro",
  state: "KY",
  businessLine: null,
};

const SETTINGS_ROW = {
  mileageRate: "0.67",
  operatingReserveMode: "0",
  operatingReserveCustom: null,
  includeGrowthFundInReserve: 0,
};

// Helper: push the 8 selects consumed by GET /accounting (no subs, no depreciation)
function pushAccountingSelects() {
  // [0] invoices
  h.selectQueue.push([PAID_INVOICE]);
  // [1] expenses
  h.selectQueue.push([]);
  // [2] mileageLogs
  h.selectQueue.push([]);
  // [3] subs — empty so computeYtd is never called
  h.selectQueue.push([]);
  // [4] settings
  h.selectQueue.push([SETTINGS_ROW]);
  // [5] otherIncome
  h.selectQueue.push([OTHER_INCOME_ROW]);
  // [6-7] computeDepreciationForYear → assets, assetBusinessUse (both empty → $0 depreciation)
  h.selectQueue.push([]); // assets
  h.selectQueue.push([]); // assetBusinessUse
}

// Helper: push the 10 selects consumed by GET /business-reserve
// (invoice has jobId=null → jobIds empty → subHoursRows step is skipped)
function pushBusinessReserveSelects() {
  // [0] settings
  h.selectQueue.push([SETTINGS_ROW]);
  // [1] invoices
  h.selectQueue.push([PAID_INVOICE]);
  // [2] expenses
  h.selectQueue.push([]);
  // [3] mileageLogs
  h.selectQueue.push([]);
  // [4] otherIncome
  h.selectQueue.push([OTHER_INCOME_ROW]);
  // jobIds is empty → no subHoursRows select
  // [5-6] computeDepreciationForYear → assets, assetBusinessUse
  h.selectQueue.push([]); // assets
  h.selectQueue.push([]); // assetBusinessUse
  // [7] growthFundDeployments
  h.selectQueue.push([]);
  // [8] recurringExpenses
  h.selectQueue.push([]);
  // [9] plaidConnections
  h.selectQueue.push([]);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Reserve tax parity — estimatedTaxes invariant", () => {

  it("accounting totalEstimated equals business-reserve estimatedTaxes with only invoice revenue", async () => {
    // Seed accounting with invoice only (no other income)
    h.selectQueue.push([PAID_INVOICE]); // invoices
    h.selectQueue.push([]);             // expenses
    h.selectQueue.push([]);             // mileageLogs
    h.selectQueue.push([]);             // subs
    h.selectQueue.push([SETTINGS_ROW]);  // settings
    h.selectQueue.push([]);             // otherIncome — none
    h.selectQueue.push([]);             // assets
    h.selectQueue.push([]);             // assetBusinessUse

    const accRes = await request(app).get(`/reports/accounting?year=${YEAR}`);
    expect(accRes.status).toBe(200);
    const accTotal = accRes.body.estimatedTaxes.totalEstimated as number;

    // Now seed business-reserve with the same invoice only
    h.selectQueue.push([SETTINGS_ROW]);   // settings
    h.selectQueue.push([PAID_INVOICE]);   // invoices
    h.selectQueue.push([]);              // expenses
    h.selectQueue.push([]);              // mileageLogs
    h.selectQueue.push([]);              // otherIncome — none
    h.selectQueue.push([]);              // assets
    h.selectQueue.push([]);              // assetBusinessUse
    h.selectQueue.push([]);              // growthFundDeployments
    h.selectQueue.push([]);              // recurringExpenses
    h.selectQueue.push([]);              // plaidConnections

    const brRes = await request(app).get("/reports/business-reserve");
    expect(brRes.status).toBe(200);
    const brTotal = brRes.body.estimatedTaxes as number;

    expect(brTotal).toBeCloseTo(accTotal, 10);
  });

  it("accounting totalEstimated equals business-reserve estimatedTaxes when other_income rows exist (the bug class)", async () => {
    // This is the scenario that was broken: other_income was excluded from the
    // OCC tax base in business-reserve while accounting included it.
    pushAccountingSelects();
    const accRes = await request(app).get(`/reports/accounting?year=${YEAR}`);
    expect(accRes.status).toBe(200);

    const accTaxes = accRes.body.estimatedTaxes as {
      owensboroOccTax: number;
      kyStateTax: number;
      federalSETax: number;
      totalEstimated: number;
    };

    pushBusinessReserveSelects();
    const brRes = await request(app).get("/reports/business-reserve");
    expect(brRes.status).toBe(200);

    const brTotal: number = brRes.body.estimatedTaxes;
    const brBreakdown = brRes.body.taxBreakdown as {
      federalSE: number;
      kyState: number;
      occ: number;
    };

    // Top-level totals must match
    expect(brTotal).toBeCloseTo(accTaxes.totalEstimated, 10);

    // Each component must match too — catches partial regressions
    expect(brBreakdown.occ).toBeCloseTo(accTaxes.owensboroOccTax, 10);
    expect(brBreakdown.kyState).toBeCloseTo(accTaxes.kyStateTax, 10);
    expect(brBreakdown.federalSE).toBeCloseTo(accTaxes.federalSETax, 10);
  });

  it("other_income is included in the OCC tax base (owensboroGross) on both routes", async () => {
    // Without other_income: revenue = $1 000 → OCC = 1000 * 0.0139 = $13.90
    // With other_income:    revenue = $1 200 → OCC = 1200 * 0.0139 = $16.68
    // This test confirms the WITH-other-income value is returned by both routes.
    const OCC_RATE = 0.0139;
    const expectedOcc = (1000 + 200) * OCC_RATE; // $16.68

    pushAccountingSelects();
    const accRes = await request(app).get(`/reports/accounting?year=${YEAR}`);
    expect(accRes.status).toBe(200);
    expect(accRes.body.estimatedTaxes.owensboroOccTax).toBeCloseTo(expectedOcc, 10);

    pushBusinessReserveSelects();
    const brRes = await request(app).get("/reports/business-reserve");
    expect(brRes.status).toBe(200);
    expect(brRes.body.taxBreakdown.occ).toBeCloseTo(expectedOcc, 10);
  });

  it("other_income is included in netProfit base for KY state and federal SE taxes on both routes", async () => {
    // netProfit = paidRevenue - expenses = (1000 invoice + 200 other income) - 0 = 1200
    const NET_PROFIT = 1200;
    const expectedKy      = NET_PROFIT * 0.04;
    const expectedFederal = NET_PROFIT * 0.9235 * 0.153;

    pushAccountingSelects();
    const accRes = await request(app).get(`/reports/accounting?year=${YEAR}`);
    expect(accRes.status).toBe(200);
    expect(accRes.body.estimatedTaxes.kyStateTax).toBeCloseTo(expectedKy, 10);
    expect(accRes.body.estimatedTaxes.federalSETax).toBeCloseTo(expectedFederal, 10);

    pushBusinessReserveSelects();
    const brRes = await request(app).get("/reports/business-reserve");
    expect(brRes.status).toBe(200);
    expect(brRes.body.taxBreakdown.kyState).toBeCloseTo(expectedKy, 10);
    expect(brRes.body.taxBreakdown.federalSE).toBeCloseTo(expectedFederal, 10);
  });
});
