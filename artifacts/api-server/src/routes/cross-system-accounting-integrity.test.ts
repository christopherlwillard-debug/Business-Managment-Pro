// Cross-system accounting integrity tests
//
// Asserts that key financial invariants hold consistently across the
// /profit-loss, /accounting, and /year-end report endpoints:
//
//   1. ownerActivity block is present on all three endpoints with the
//      required fields (ownerAllocated, ownerTaxReserve, ownerCashTaken,
//      ownerRetained, ownerOverWithdrawal).
//   2. ownerTaxReserve = ownerAllocated × 0.25 (waterfall constant).
//   3. ownerRetained   = max(0, ownerAllocated − ownerTaxReserve − ownerCashTaken).
//   4. ownerOverWithdrawal > 0 iff cashTaken > (ownerAllocated − taxReserve).
//   5. Owner draws (ownerCashTaken) do NOT reduce netProfit — netProfit only
//      reflects deductible business expenses.
//   6. ownerAllocated is never negative.
//
// Sign convention for owner_capital_entries (also asserted by the sign test):
//   positive amount = capital contribution (cash into business)
//   negative amount = capital withdrawal (cash out; not tested here — UI
//                     currently stores all amounts positive)
//
// ── Queue orders ──────────────────────────────────────────────────────────────
//
//   GET /profit-loss (no blFilter):
//     [0]  invRows              — invoices (issueDate-bounded)
//     [1]  expRows              — expenses
//     [2]  mileRows             — mileage aggregate
//     [3]  otherRows            — otherIncome
//     [4]  plSubPayRows         — fixed/allocation sub_payment_records
//     [5]  outstandingSubRows   — job_subcontractors
//     [6]  closedCountRow       — count of closed jobs
//     [7]  assets               — computeDepreciationForYear
//     [8]  busUseRows           — computeDepreciationForYear
//     [9]  ownerContribRows     — owner_capital_entries
//     [10] settingsRows         — settings
//     [11] waterfallPaidInvs    — computeOwnerWaterfall (jobId=null → no subHours)
//
//   GET /accounting (no blFilter):
//     [0]  paidInvoices
//     [1]  nonPaidInvoices
//     [2]  expenses
//     [3]  mileageLogs
//     [4]  subs
//     [5]  settings
//     [6]  otherIncome
//     [7]  accFixedAllocSubPayments
//     [8]  assets               — computeDepreciationForYear
//     [9]  assetBusinessUse     — computeDepreciationForYear
//     [10] waterfallPaidInvs    — computeOwnerWaterfall (fires synchronously first)
//     [11] accOwnerContribRows  — ownerCapitalEntries (4th chain in same Promise.all)
//     then: allBusinesses, outstandingSubRows from empty queue → []
//
//   GET /year-end (no blFilter):
//     [0-9] large Promise.all (invoices, expenses, mileage, otherIncome, assets,
//            taxPayments, subs, settings, busUseRows, fixedAllocSubPayments)
//     then sequential computations (no extra selects until ownerActivity)
//     [10] ownerContribRows     — added by ownerActivity block
//     [11] waterfallPaidInvs    — computeOwnerWaterfall
//     (year-end has no existing tests so slot positions are set by this file)

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

// $1 000 paid invoice, no jobId → waterfall subLaborCost = 0
// ownerAllocated = 1000 × (1 − 0.05) × 0.50 = 475.00
// ownerTaxReserve = 475 × 0.25 = 118.75
const PAID_INVOICE_PL = {
  id: 1,
  status: "paid",
  issueDate: `${YEAR}-06-01`,
  total: "1000.00",
  lineItems: [{ description: "Test service", quantity: 1, unitPrice: 1000 }],
};

// Waterfall invoice: must include stripePaidAt/squarePaidAt/issueDate so the
// JS effective-payment-date filter inside computeOwnerWaterfall can attribute it
// to the correct year. null Stripe/Square dates → falls back to issueDate.
const WATERFALL_INVOICE = {
  jobId: null,
  total: "1000.00",
  stripePaidAt: null,
  squarePaidAt: null,
  issueDate: `${YEAR}-06-01`,
};

// $200 owner draw — excluded from netProfit but counts as ownerCashTaken
const OWNER_DRAW_EXP = {
  id: 10,
  category: "Owner Draw",
  amount: "200.00",
  description: "Owner draw",
  excludeFromNetProfit: false,
};

// $100 regular materials expense — reduces netProfit
const MATERIALS_EXP = {
  id: 11,
  category: "Materials",
  amount: "100.00",
  description: "Lumber",
  excludeFromNetProfit: false,
};

const NO_MILEAGE = [{ totalMiles: null, totalDed: null }];

// Expected waterfall values for a $1 000 revenue, no sub labor
const EXPECTED_OWNER_ALLOCATED   = 1000 * (1 - 0.05) * 0.50;      // 475.00
const EXPECTED_TAX_RESERVE       = EXPECTED_OWNER_ALLOCATED * 0.25; // 118.75
const EXPECTED_CASH_TAKEN        = 200;                             // owner draw expense
const EXPECTED_OWNER_RETAINED    = Math.max(0, EXPECTED_OWNER_ALLOCATED - EXPECTED_TAX_RESERVE - EXPECTED_CASH_TAKEN);
// 475 - 118.75 - 200 = 156.25
const EXPECTED_OVER_WITHDRAWAL   = Math.max(0, EXPECTED_CASH_TAKEN - (EXPECTED_OWNER_ALLOCATED - EXPECTED_TAX_RESERVE));
// max(0, 200 - 356.25) = 0

// ── Helpers ───────────────────────────────────────────────────────────────────

function pushProfitLoss() {
  h.selectQueue.push([PAID_INVOICE_PL]);            // [0] invRows
  h.selectQueue.push([OWNER_DRAW_EXP, MATERIALS_EXP]); // [1] expRows
  h.selectQueue.push(NO_MILEAGE);                   // [2] mileRows
  h.selectQueue.push([]);                           // [3] otherRows
  h.selectQueue.push([]);                           // [4] plSubPayRows
  h.selectQueue.push([]);                           // [5] outstandingSubRows
  h.selectQueue.push([{ n: 0 }]);                  // [6] closedCountRow
  h.selectQueue.push([]);                           // [7] assets
  h.selectQueue.push([]);                           // [8] busUseRows
  // computeOwnerWaterfall fires its first await synchronously before the outer
  // Promise.all calls .then() on the two direct chain objects (ownerContribRows, settingsRows).
  h.selectQueue.push([WATERFALL_INVOICE]);          // [9]  waterfallPaidInvs
  h.selectQueue.push([]);                           // [10] ownerContribRows
  h.selectQueue.push([{}]);                         // [11] settingsRows
}

// Accounting invoice needs city/state/name/number/businessLine/status fields
const ACC_INVOICE = {
  id: 1,
  status: "paid",
  subtotal: "1000.00",
  taxAmount: "0",
  total: "1000.00",
  issueDate: `${YEAR}-06-01`,
  stripePaidAt: null,
  squarePaidAt: null,
  invoiceCity: "Owensboro",
  invoiceState: "KY",
  jobCity: null,
  jobState: null,
  clientName: "Test Client",
  invoiceNumber: "INV-001",
  businessLine: null,
  lineItems: [{ description: "Test service", quantity: 1, unitPrice: 1000 }],
};

const ACC_OWNER_DRAW = {
  id: 20,
  date: `${YEAR}-06-15`,
  amount: "200.00",
  category: "Owner Draw",
  businessLine: null,
  jobId: null,
  excludeFromNetProfit: false,
  description: "Owner draw",
  vendor: null,
  notes: null,
};

const ACC_MATERIALS = {
  id: 21,
  date: `${YEAR}-06-15`,
  amount: "100.00",
  category: "Materials",
  businessLine: null,
  jobId: null,
  excludeFromNetProfit: false,
  description: "Lumber",
  vendor: null,
  notes: null,
};

const ACC_SETTINGS = {
  mileageRate: "0.67",
  operatingReserveMode: "0",
  operatingReserveCustom: null,
  includeGrowthFundInReserve: 0,
};

function pushAccounting() {
  h.selectQueue.push([ACC_INVOICE]);                        // [0] paidInvoices
  h.selectQueue.push([]);                                   // [1] nonPaidInvoices
  h.selectQueue.push([ACC_OWNER_DRAW, ACC_MATERIALS]);       // [2] expenses
  h.selectQueue.push([]);                                   // [3] mileageLogs
  h.selectQueue.push([]);                                   // [4] subs
  h.selectQueue.push([ACC_SETTINGS]);                       // [5] settings
  h.selectQueue.push([]);                                   // [6] otherIncome
  h.selectQueue.push([]);                                   // [7] accFixedAllocSubPayments
  h.selectQueue.push([]);                                   // [8] assets
  h.selectQueue.push([]);                                   // [9] assetBusinessUse
  h.selectQueue.push([WATERFALL_INVOICE]);                  // [10] waterfallPaidInvs
  h.selectQueue.push([]);                                   // [11] accOwnerContribRows (ownerCapitalEntries)
  h.selectQueue.push([]);                                   // [12] allBusinesses
  h.selectQueue.push([]);                                   // [13] outstandingSubRows
  // allBusinesses and outstandingSubRows get [] from empty queue → fine
}

// Year-end needs a larger initial Promise.all (10 items in the route).
// All empty except invoices and settings.
const YE_INVOICE = {
  id: 1,
  invoiceNumber: "INV-001",
  status: "paid",
  issueDate: `${YEAR}-06-01`,
  total: "1000.00",
  subtotal: "1000.00",
  clientName: "Test Client",
  city: "Owensboro",
  state: "KY",
  stripePaidAt: null,
  squarePaidAt: null,
  lineItems: [{ description: "Test service", quantity: 1, unitPrice: 1000 }],
};

const YE_OWNER_DRAW = {
  id: 30,
  date: `${YEAR}-06-15`,
  amount: "200.00",
  category: "Owner Draw",
  businessLine: null,
  description: "Owner draw",
};

const YE_MATERIALS = {
  id: 31,
  date: `${YEAR}-06-15`,
  amount: "100.00",
  category: "Materials",
  businessLine: null,
  description: "Lumber",
};

const YE_SETTINGS = [{ companyName: "Test Co", thresholdAmount1099: "600", federalTaxElection: null }];

function pushYearEnd() {
  // 10-item Promise.all in the year-end route
  h.selectQueue.push([YE_INVOICE]);                         // [0] invoices (paid, status filter)
  h.selectQueue.push([YE_OWNER_DRAW, YE_MATERIALS]);        // [1] expenses
  h.selectQueue.push([]);                                   // [2] mileageLogs
  h.selectQueue.push([]);                                   // [3] otherIncome
  h.selectQueue.push([]);                                   // [4] assets
  h.selectQueue.push([]);                                   // [5] taxPayments
  h.selectQueue.push([]);                                   // [6] subs
  h.selectQueue.push(YE_SETTINGS);                          // [7] settings
  h.selectQueue.push([]);                                   // [8] busUseRows (assetBusinessUse)
  h.selectQueue.push([]);                                   // [9] fixedAllocSubPayments
  // After Promise.all: sequential year-end computation (no extra selects until ownerActivity).
  // computeYtd is mocked → no selects for sub YTD.
  // computeYearEndDepreciation is skipped (no assets).
  // ownerActivity block:
  h.selectQueue.push([]);                                   // [10] yeOwnerContribRows
  h.selectQueue.push([WATERFALL_INVOICE]);                  // [11] waterfallPaidInvs
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ownerActivity block — P&L route invariants", () => {
  it("has all 7 required fields on /profit-loss response", async () => {
    pushProfitLoss();
    const res = await request(app).get(`/reports/profit-loss?year=${YEAR}`);
    expect(res.status).toBe(200);
    const oa = res.body.ownerActivity;
    expect(oa).toBeDefined();
    // Core waterfall fields
    expect(typeof oa.ownerAllocated).toBe("number");
    expect(typeof oa.ownerTaxReserve).toBe("number");
    expect(typeof oa.ownerCashTaken).toBe("number");
    expect(typeof oa.ownerRetained).toBe("number");
    expect(typeof oa.ownerOverWithdrawal).toBe("number");
    // Capital ledger fields
    expect(typeof oa.ownerDrawTotal).toBe("number");
    expect(typeof oa.ownerContributionsTotal).toBe("number");
  });

  it("ownerAllocated is computed by the waterfall formula", async () => {
    pushProfitLoss();
    const res = await request(app).get(`/reports/profit-loss?year=${YEAR}`);
    expect(res.status).toBe(200);
    expect(res.body.ownerActivity.ownerAllocated).toBeCloseTo(EXPECTED_OWNER_ALLOCATED, 5);
  });

  it("ownerTaxReserve = ownerAllocated × 0.25", async () => {
    pushProfitLoss();
    const res = await request(app).get(`/reports/profit-loss?year=${YEAR}`);
    expect(res.status).toBe(200);
    const oa = res.body.ownerActivity;
    expect(oa.ownerTaxReserve).toBeCloseTo(oa.ownerAllocated * 0.25, 5);
  });

  it("ownerCashTaken equals ownerDrawTotal (owner draw expenses)", async () => {
    pushProfitLoss();
    const res = await request(app).get(`/reports/profit-loss?year=${YEAR}`);
    expect(res.status).toBe(200);
    const oa = res.body.ownerActivity;
    expect(oa.ownerCashTaken).toBeCloseTo(oa.ownerDrawTotal, 5);
    expect(oa.ownerCashTaken).toBeCloseTo(EXPECTED_CASH_TAKEN, 5);
  });

  it("ownerRetained = max(0, ownerAllocated − ownerTaxReserve − ownerCashTaken)", async () => {
    pushProfitLoss();
    const res = await request(app).get(`/reports/profit-loss?year=${YEAR}`);
    expect(res.status).toBe(200);
    const oa = res.body.ownerActivity;
    const expected = Math.max(0, oa.ownerAllocated - oa.ownerTaxReserve - oa.ownerCashTaken);
    expect(oa.ownerRetained).toBeCloseTo(expected, 5);
    expect(oa.ownerRetained).toBeGreaterThanOrEqual(0);
    expect(oa.ownerRetained).toBeCloseTo(EXPECTED_OWNER_RETAINED, 5);
  });

  it("ownerOverWithdrawal is 0 when cashTaken ≤ ownerAllocated − taxReserve", async () => {
    pushProfitLoss();
    const res = await request(app).get(`/reports/profit-loss?year=${YEAR}`);
    expect(res.status).toBe(200);
    const oa = res.body.ownerActivity;
    expect(oa.ownerOverWithdrawal).toBeCloseTo(EXPECTED_OVER_WITHDRAWAL, 5);
    expect(oa.ownerOverWithdrawal).toBeGreaterThanOrEqual(0);
  });

  it("owner draw does NOT reduce netProfit (ownerAllocated is equity-only)", async () => {
    pushProfitLoss();
    const res = await request(app).get(`/reports/profit-loss?year=${YEAR}`);
    expect(res.status).toBe(200);
    // netProfit = revenue(1000) − cogs(0) − opex(100 Materials) − mileage(0) − deprec(0) = 900
    // If owner draw ($200) were included, netProfit would be 700.
    expect(res.body.netProfit).toBeCloseTo(900, 5);
  });
});

describe("ownerActivity block — /accounting route invariants", () => {
  it("has all 7 required fields on /accounting response", async () => {
    pushAccounting();
    const res = await request(app).get(`/reports/accounting?year=${YEAR}`);
    expect(res.status).toBe(200);
    const oa = res.body.ownerActivity;
    expect(oa).toBeDefined();
    // Core waterfall fields
    expect(typeof oa.ownerAllocated).toBe("number");
    expect(typeof oa.ownerTaxReserve).toBe("number");
    expect(typeof oa.ownerCashTaken).toBe("number");
    expect(typeof oa.ownerRetained).toBe("number");
    expect(typeof oa.ownerOverWithdrawal).toBe("number");
    // Capital ledger fields
    expect(typeof oa.ownerDrawTotal).toBe("number");
    expect(typeof oa.ownerContributionsTotal).toBe("number");
  });

  it("ownerTaxReserve = ownerAllocated × 0.25 on /accounting", async () => {
    pushAccounting();
    const res = await request(app).get(`/reports/accounting?year=${YEAR}`);
    expect(res.status).toBe(200);
    const oa = res.body.ownerActivity;
    expect(oa.ownerTaxReserve).toBeCloseTo(oa.ownerAllocated * 0.25, 5);
  });

  it("ownerRetained ≥ 0 on /accounting", async () => {
    pushAccounting();
    const res = await request(app).get(`/reports/accounting?year=${YEAR}`);
    expect(res.status).toBe(200);
    expect(res.body.ownerActivity.ownerRetained).toBeGreaterThanOrEqual(0);
  });

  it("netProfit on /accounting is unaffected by ownerAllocated", async () => {
    pushAccounting();
    const res = await request(app).get(`/reports/accounting?year=${YEAR}`);
    expect(res.status).toBe(200);
    // netProfit = paidRevenue(1000) − (totalExpenses(100 Materials) − ownerDrawTotal(200) + ownerDrawTotal(200))... wait
    // netProfit = paidRevenue - (totalExpenses - ownerDrawTotal) - mileage - deprec
    // totalExpenses = 200+100 = 300; ownerDrawTotal = 200; businessExp = 100
    // netProfit = 1000 - 100 - 0 - 0 = 900
    expect(res.body.summary.netProfit).toBeCloseTo(900, 5);
  });
});

describe("ownerActivity block — /year-end route invariants", () => {
  it("has all 7 required fields on /year-end response", async () => {
    pushYearEnd();
    const res = await request(app).get(`/reports/year-end?year=${YEAR}`);
    expect(res.status).toBe(200);
    const oa = res.body.ownerActivity;
    expect(oa).toBeDefined();
    // Core waterfall fields
    expect(typeof oa.ownerAllocated).toBe("number");
    expect(typeof oa.ownerTaxReserve).toBe("number");
    expect(typeof oa.ownerCashTaken).toBe("number");
    expect(typeof oa.ownerRetained).toBe("number");
    expect(typeof oa.ownerOverWithdrawal).toBe("number");
    // Capital ledger fields
    expect(typeof oa.ownerDrawTotal).toBe("number");
    expect(typeof oa.ownerContributionsTotal).toBe("number");
  });

  it("ownerTaxReserve = ownerAllocated × 0.25 on /year-end", async () => {
    pushYearEnd();
    const res = await request(app).get(`/reports/year-end?year=${YEAR}`);
    expect(res.status).toBe(200);
    const oa = res.body.ownerActivity;
    expect(oa.ownerTaxReserve).toBeCloseTo(oa.ownerAllocated * 0.25, 5);
  });

  it("ownerRetained ≥ 0 on /year-end", async () => {
    pushYearEnd();
    const res = await request(app).get(`/reports/year-end?year=${YEAR}`);
    expect(res.status).toBe(200);
    expect(res.body.ownerActivity.ownerRetained).toBeGreaterThanOrEqual(0);
  });

  it("netProfit on /year-end is unaffected by ownerActivity (owner draw excluded from Schedule C)", async () => {
    pushYearEnd();
    const res = await request(app).get(`/reports/year-end?year=${YEAR}`);
    expect(res.status).toBe(200);
    // year-end: netProfit = totalRevenue - totalExpenses - mileageDeduction - totalDepreciation
    // totalExpenses = nonMileageExpenses (excludes owner draws) = Materials($100) + fixedAllocSub($0)
    // netProfit = 1000 - 100 - 0 - 0 = 900
    expect(res.body.summary.netProfit).toBeCloseTo(900, 5);
  });
});

describe("ownerActivity — over-withdrawal detection", () => {
  it("ownerOverWithdrawal > 0 when cashTaken exceeds ownerAllocated − taxReserve", async () => {
    // Use a smaller invoice ($100) so ownerAllocated is small, then a large draw ($200).
    // ownerAllocated = 100 × 0.95 × 0.50 = 47.50
    // after-tax available = 47.50 − (47.50 × 0.25) = 35.625
    // cashTaken = 200 → overWithdrawal = 200 − 35.625 = 164.375
    const SMALL_INVOICE = { id: 2, status: "paid", issueDate: `${YEAR}-07-01`, total: "100.00" };
    // Waterfall invoice must include date fields so the JS effective-payment-date filter passes.
    const SMALL_WATERFALL_INV = { jobId: null, total: "100.00", stripePaidAt: null, squarePaidAt: null, issueDate: `${YEAR}-07-01` };
    const BIG_DRAW = { id: 50, category: "Owner Draw", amount: "200.00", description: "Big draw", excludeFromNetProfit: false };

    h.selectQueue.push([SMALL_INVOICE]);       // [0] invRows
    h.selectQueue.push([BIG_DRAW]);            // [1] expRows
    h.selectQueue.push(NO_MILEAGE);            // [2] mileRows
    h.selectQueue.push([]);                    // [3] otherRows
    h.selectQueue.push([]);                    // [4] plSubPayRows
    h.selectQueue.push([]);                    // [5] outstandingSubRows
    h.selectQueue.push([{ n: 0 }]);           // [6] closedCountRow
    h.selectQueue.push([]);                    // [7] assets
    h.selectQueue.push([]);                    // [8] busUseRows
    h.selectQueue.push([SMALL_WATERFALL_INV]); // [9]  waterfallPaidInvs (fires before direct chains)
    h.selectQueue.push([]);                    // [10] ownerContribRows
    h.selectQueue.push([{}]);                  // [11] settingsRows

    const res = await request(app).get(`/reports/profit-loss?year=${YEAR}`);
    expect(res.status).toBe(200);

    const oa = res.body.ownerActivity;
    const expectedAlloc = 100 * (1 - 0.05) * 0.50;                // 47.50
    const expectedTax   = expectedAlloc * 0.25;                    // 11.875
    const available     = expectedAlloc - expectedTax;              // 35.625
    const expectedOver  = Math.max(0, 200 - available);            // 164.375

    expect(oa.ownerAllocated).toBeCloseTo(expectedAlloc, 5);
    expect(oa.ownerOverWithdrawal).toBeCloseTo(expectedOver, 5);
    expect(oa.ownerOverWithdrawal).toBeGreaterThan(0);
    expect(oa.ownerRetained).toBeCloseTo(0, 5); // clamped at 0
  });
});

describe("owner_capital_entries sign convention", () => {
  it("ownerContributionsTotal on /profit-loss counts only positive entries (contributions)", async () => {
    // Positive entry = contribution (cash in), negative = capital withdrawal.
    // ownerContributionsTotal must only sum positive amounts.
    const CONTRIBUTION = { amount: "5000.00" };  // positive → counts
    const WITHDRAWAL   = { amount: "-1000.00" }; // negative → excluded from contributions total

    h.selectQueue.push([PAID_INVOICE_PL]);          // [0] invRows
    h.selectQueue.push([]);                         // [1] expRows
    h.selectQueue.push(NO_MILEAGE);                 // [2] mileRows
    h.selectQueue.push([]);                         // [3] otherRows
    h.selectQueue.push([]);                         // [4] plSubPayRows
    h.selectQueue.push([]);                         // [5] outstandingSubRows
    h.selectQueue.push([{ n: 0 }]);                // [6] closedCountRow
    h.selectQueue.push([]);                         // [7] assets
    h.selectQueue.push([]);                         // [8] busUseRows
    h.selectQueue.push([]);                         // [9]  waterfallPaidInvs (fires before direct chains)
    h.selectQueue.push([CONTRIBUTION, WITHDRAWAL]); // [10] ownerContribRows
    h.selectQueue.push([{}]);                       // [11] settingsRows

    const res = await request(app).get(`/reports/profit-loss?year=${YEAR}`);
    expect(res.status).toBe(200);

    // Only the $5 000 contribution must appear in ownerContributionsTotal.
    // Regression: $4 000 (negative entry subtracted — sign mismatch)
    //           or $6 000 (|negative| added)
    expect(res.body.ownerActivity.ownerContributionsTotal).toBeCloseTo(5000, 5);
  });
});

describe("ownerActivity waterfall — cross-year invoice attribution (effective payment date)", () => {
  // Guards that computeOwnerWaterfall uses effective payment date, not issueDate.
  //
  // Scenario: an invoice is ISSUED in December of the prior year but PAID (via Stripe)
  // in January of the requested year. Accounting attributes this invoice to the requested
  // year via getEffectivePaymentDate (Stripe timestamp > issueDate). The waterfall must
  // do the same — ownerAllocated for the requested year must be > 0.
  //
  // A regression that still uses issueDate would attribute the invoice to the prior year,
  // leaving ownerAllocated = 0 for the requested year even though the owner received cash.

  it("/accounting: invoice issued last year but paid this year via Stripe is attributed to this year", async () => {
    // Invoice issued Dec prior year, paid Jan this year by Stripe.
    const PRIOR_DEC_ISSUED = {
      id: 99,
      status: "paid",
      subtotal: "2000.00",
      taxAmount: "0",
      total: "2000.00",
      issueDate: `${YEAR - 1}-12-15`,   // prior year — wrong attribution if issueDate used
      stripePaidAt: null,                // Stripe/Square not used for the accounting invoice row
      squarePaidAt: null,
      invoiceCity: "Owensboro",
      invoiceState: "KY",
      jobCity: null,
      jobState: null,
      clientName: "Test Client",
      invoiceNumber: "INV-XMAS",
      businessLine: null,
    };

    // Waterfall invoice fixture: stripePaidAt is in YEAR (not prior year).
    // issueDate is in prior year — only the stripePaidAt field should govern attribution.
    const CROSS_YEAR_WATERFALL_INV = {
      jobId: null,
      total: "2000.00",
      stripePaidAt: new Date(`${YEAR}-01-15T12:00:00Z`), // January of YEAR
      squarePaidAt: null,
      issueDate: `${YEAR - 1}-12-15`,   // prior year — must be ignored when stripePaidAt present
    };

    // Push accounting queue ([0-11]; allBusinesses + outstandingSubRows from empty queue)
    h.selectQueue.push([PRIOR_DEC_ISSUED]);          // [0] paidInvoices (all paid, no date filter)
    h.selectQueue.push([]);                          // [1] nonPaidInvoices
    h.selectQueue.push([]);                          // [2] expenses
    h.selectQueue.push([]);                          // [3] mileageLogs
    h.selectQueue.push([]);                          // [4] subs
    h.selectQueue.push([ACC_SETTINGS]);              // [5] settings
    h.selectQueue.push([]);                          // [6] otherIncome
    h.selectQueue.push([]);                          // [7] accFixedAllocSubPayments
    h.selectQueue.push([]);                          // [8] assets
    h.selectQueue.push([]);                          // [9] assetBusinessUse
    // computeOwnerWaterfall fires synchronously first; accOwnerContribRows is 4th Promise.all chain
    h.selectQueue.push([CROSS_YEAR_WATERFALL_INV]);  // [10] waterfallPaidInvs
    h.selectQueue.push([]);                          // [11] accOwnerContribRows (ownerCapitalEntries)
    h.selectQueue.push([]);                          // [12] allBusinesses
    h.selectQueue.push([]);                          // [13] outstandingSubRows

    const res = await request(app).get(`/reports/accounting?year=${YEAR}`);
    expect(res.status).toBe(200);

    // The invoice ($2 000) was paid in YEAR → ownerAllocated must be > 0.
    // Regression (issueDate used): ownerAllocated = 0 because issueDate is prior year.
    const oa = res.body.ownerActivity;
    expect(oa.ownerAllocated).toBeGreaterThan(0);

    // Verify the exact waterfall value: $2000 × 0.95 × 0.50 = $950.
    const expectedAlloc = 2000 * (1 - 0.05) * 0.50;
    expect(oa.ownerAllocated).toBeCloseTo(expectedAlloc, 5);
    expect(oa.ownerTaxReserve).toBeCloseTo(expectedAlloc * 0.25, 5);
  });

  it("/accounting: invoice issued this year but not paid until next year is excluded from this year ownerAllocated", async () => {
    // Invoice issued YEAR, but paid next year → effective date is YEAR+1.
    // ownerAllocated for YEAR must be 0 (the cash hasn't landed yet).
    const NEXT_YEAR_PAID_WATERFALL_INV = {
      jobId: null,
      total: "1500.00",
      stripePaidAt: new Date(`${YEAR + 1}-02-10T12:00:00Z`), // paid next year
      squarePaidAt: null,
      issueDate: `${YEAR}-11-01`,   // issued this year
    };

    h.selectQueue.push([]);               // [0] paidInvoices (empty for accounting revenue)
    h.selectQueue.push([]);               // [1] nonPaidInvoices
    h.selectQueue.push([]);               // [2] expenses
    h.selectQueue.push([]);               // [3] mileageLogs
    h.selectQueue.push([]);               // [4] subs
    h.selectQueue.push([ACC_SETTINGS]);   // [5] settings
    h.selectQueue.push([]);               // [6] otherIncome
    h.selectQueue.push([]);               // [7] accFixedAllocSubPayments
    h.selectQueue.push([]);               // [8] assets
    h.selectQueue.push([]);               // [9] assetBusinessUse
    h.selectQueue.push([NEXT_YEAR_PAID_WATERFALL_INV]); // [10] waterfallPaidInvs
    h.selectQueue.push([]);               // [11] accOwnerContribRows (ownerCapitalEntries)
    h.selectQueue.push([]);               // [12] allBusinesses
    h.selectQueue.push([]);               // [13] outstandingSubRows

    const res = await request(app).get(`/reports/accounting?year=${YEAR}`);
    expect(res.status).toBe(200);

    // The invoice was NOT paid in YEAR → ownerAllocated must be 0.
    // Regression (issueDate used): ownerAllocated > 0 because issueDate is in YEAR.
    expect(res.body.ownerActivity.ownerAllocated).toBeCloseTo(0, 5);
  });
});

describe("ownerActivity — zero-allocation draw scenario", () => {
  // Guards that ownerOverWithdrawal > 0 (and the card is visible) even when
  // ownerAllocated = 0 (no eligible paid invoices in the waterfall year).
  // A year with draws but no revenue still has a real over-withdrawal.

  it("/accounting: owner draws with no paid revenue → ownerOverWithdrawal = cashTaken", async () => {
    // No paid invoices → waterfallPaidInvs returns [] → ownerAllocated = 0
    // $300 owner draw → cashTaken = 300
    // over-withdrawal = max(0, 300 - (0 - 0)) = 300
    const DRAW_ONLY = {
      id: 60,
      date: `${YEAR}-03-01`,
      amount: "300.00",
      category: "Owner Draw",
      businessLine: null,
      jobId: null,
      excludeFromNetProfit: false,
      description: "Draw with no revenue",
      vendor: null,
      notes: null,
    };

    h.selectQueue.push([]);               // [0] paidInvoices — empty, no revenue
    h.selectQueue.push([]);               // [1] nonPaidInvoices
    h.selectQueue.push([DRAW_ONLY]);      // [2] expenses
    h.selectQueue.push([]);               // [3] mileageLogs
    h.selectQueue.push([]);               // [4] subs
    h.selectQueue.push([ACC_SETTINGS]);   // [5] settings
    h.selectQueue.push([]);               // [6] otherIncome
    h.selectQueue.push([]);               // [7] accFixedAllocSubPayments
    h.selectQueue.push([]);               // [8] assets
    h.selectQueue.push([]);               // [9] assetBusinessUse
    h.selectQueue.push([]);               // [10] waterfallPaidInvs (empty → ownerAllocated = 0)
    h.selectQueue.push([]);               // [11] accOwnerContribRows
    h.selectQueue.push([]);               // [12] allBusinesses
    h.selectQueue.push([]);               // [13] outstandingSubRows

    const res = await request(app).get(`/reports/accounting?year=${YEAR}`);
    expect(res.status).toBe(200);

    const oa = res.body.ownerActivity;
    expect(oa.ownerAllocated).toBeCloseTo(0, 5);
    expect(oa.ownerCashTaken).toBeCloseTo(300, 5);
    // The full draw amount is an over-withdrawal
    expect(oa.ownerOverWithdrawal).toBeCloseTo(300, 5);
    expect(oa.ownerOverWithdrawal).toBeGreaterThan(0);
    // retained is 0 (never negative)
    expect(oa.ownerRetained).toBeCloseTo(0, 5);
  });

  it("/year-end: owner draws with no paid revenue → ownerOverWithdrawal = cashTaken", async () => {
    // Push year-end queue: large Promise.all (10 items), then ownerActivity (ownerContribRows + waterfall)
    h.selectQueue.push([]);                                   // [0] invoices (empty — no revenue)
    h.selectQueue.push([{ id: 70, date: `${YEAR}-03-01`, amount: "300.00", category: "Owner Draw", businessLine: null, description: "Draw" }]); // [1] expenses
    h.selectQueue.push([]);                                   // [2] mileageLogs
    h.selectQueue.push([]);                                   // [3] otherIncome
    h.selectQueue.push([]);                                   // [4] assets
    h.selectQueue.push([]);                                   // [5] taxPayments
    h.selectQueue.push([]);                                   // [6] subs
    h.selectQueue.push(YE_SETTINGS);                          // [7] settings
    h.selectQueue.push([]);                                   // [8] busUseRows
    h.selectQueue.push([]);                                   // [9] fixedAllocSubPayments
    h.selectQueue.push([]);                                   // [10] yeOwnerContribRows
    h.selectQueue.push([]);                                   // [11] waterfallPaidInvs (empty → ownerAllocated = 0)

    const res = await request(app).get(`/reports/year-end?year=${YEAR}`);
    expect(res.status).toBe(200);

    const oa = res.body.ownerActivity;
    expect(oa.ownerAllocated).toBeCloseTo(0, 5);
    expect(oa.ownerCashTaken).toBeCloseTo(300, 5);
    expect(oa.ownerOverWithdrawal).toBeCloseTo(300, 5);
    expect(oa.ownerOverWithdrawal).toBeGreaterThan(0);
    expect(oa.ownerRetained).toBeCloseTo(0, 5);
  });
});
