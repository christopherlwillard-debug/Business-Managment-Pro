// Profit & Loss report — owner-draw exclusion regression tests
//
// Guards that all three owner-pay category names (Owner Draw, Owner Compensation,
// Owner Withdrawal) are absent from deductible expense totals and net profit on
// GET /reports/profit-loss.
//
// /profit-loss is a third, independent calculation path from /year-end and
// /accounting. The owner-draw exclusion on this route lives in JS (lines ~1100–1107
// of reports.ts): expenses matching the three category names are routed to
// ownerActivity.ownerDrawTotal and skipped from the P&L buckets via `continue`.
//
// A silent regression here would corrupt the Schedule C category totals users
// show their accountant and any tax prep software that ingests the P&L export.
//
// Queue order for GET /profit-loss (no blFilter, no hourly sub rows):
//
//   Promise.all([invRows, expRows, mileRows, otherRows, plSubPayRows])
//   [0]  invRows              — invoices (issueDate-bounded)
//   [1]  expRows              — expenses (date-bounded, ne mileage already at DB level)
//   [2]  mileRows             — mileage aggregate {totalMiles, totalDed}
//   [3]  otherRows            — otherIncome
//   [4]  plSubPayRows         — fixed/allocation sub_payment_records (Task #1912)
//
//   Then sequentially:
//   [5]  outstandingSubRows   — job_subcontractors innerJoin jobs innerJoin subs
//   [6]  closedCountRow       — count of closed jobs in year
//
//   Then Promise.all([computeDepreciationForYear, ownerContribRows, settingsRows, computeOwnerWaterfall]):
//     computeDepreciationForYear fires its own Promise.all([assets, busUseRows])
//   [7]  assets               — assetsTable (inside computeDepreciationForYear)
//   [8]  busUseRows           — assetBusinessUseTable (inside computeDepreciationForYear)
//   [9]  ownerContribRows     — owner_capital_entries
//   [10] settingsRows         — settings (federalTaxElection)
//   [11] waterfallPaidInvs    — computeOwnerWaterfall paid invoices (Task #1913)

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";

// ── Hoisted mutable queue ─────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  selectQueue: [] as any[][],
  consumedSlots: 0,
  missingSlots: [] as number[],
  strict: true,
  scenario: "no request",
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
        const slot = h.consumedSlots++;
        const queued = h.selectQueue.shift();
        if (queued === undefined) {
          h.missingSlots.push(slot);
          if (h.strict) {
            return Promise.reject(new Error(
              `[${h.scenario}] missing queued report query slot [${slot}]`,
            )).then(resolve, reject);
          }
          return Promise.resolve([]).then(resolve, reject);
        }
        return Promise.resolve(queued).then(resolve, reject);
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
    plaidConnectionsTable: {},
  };
});

// ── Stub imported helpers ─────────────────────────────────────────────────────
vi.mock("./subcontractors",     () => ({ computeYtd: vi.fn().mockResolvedValue(0) }));
vi.mock("./guards",             () => ({
  sectionGuard: () => (_req: any, _res: any, next: any) => next(),
  ownerGuard:   () => (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../lib/irs-rates.js",  () => ({ getIrsMileageRate: vi.fn().mockReturnValue(0.67) }));
vi.mock("../lib/allocation.js", () => ({
  computeAllocationSplitPools: vi.fn().mockResolvedValue([]),
  computeSubOwed:              vi.fn().mockReturnValue(0),
}));

// Import the router after mocks are in place
const { default: reportsRouter } = await import("./reports");

const app = express();
app.use(express.json());
app.use((_req, _res, next) => {
  h.scenario = `${_req.method} ${_req.path}`;
  (_req as any).user = { id: 1, claims: { sub: "user_1" } };
  next();
});
app.use("/reports", reportsRouter);

beforeEach(() => {
  h.selectQueue.length = 0;
  h.consumedSlots = 0;
  h.missingSlots.length = 0;
  h.strict = true;
  h.scenario = "no request";
});

afterEach(() => {
  if (!h.strict) return;
  expect(
    h.missingSlots,
    `[${h.scenario}] missing queued report query slot(s)`,
  ).toHaveLength(0);
  expect(
    h.selectQueue,
    `[${h.scenario}] unconsumed queued report query slot(s) after ${h.consumedSlots} consumed`,
  ).toHaveLength(0);
});

// ── Shared fixtures ───────────────────────────────────────────────────────────

const YEAR = new Date().getFullYear();

// Paid invoice issued and paid within YEAR — P&L uses issueDate-bounded query
const PAID_INVOICE = {
  id: 1,
  status: "paid",
  issueDate: `${YEAR}-06-01`,
  total: "1000.00",
};

// Ordinary deductible expense — must always appear in P&L operating expense totals
const REGULAR_EXP = {
  id: 10,
  category: "Supplies",
  amount: "100.00",
  excludeFromNetProfit: false,
};

// Empty mileage aggregate (no business trips logged)
const NO_MILEAGE = [{ totalMiles: null, totalDed: null }];

/**
 * Push all 12 select slots consumed by GET /profit-loss (no blFilter).
 * Updated for Task #1913: computeOwnerWaterfall paidInvs slot added at [11].
 *
 * Queue order:
 *   [0]  invRows              — invoices (issueDate-bounded)
 *   [1]  expRows              — expenses (ne mileage at DB level)
 *   [2]  mileRows             — mileage aggregate
 *   [3]  otherRows            — otherIncome
 *   [4]  plSubPayRows         — fixed/allocation sub_payment_records
 *   [5]  outstandingSubRows   — job_subcontractors (unpaid/partial)
 *   [6]  closedCountRow       — count of closed jobs in year
 *   [7]  assets               — computeDepreciationForYear
 *   [8]  busUseRows           — computeDepreciationForYear
 *   [9]  ownerContribRows     — owner_capital_entries
 *   [10] settingsRows         — settings (federalTaxElection)
 *   [11] waterfallPaidInvs    — computeOwnerWaterfall (no jobId in fixture → no subHours query)
 *
 * @param expSlot — the expenses array to place in slot [1]
 * @param subPaySlot — the sub_payment_records array for slot [4] (default [])
 */
function pushPLSelects(
  expSlot: any[],
  subPaySlot: any[] = [],
  outstandingSubSlot: any[] = [],
  hourlyCostSlot: any[] = [],
): void {
  h.selectQueue.push([PAID_INVOICE]);  // [0] invRows
  h.selectQueue.push(expSlot);         // [1] expRows
  h.selectQueue.push(NO_MILEAGE);      // [2] mileRows (aggregate)
  h.selectQueue.push([]);              // [3] otherRows
  h.selectQueue.push(subPaySlot);      // [4] plSubPayRows
  h.selectQueue.push(outstandingSubSlot); // [5] outstandingSubRows
  if (outstandingSubSlot.some(r => r.compensationType === "hourly")) {
    h.selectQueue.push(hourlyCostSlot); // [6] hourly hours × rate_snapshot
  }
  h.selectQueue.push([{ n: 0 }]);     // closedCountRow
  h.selectQueue.push([]);              // assets (computeDepreciationForYear)
  h.selectQueue.push([]);              // busUseRows (computeDepreciationForYear)
  // computeOwnerWaterfall fires its first await synchronously before the outer
  // Promise.all calls .then() on the two direct chain objects (ownerContribRows, settingsRows).
  h.selectQueue.push([]);             // [9]  waterfallPaidInvs (no jobId → no subHours query)
  h.selectQueue.push([]);              // [10] ownerContribRows
  h.selectQueue.push([{}]);            // [11] settingsRows (federalTaxElection optional)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("P&L report — owner-draw exclusion from operating expenses and net profit", () => {

  // ── 1. "Owner Draw" category ──────────────────────────────────────────────

  it("'Owner Draw' is excluded from totalOperatingExpenses and netProfit", async () => {
    const OWNER_DRAW = { id: 20, category: "Owner Draw", amount: "500.00", excludeFromNetProfit: false };
    pushPLSelects([OWNER_DRAW, REGULAR_EXP]);

    const res = await request(app).get(`/reports/profit-loss?year=${YEAR}`);
    expect(res.status).toBe(200);

    // totalOperatingExpenses = $100 (Supplies only) — regression would produce $600
    expect(res.body.totalOperatingExpenses).toBeCloseTo(100, 10);

    // netProfit = grossRevenue($1 000) - cogs($0) - totalOperatingExpenses($100)
    //           - mileageDeduction($0) - depreciationDeduction($0) = $900
    // Regression (draw included): $400
    expect(res.body.netProfit).toBeCloseTo(900, 10);

    // ownerActivity.ownerDrawTotal must capture the excluded amount
    expect(res.body.ownerActivity.ownerDrawTotal).toBeCloseTo(500, 10);
  });

  // ── 2. "Owner Compensation" category ─────────────────────────────────────

  it("'Owner Compensation' is excluded from totalOperatingExpenses and netProfit", async () => {
    const OWNER_COMP = { id: 21, category: "Owner Compensation", amount: "400.00", excludeFromNetProfit: false };
    pushPLSelects([OWNER_COMP, REGULAR_EXP]);

    const res = await request(app).get(`/reports/profit-loss?year=${YEAR}`);
    expect(res.status).toBe(200);

    expect(res.body.totalOperatingExpenses).toBeCloseTo(100, 10);
    expect(res.body.netProfit).toBeCloseTo(900, 10);
    expect(res.body.ownerActivity.ownerDrawTotal).toBeCloseTo(400, 10);
  });

  // ── 3. "Owner Withdrawal" category ───────────────────────────────────────

  it("'Owner Withdrawal' is excluded from totalOperatingExpenses and netProfit", async () => {
    const OWNER_WITHDRAWAL = { id: 22, category: "Owner Withdrawal", amount: "300.00", excludeFromNetProfit: false };
    pushPLSelects([OWNER_WITHDRAWAL, REGULAR_EXP]);

    const res = await request(app).get(`/reports/profit-loss?year=${YEAR}`);
    expect(res.status).toBe(200);

    expect(res.body.totalOperatingExpenses).toBeCloseTo(100, 10);
    expect(res.body.netProfit).toBeCloseTo(900, 10);
    expect(res.body.ownerActivity.ownerDrawTotal).toBeCloseTo(300, 10);
  });

  // ── 4. All three names absent from operatingExpenses array ───────────────

  it("all three owner-pay categories are absent from operatingExpenses entries", async () => {
    const draws = [
      { id: 20, category: "Owner Draw",         amount: "500.00", excludeFromNetProfit: false },
      { id: 21, category: "Owner Compensation",  amount: "400.00", excludeFromNetProfit: false },
      { id: 22, category: "Owner Withdrawal",    amount: "300.00", excludeFromNetProfit: false },
    ];
    pushPLSelects([...draws, REGULAR_EXP]);

    const res = await request(app).get(`/reports/profit-loss?year=${YEAR}`);
    expect(res.status).toBe(200);

    // No operating-expense line should reference any owner-pay amount ($300, $400, $500)
    const ownAmounts = [300, 400, 500];
    for (const entry of res.body.operatingExpenses as { label: string; amount: number }[]) {
      expect(ownAmounts).not.toContain(entry.amount);
      expect(entry.label.toLowerCase()).not.toMatch(/owner/);
    }

    // Totals reflect only the $100 Supplies row
    expect(res.body.totalOperatingExpenses).toBeCloseTo(100, 10);
    expect(res.body.netProfit).toBeCloseTo(900, 10);

    // Combined ownerDrawTotal = $1 200
    expect(res.body.ownerActivity.ownerDrawTotal).toBeCloseTo(1200, 10);
  });

  // ── 5. Regular expenses are not over-excluded ─────────────────────────────

  it("regular Supplies expense still counts in totalOperatingExpenses when no draws present", async () => {
    pushPLSelects([REGULAR_EXP]);

    const res = await request(app).get(`/reports/profit-loss?year=${YEAR}`);
    expect(res.status).toBe(200);

    // totalOperatingExpenses must equal $100 — no over-exclusion
    expect(res.body.totalOperatingExpenses).toBeCloseTo(100, 10);
    expect(res.body.netProfit).toBeCloseTo(900, 10);

    // ownerDrawTotal must be zero when no draws are present
    expect(res.body.ownerActivity.ownerDrawTotal).toBeCloseTo(0, 10);
  });

  it("shows an unpaid hourly sub using logged hours and rate_snapshot when amountOwed is null", async () => {
    const HOURLY_OUTSTANDING = {
      subName: "Hourly Sub",
      jobTitle: "Kitchen remodel",
      jobId: 42,
      subcontractorId: 7,
      amountOwed: null,
      fixedAmount: null,
      amountPaid: "15.00",
      compensationType: "hourly",
      businessLine: null,
    };

    pushPLSelects(
      [],
      [],
      [HOURLY_OUTSTANDING],
      [{ jobId: 42, subcontractorId: 7, cost: "75.00" }],
    );

    const res = await request(app).get(`/reports/profit-loss?year=${YEAR}`);
    expect(res.status).toBe(200);

    expect(res.body.outstandingSubLiability.total).toBeCloseTo(60, 10);
    expect(res.body.outstandingSubLiability.items).toEqual([
      expect.objectContaining({
        subName: "Hourly Sub",
        jobTitle: "Kitchen remodel",
        compensationType: "hourly",
        amount: 60,
      }),
    ]);
  });

  // ── 6. netOperatingIncome reflects exclusion before deductions ────────────
  //
  // netOperatingIncome = grossProfit - totalOperatingExpenses.
  // Deductions (mileage, depreciation) are applied after.
  // This test checks the intermediate figure is also correct.

  it("netOperatingIncome excludes owner draws even before mileage/depreciation are subtracted", async () => {
    const OWNER_DRAW = { id: 20, category: "Owner Draw", amount: "500.00", excludeFromNetProfit: false };
    pushPLSelects([OWNER_DRAW, REGULAR_EXP]);

    const res = await request(app).get(`/reports/profit-loss?year=${YEAR}`);
    expect(res.status).toBe(200);

    // grossRevenue=$1 000, cogs=$0 → grossProfit=$1 000
    // totalOperatingExpenses=$100 → netOperatingIncome=$900
    // Regression: totalOperatingExpenses=$600 → netOperatingIncome=$400
    expect(res.body.netOperatingIncome).toBeCloseTo(900, 10);
  });
});
