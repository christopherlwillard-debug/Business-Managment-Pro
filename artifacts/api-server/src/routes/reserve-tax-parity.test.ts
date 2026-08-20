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
//     [0-6] Promise.all([paidInvoices, nonPaidInvoices, expenses, mileageLogs, subs, settings, otherIncome])
//     [7-8] computeDepreciationForYear → Promise.all([assets, assetBusinessUse])
//     NOTE: invoice fetch is split — paid invoices have no date filter;
//           non-paid invoices are issueDate-bounded. Each occupies one queue slot.
//
//   GET /business-reserve
//     [0]   settings
//     [1-5] Promise.all([brPaidInvoices, brNonPaidInvoices, expenses, mileageLogs, otherIncome])
//     [6-7] computeDepreciationForYear → Promise.all([assets, assetBusinessUse])
//     [8]   growthFundDeployments
//     [9]   recurringExpenses
//     [10]  plaidConnections

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

// Helper: push the 11 selects consumed by GET /accounting (no subs, no depreciation)
// Updated for Task #1913: computeOwnerWaterfall paidInvs slot added at [10];
// ownerCapitalEntries (accOwnerContribRows) added at [11] in the same Promise.all.
//
// Queue order:
//   [0]  paidInvoices             — no issueDate filter
//   [1]  nonPaidInvoices          — issueDate-bounded
//   [2]  expenses
//   [3]  mileageLogs
//   [4]  subs
//   [5]  settings
//   [6]  otherIncome
//   [7]  accFixedAllocSubPayments — fixed/allocation sub_payment_records
//   [8]  assets                   — computeDepreciationForYear
//   [9]  assetBusinessUse         — computeDepreciationForYear
//   [10] waterfallPaidInvs        — computeOwnerWaterfall (fires synchronously first)
//   [11] accOwnerContribRows      — ownerCapitalEntries (4th chain in same Promise.all)
function pushAccountingSelects() {
  // [0] paidInvoices — no issueDate filter
  h.selectQueue.push([PAID_INVOICE]);
  // [1] nonPaidInvoices — issueDate-bounded (empty in this scenario)
  h.selectQueue.push([]);
  // [2] expenses
  h.selectQueue.push([]);
  // [3] mileageLogs
  h.selectQueue.push([]);
  // [4] subs — empty so computeYtd is never called
  h.selectQueue.push([]);
  // [5] settings
  h.selectQueue.push([SETTINGS_ROW]);
  // [6] otherIncome
  h.selectQueue.push([OTHER_INCOME_ROW]);
  // [7] accFixedAllocSubPayments — fixed/allocation sub payments (cash-basis addition)
  h.selectQueue.push([]);
  // [8-9] computeDepreciationForYear → assets, assetBusinessUse (both empty → $0 depreciation)
  h.selectQueue.push([]); // assets
  h.selectQueue.push([]); // assetBusinessUse
  // [10] computeOwnerWaterfall paidInvs (no jobId in PAID_INVOICE → no subHours query → ownerAllocated=0)
  h.selectQueue.push([]);
  // [11] accOwnerContribRows — ownerCapitalEntries (same Promise.all, 4th chain)
  h.selectQueue.push([]);
}

// Helper: push the 11 selects consumed by GET /business-reserve
// (invoice has jobId=null → jobIds empty → subHoursRows step is skipped)
function pushBusinessReserveSelects() {
  // [0] settings
  h.selectQueue.push([SETTINGS_ROW]);
  // [1] brPaidInvoices — no issueDate filter
  h.selectQueue.push([PAID_INVOICE]);
  // [2] brNonPaidInvoices — issueDate-bounded (empty in this scenario)
  h.selectQueue.push([]);
  // [3] expenses
  h.selectQueue.push([]);
  // [4] mileageLogs
  h.selectQueue.push([]);
  // [5] otherIncome
  h.selectQueue.push([OTHER_INCOME_ROW]);
  // jobIds is empty → no subHoursRows select
  // [6-7] computeDepreciationForYear → assets, assetBusinessUse
  h.selectQueue.push([]); // assets
  h.selectQueue.push([]); // assetBusinessUse
  // [8] growthFundDeployments
  h.selectQueue.push([]);
  // [9] recurringExpenses
  h.selectQueue.push([]);
  // [10] plaidConnections
  h.selectQueue.push([]);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Reserve tax parity — estimatedTaxes invariant", () => {

  it("accounting totalEstimated equals business-reserve estimatedTaxes with only invoice revenue", async () => {
    // Seed accounting with invoice only (no other income)
    h.selectQueue.push([PAID_INVOICE]); // paidInvoices — no issueDate filter
    h.selectQueue.push([]);             // nonPaidInvoices — issueDate-bounded
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
    h.selectQueue.push([PAID_INVOICE]);   // brPaidInvoices — no issueDate filter
    h.selectQueue.push([]);              // brNonPaidInvoices — issueDate-bounded
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

// ── Cross-year revenue gap regression tests ───────────────────────────────────
//
// Guards the fix for the December-issued / January-paid invoice gap.
// Previously, such an invoice was absent from BOTH periods:
//   - excluded from December's revenue by getEffectivePaymentDate (correct)
//   - excluded from January's query by the issueDate range filter (the bug)
//
// These tests seed the paid-invoice slot with an invoice whose issueDate is in
// December of the prior year but whose stripePaidAt is in January of YEAR.

describe("Cross-year invoice revenue attribution", () => {

  // Invoice issued in December of the prior year, paid via Stripe in January of YEAR.
  // jobId=null → business-reserve skips the subHoursRows query.
  const PREV_YEAR = YEAR - 1;
  const CROSS_YEAR_INVOICE = {
    id: 99,
    status: "paid",
    subtotal: "500.00",
    taxAmount: "0",
    total: "500.00",
    issueDate: `${PREV_YEAR}-12-28`,
    // Date instance so getEffectivePaymentDate calls .toISOString() correctly
    stripePaidAt: new Date(`${YEAR}-01-03T12:00:00.000Z`),
    squarePaidAt: null,
    invoiceCity: "Other City",
    invoiceState: "KY",
    jobCity: null,
    jobState: null,
    clientName: "Cross-Year Client",
    invoiceNumber: "INV-X01",
    businessLine: null,
    jobId: null,
  };

  it(`appears in /accounting?year=${YEAR} paidRevenue (payment year) — not in ${YEAR - 1} (issue year)`, async () => {
    // Seed accounting for the PAYMENT year (YEAR)
    h.selectQueue.push([CROSS_YEAR_INVOICE]); // paidInvoices — no issueDate filter
    h.selectQueue.push([]);                    // nonPaidInvoices
    h.selectQueue.push([]);                    // expenses
    h.selectQueue.push([]);                    // mileageLogs
    h.selectQueue.push([]);                    // subs
    h.selectQueue.push([SETTINGS_ROW]);         // settings
    h.selectQueue.push([]);                    // otherIncome
    h.selectQueue.push([]);                    // assets
    h.selectQueue.push([]);                    // assetBusinessUse

    const payYearRes = await request(app).get(`/reports/accounting?year=${YEAR}`);
    expect(payYearRes.status).toBe(200);
    // Invoice total $500 should be counted in the payment year's paidRevenue (under summary)
    expect(payYearRes.body.summary.paidRevenue).toBeCloseTo(500, 10);
    // January bucket of the monthly chart must carry the $500 paid amount
    const janBucket = (payYearRes.body.monthlyIncome as any[]).find((b: any) => b.month === `${YEAR}-01`);
    expect(janBucket).toBeDefined();
    expect(janBucket.paid).toBeCloseTo(500, 10);

    // Seed accounting for the ISSUE year (PREV_YEAR) — payment date is outside this year
    h.selectQueue.push([CROSS_YEAR_INVOICE]); // paidInvoices (returned by unbounded query)
    h.selectQueue.push([]);                    // nonPaidInvoices
    h.selectQueue.push([]);                    // expenses
    h.selectQueue.push([]);                    // mileageLogs
    h.selectQueue.push([]);                    // subs
    h.selectQueue.push([SETTINGS_ROW]);         // settings
    h.selectQueue.push([]);                    // otherIncome
    h.selectQueue.push([]);                    // assets
    h.selectQueue.push([]);                    // assetBusinessUse

    const issueYearRes = await request(app).get(`/reports/accounting?year=${PREV_YEAR}`);
    expect(issueYearRes.status).toBe(200);
    // Invoice must NOT appear in the issue year's revenue (payment was in the next year)
    expect(issueYearRes.body.summary.paidRevenue).toBeCloseTo(0, 10);
  });

  it(`appears in /business-reserve for ${YEAR} estimatedTaxes (payment year)`, async () => {
    // business-reserve always operates on the current year (no year param)
    h.selectQueue.push([SETTINGS_ROW]);          // settings
    h.selectQueue.push([CROSS_YEAR_INVOICE]);     // brPaidInvoices — no issueDate filter
    h.selectQueue.push([]);                      // brNonPaidInvoices
    h.selectQueue.push([]);                      // expenses
    h.selectQueue.push([]);                      // mileageLogs
    h.selectQueue.push([]);                      // otherIncome
    // jobIds is empty → no subHoursRows select
    h.selectQueue.push([]);                      // assets
    h.selectQueue.push([]);                      // assetBusinessUse
    h.selectQueue.push([]);                      // growthFundDeployments
    h.selectQueue.push([]);                      // recurringExpenses
    h.selectQueue.push([]);                      // plaidConnections

    const brRes = await request(app).get("/reports/business-reserve");
    expect(brRes.status).toBe(200);
    // KY state tax on $500 net profit = 500 * 0.04 = $20
    expect(brRes.body.taxBreakdown.kyState).toBeCloseTo(500 * 0.04, 10);
    // Total estimated taxes must be > 0 (revenue was counted)
    expect(brRes.body.estimatedTaxes).toBeGreaterThan(0);
  });
});

// ── Owner-draw exclusion regression tests ─────────────────────────────────────
//
// Guards the fix that stops owner withdrawals (Owner Draw / Owner Compensation /
// Owner Withdrawal) from reducing reported net profit.  A future refactor that
// accidentally drops the exclusion filter would cause these tests to fail.
//
// Covered calculation paths:
//   1. GET /accounting byBusinessLine  → expenses and netProfit fields
//   2. GET /accounting monthlyIncome   → expenses bar per month
//   3. GET /dashboard  byBusinessLine  → unattributed section businessExpenses /
//                                        operationalNetProfit
//   4. All three owner-pay category names are blocked in /accounting byBusinessLine
//
// Queue order reference:
//
//   GET /accounting (no blFilter):
//     [0-6] Promise.all(paidInv, nonPaidInv, expenses, mileage, subs, settings, otherIncome)
//     [7-8] computeDepreciationForYear → assets, assetBusinessUse
//     [9]   allBusinesses  (byBusinessLine query)
//     [10]  outstandingSubRows (innerJoin)
//
//   GET /dashboard (no blFilter, default period=month):
//     [0-8] Promise.all(kpiPaidInv, kpiNonPaidInv, kpiExpenses, allMileage,
//                       kpiOtherIncome, kpiActiveJobs, recentJobs, recentInvoices,
//                       kpiOwnerCapital)
//     [9]   ytdMileageLogs (separate select — period != "year")
//     [10]  subPayRows (innerJoin)
//     [11]  allBusinesses
//     [12–35] monthlyRevenue loop: 6 months × 4 queries = 24 selects

const CURRENT_MONTH_STR = `${YEAR}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

describe("Owner-draw exclusion from net profit", () => {

  // ── Shared fixtures ────────────────────────────────────────────────────────

  // Invoice attributed to the "mfh" business line, paid in June of YEAR
  const BIZ_INVOICE = {
    id: 50,
    status: "paid",
    subtotal: "1000.00",
    taxAmount: "0",
    total: "1000.00",
    issueDate: `${YEAR}-06-01`,
    invoiceCity: "Other City",
    invoiceState: "KY",
    jobCity: null,
    jobState: null,
    clientName: "BizLine Client",
    invoiceNumber: "INV-BL01",
    businessLine: "mfh",
    jobId: null,
  };

  // Owner draw attributed to "mfh" — must never reduce netProfit or expenses
  const OWNER_DRAW_EXP = {
    id: 60,
    date: `${YEAR}-06-15`,
    amount: "500.00",
    category: "Owner Draw",
    businessLine: "mfh",
    jobId: null,
    excludeFromNetProfit: false,
    description: "Owner draw",
    vendor: null,
    notes: null,
  };

  // Ordinary business expense attributed to "mfh" — must still count
  const REGULAR_EXP = {
    id: 61,
    date: `${YEAR}-06-15`,
    amount: "100.00",
    category: "Supplies",
    businessLine: "mfh",
    jobId: null,
    excludeFromNetProfit: false,
    description: "Office supplies",
    vendor: null,
    notes: null,
  };

  // ── 1. Accounting byBusinessLine ──────────────────────────────────────────

  it("/accounting byBusinessLine: owner draw is not counted in expenses or netProfit", async () => {
    h.selectQueue.push([BIZ_INVOICE]);                    // [0] paidInvoices
    h.selectQueue.push([]);                               // [1] nonPaidInvoices
    h.selectQueue.push([OWNER_DRAW_EXP, REGULAR_EXP]);   // [2] expenses
    h.selectQueue.push([]);                               // [3] mileageLogs
    h.selectQueue.push([]);                               // [4] subs
    h.selectQueue.push([SETTINGS_ROW]);                   // [5] settings
    h.selectQueue.push([]);                               // [6] otherIncome
    h.selectQueue.push([]);                               // [7] accFixedAllocSubPayments (cash-basis)
    h.selectQueue.push([]);                               // [8] assets (computeDepreciationForYear)
    h.selectQueue.push([]);                               // [9] assetBusinessUse
    // computeOwnerWaterfall fires synchronously; accOwnerContribRows is 4th chain in same Promise.all
    h.selectQueue.push([]);                               // [10] waterfallPaidInvs (no jobId → ownerAllocated=0)
    h.selectQueue.push([]);                               // [11] accOwnerContribRows (ownerCapitalEntries)
    h.selectQueue.push([{ slug: "mfh", name: "MFH" }]);  // [12] allBusinesses
    h.selectQueue.push([]);                               // [13] outstandingSubRows (innerJoin)

    const res = await request(app).get(`/reports/accounting?year=${YEAR}`);
    expect(res.status).toBe(200);

    const mfhLine = res.body.byBusinessLine.find((b: any) => b.businessLine === "mfh");
    expect(mfhLine).toBeDefined();

    // expenses = businessExpSum = total - ownerDrawTotal = (500 + 100) - 500 = 100
    // A regression would produce 600 (owner draw included).
    expect(mfhLine.expenses).toBeCloseTo(100, 10);

    // netProfit = invoicePaid - businessExpSum = 1000 - 100 = 900
    // A regression would produce 1000 - 600 = 400.
    expect(mfhLine.netProfit).toBeCloseTo(900, 10);
  });

  // ── 2. Accounting monthly income chart ────────────────────────────────────

  it("/accounting monthlyIncome: owner draw month shows zero in the expenses bar", async () => {
    // Only an owner draw in June — no regular expenses, no revenue.
    // The monthly chart must report expenses = 0 for June; a regression
    // would report 500 (the draw amount).
    const DRAW_ONLY_EXP = { ...OWNER_DRAW_EXP, businessLine: null };

    h.selectQueue.push([]);              // [0] paidInvoices
    h.selectQueue.push([]);              // [1] nonPaidInvoices
    h.selectQueue.push([DRAW_ONLY_EXP]); // [2] expenses
    h.selectQueue.push([]);              // [3] mileageLogs
    h.selectQueue.push([]);              // [4] subs
    h.selectQueue.push([SETTINGS_ROW]);  // [5] settings
    h.selectQueue.push([]);              // [6] otherIncome
    h.selectQueue.push([]);              // [7] assets
    h.selectQueue.push([]);              // [8] assetBusinessUse
    // [9] allBusinesses and [10] outstandingSubRows return [] from empty queue

    const res = await request(app).get(`/reports/accounting?year=${YEAR}`);
    expect(res.status).toBe(200);

    const juneBucket = (res.body.monthlyIncome as any[]).find(
      (b: any) => b.month === `${YEAR}-06`,
    );
    expect(juneBucket).toBeDefined();

    // expenses bar for June must be 0 — owner draw excluded
    expect(juneBucket.expenses).toBeCloseTo(0, 10);
  });

  // ── 2b. Monthly income chart — owner draw co-existing with a regular expense ─

  it.each([
    ["Owner Draw"],
    ["Owner Compensation"],
    ["Owner Withdrawal"],
  ] as const)(
    "/accounting monthlyIncome: '%s' mixed with a regular expense — expenses bar shows only the regular amount",
    async (ownerCat) => {
      // Seeds one owner-pay expense ($500) and one ordinary expense ($100)
      // in the same month.  The expenses bar must equal $100; the draw must
      // be silently excluded.  A regression would produce $600 (draw included)
      // or $0 (both excluded).
      const MIXED_DRAW = {
        ...OWNER_DRAW_EXP,
        id: 62,
        category: ownerCat,
        businessLine: null as string | null,
      };
      const MIXED_REG = {
        ...REGULAR_EXP,
        id: 63,
        businessLine: null as string | null,
      };

      h.selectQueue.push([]);                          // [0] paidInvoices
      h.selectQueue.push([]);                          // [1] nonPaidInvoices
      h.selectQueue.push([MIXED_DRAW, MIXED_REG]);     // [2] expenses
      h.selectQueue.push([]);                          // [3] mileageLogs
      h.selectQueue.push([]);                          // [4] subs
      h.selectQueue.push([SETTINGS_ROW]);              // [5] settings
      h.selectQueue.push([]);                          // [6] otherIncome
      h.selectQueue.push([]);                          // [7] assets
      h.selectQueue.push([]);                          // [8] assetBusinessUse
      // [9] allBusinesses and [10] outstandingSubRows return [] from empty queue

      const res = await request(app).get(`/reports/accounting?year=${YEAR}`);
      expect(res.status).toBe(200);

      const juneBucket = (res.body.monthlyIncome as any[]).find(
        (b: any) => b.month === `${YEAR}-06`,
      );
      expect(juneBucket).toBeDefined();

      // Regular expense ($100) must appear; owner-pay category must be excluded
      expect(juneBucket.expenses).toBeCloseTo(100, 10);
    },
  );

  // ── 3. Dashboard byBusinessLine — unattributed section ───────────────────

  it("/dashboard byBusinessLine unattributed: owner draw excluded from businessExpenses and operationalNetProfit", async () => {
    // Paid invoice with no businessLine — falls into the "unattributed" bucket.
    // issueDate is in the current month so getEffectivePaymentDate falls within
    // the dashboard's default "month" period (startDate = first of current month).
    const DASH_INVOICE = {
      id: 70,
      status: "paid",
      subtotal: "1000.00",
      taxAmount: "0",
      total: "1000.00",
      issueDate: `${CURRENT_MONTH_STR}-01`,
      stripePaidAt: null,
      squarePaidAt: null,
      businessLine: null,
    };
    const DASH_OWNER_DRAW = {
      id: 80,
      date: `${CURRENT_MONTH_STR}-01`,
      amount: "500.00",
      category: "Owner Compensation",
      businessLine: null,
      jobId: null,
      excludeFromNetProfit: false,
    };
    const DASH_REGULAR = {
      id: 81,
      date: `${CURRENT_MONTH_STR}-01`,
      amount: "200.00",
      category: "Materials",
      businessLine: null,
      jobId: null,
      excludeFromNetProfit: false,
    };

    // Dashboard queue (no blFilter — mileageBusinessId lookup skipped,
    // rawPaidInvoices/rawExpenses reuse kpi data without extra selects):
    h.selectQueue.push([DASH_INVOICE]);                       // [0] kpiPaidInvoices
    h.selectQueue.push([]);                                   // [1] kpiNonPaidInvoices
    h.selectQueue.push([DASH_OWNER_DRAW, DASH_REGULAR]);      // [2] kpiExpenses
    h.selectQueue.push([]);                                   // [3] allMileage
    h.selectQueue.push([]);                                   // [4] kpiOtherIncome
    h.selectQueue.push([]);                                   // [5] kpiActiveJobs
    h.selectQueue.push([]);                                   // [6] recentJobsRows (leftJoin)
    h.selectQueue.push([]);                                   // [7] recentInvoicesRows (leftJoin)
    h.selectQueue.push([]);                                   // [8] kpiOwnerCapital
    h.selectQueue.push([]);                                   // [9] ytdMileageLogs (period=month extra select)
    h.selectQueue.push([]);                                   // [10] subPayRows (innerJoin)
    h.selectQueue.push([]);                                   // [11] allBusinesses — empty → unattributed section appears
    // monthlyRevenue loop: 6 months × 4 queries = 24 selects
    for (let i = 0; i < 24; i++) h.selectQueue.push([]);

    const res = await request(app).get("/reports/dashboard");
    expect(res.status).toBe(200);

    const unattrib = res.body.byBusinessLine.find(
      (b: any) => b.businessLine === "unattributed",
    );
    expect(unattrib).toBeDefined();

    // businessExpenses = total - ownerDrawTotal = (500 + 200) - 500 = 200
    // A regression would produce 700 (owner draw included).
    expect(unattrib.businessExpenses).toBeCloseTo(200, 10);

    // operationalNetProfit = revenue - (total - excluded) = 1000 - (700 - 500) = 800
    // A regression would produce 1000 - 700 = 300.
    expect(unattrib.operationalNetProfit).toBeCloseTo(800, 10);
  });

  // ── 4. All three owner-pay category names are blocked ────────────────────

  it.each([
    ["Owner Draw", "Owner Compensation", "Owner Withdrawal"],
    ["Owner Compensation", "Owner Withdrawal", "Owner Draw"],
    ["Owner Withdrawal", "Owner Draw", "Owner Compensation"],
  ] as const)(
    "/accounting byBusinessLine: all three owner-pay categories are excluded regardless of row order",
    async (...ownerCategories) => {
      // All three owner-pay categories are present in the same month alongside
      // one regular expense. A regression that misses any one of the category
      // names would leak its amount into expenses and reduce netProfit.
      const makeOwnerExp = (id: number, category: string, amount: string) => ({
        id,
        date: `${YEAR}-06-15`,
        amount,
        category,
        businessLine: "mfh",
        jobId: null,
        excludeFromNetProfit: false,
      });

      h.selectQueue.push([BIZ_INVOICE]); // [0] paidInvoices
      h.selectQueue.push([]);            // [1] nonPaidInvoices
      h.selectQueue.push([
        makeOwnerExp(70, ownerCategories[0], "300.00"),
        makeOwnerExp(71, ownerCategories[1], "400.00"),
        makeOwnerExp(72, ownerCategories[2], "200.00"),
        { ...REGULAR_EXP, amount: "100.00" },
      ]);                                // [2] expenses
      h.selectQueue.push([]);            // [3] mileageLogs
      h.selectQueue.push([]);            // [4] subs
      h.selectQueue.push([SETTINGS_ROW]); // [5] settings
      h.selectQueue.push([]);            // [6] otherIncome
      h.selectQueue.push([]);            // [7] accFixedAllocSubPayments (cash-basis)
      h.selectQueue.push([]);            // [8] assets
      h.selectQueue.push([]);            // [9] assetBusinessUse
      // computeOwnerWaterfall fires synchronously; accOwnerContribRows is 4th chain in same Promise.all
      h.selectQueue.push([]);            // [10] waterfallPaidInvs (no jobId → ownerAllocated=0)
      h.selectQueue.push([]);            // [11] accOwnerContribRows (ownerCapitalEntries)
      h.selectQueue.push([{ slug: "mfh", name: "MFH" }]); // [12] allBusinesses
      h.selectQueue.push([]); // [13] outstandingSubRows

      const res = await request(app).get(`/reports/accounting?year=${YEAR}`);
      expect(res.status).toBe(200);

      const mfhLine = res.body.byBusinessLine.find((b: any) => b.businessLine === "mfh");
      expect(mfhLine).toBeDefined();

      // Only the $100 regular expense should appear in expenses.
      expect(mfhLine.expenses).toBeCloseTo(100, 10);
      // netProfit = invoicePaid - businessExpenses = 1000 - 100 = 900.
      expect(mfhLine.netProfit).toBeCloseTo(900, 10);
    },
  );
});

// ── Mileage exclusion from dashboard totals ───────────────────────────────────
//
// Guards the nonMileageExpenses filter at line ~136 of reports.ts:
//   const nonMileageExpenses = kpiExpenses.filter(e => e.category !== "mileage");
//   const totalExpenses = nonMileageExpenses.reduce(...)
//
// And the parallel filter in the unattributed byBusinessLine section:
//   rawExpenses.filter(e => ... && e.category !== "mileage")
//
// Mileage is deducted separately via mileage_logs / mileageDeduction, so an
// expense row with category "mileage" must be excluded from:
//   - totalExpenses          (top-level KPI card)
//   - operationalNetProfit   (top-level profit formula)
//   - byBusinessLine[unattributed].businessExpenses
//   - byBusinessLine[unattributed].operationalNetProfit
//
// A future change that accidentally drops the category filter would silently
// inflate totalExpenses and deflate operationalNetProfit without any test
// catching it.
//
// Queue order for GET /dashboard (no blFilter, default period=month):
//   [0-8]  Promise.all(kpiPaidInv, kpiNonPaidInv, kpiExpenses, allMileage,
//                      kpiOtherIncome, kpiActiveJobs, recentJobs,
//                      recentInvoices, kpiOwnerCapital)
//   [9]    ytdMileageLogs (separate select — period != "year")
//   [10]   subPayRows (innerJoin)
//   [11]   allBusinesses
//   [12–35] monthlyRevenue loop: 6 months × 4 queries = 24 selects

describe("Mileage expense exclusion from dashboard totals", () => {

  // Paid invoice with no businessLine, dated in the current month so
  // getEffectivePaymentDate falls within the dashboard's default "month" period.
  const DASH_MILEAGE_INVOICE = {
    id: 100,
    status: "paid",
    subtotal: "1000.00",
    taxAmount: "0",
    total: "1000.00",
    issueDate: `${CURRENT_MONTH_STR}-01`,
    stripePaidAt: null,
    squarePaidAt: null,
    businessLine: null,
  };

  // Mileage expense — category must match the filter string in reports.ts
  const DASH_MILEAGE_EXP = {
    id: 101,
    date: `${CURRENT_MONTH_STR}-01`,
    amount: "150.00",
    category: "mileage",
    businessLine: null,
    jobId: null,
    excludeFromNetProfit: false,
    description: "Mileage log import expense",
    vendor: null,
    notes: null,
  };

  // Regular business expense — must still appear in totals
  const DASH_SUPPLY_EXP = {
    id: 102,
    date: `${CURRENT_MONTH_STR}-01`,
    amount: "100.00",
    category: "Supplies",
    businessLine: null,
    jobId: null,
    excludeFromNetProfit: false,
    description: "Office supplies",
    vendor: null,
    notes: null,
  };

  it("mileage expense is absent from totalExpenses, operationalNetProfit, and unattributed businessExpenses", async () => {
    // Revenue: $1 000 paid invoice (no businessLine → unattributed).
    // Expenses: $150 mileage (must be excluded) + $100 Supplies (must be included).
    // No mileage_logs → mileageDeduction = 0.
    //
    // Expected:
    //   totalExpenses                          = 100   (mileage row excluded)
    //   operationalNetProfit                   = 900   (1 000 − 100)
    //   byBusinessLine[unattributed].businessExpenses      = 100
    //   byBusinessLine[unattributed].operationalNetProfit  = 900
    //
    // Regression values (if filter were absent):
    //   totalExpenses = 250, operationalNetProfit = 750

    h.selectQueue.push([DASH_MILEAGE_INVOICE]);            // [0] kpiPaidInvoices
    h.selectQueue.push([]);                                // [1] kpiNonPaidInvoices
    h.selectQueue.push([DASH_MILEAGE_EXP, DASH_SUPPLY_EXP]); // [2] kpiExpenses
    h.selectQueue.push([]);                                // [3] allMileage
    h.selectQueue.push([]);                                // [4] kpiOtherIncome
    h.selectQueue.push([]);                                // [5] kpiActiveJobs
    h.selectQueue.push([]);                                // [6] recentJobsRows (leftJoin)
    h.selectQueue.push([]);                                // [7] recentInvoicesRows (leftJoin)
    h.selectQueue.push([]);                                // [8] kpiOwnerCapital
    h.selectQueue.push([]);                                // [9] ytdMileageLogs (period=month extra select)
    h.selectQueue.push([]);                                // [10] subPayRows (innerJoin)
    h.selectQueue.push([]);                                // [11] allBusinesses — empty → unattributed section appears
    // monthlyRevenue loop: 6 months × 4 queries = 24 selects
    for (let i = 0; i < 24; i++) h.selectQueue.push([]);

    const res = await request(app).get("/reports/dashboard");
    expect(res.status).toBe(200);

    // ── Top-level KPI: totalExpenses must exclude the mileage row ──────────
    // Regression: 250 (mileage counted); correct: 100 (mileage excluded)
    expect(res.body.totalExpenses).toBeCloseTo(100, 10);

    // ── Top-level operationalNetProfit must reflect only the regular expense ─
    // operationalNetProfit = revenue(1000) − (totalExpenses(100) − excluded(0))
    //                        − mileageDeduction(0)
    // Regression: 1000 − 250 = 750; correct: 1000 − 100 = 900
    expect(res.body.operationalNetProfit).toBeCloseTo(900, 10);

    // ── byBusinessLine unattributed section ─────────────────────────────────
    const unattrib = res.body.byBusinessLine.find(
      (b: any) => b.businessLine === "unattributed",
    );
    expect(unattrib).toBeDefined();

    // businessExpenses = totalExpenses − ownerDrawTotal = 100 − 0 = 100
    // Regression: 250 (mileage counted)
    expect(unattrib.businessExpenses).toBeCloseTo(100, 10);

    // operationalNetProfit = revenue(1000) − (total − excluded)(100) = 900
    // Regression: 1000 − 250 = 750
    expect(unattrib.operationalNetProfit).toBeCloseTo(900, 10);
  });

  it("mileage expense is absent from a named business line's totalExpenses, businessExpenses, and operationalNetProfit", async () => {
    // Covers the registered-business branch of byBusinessLine:
    //   blExpenses = rawExpenses.filter(e => e.businessLine === bl && e.category !== "mileage")
    // A regression that drops the category filter from that branch would inflate
    // the named business line's totals while the unattributed test above still passes.
    //
    // Seed: $1 000 invoice + $150 mileage + $100 Supplies, all businessLine="mfh".
    // allBusinesses returns [{ slug: "mfh", name: "MFH" }].
    //
    // Expected for the "mfh" byBusinessLine entry:
    //   totalExpenses          = 100   (mileage excluded)
    //   businessExpenses       = 100   (no owner draw)
    //   operationalNetProfit   = 900   (1 000 − 100)
    //
    // Regression values (filter absent):
    //   totalExpenses = 250, businessExpenses = 250, operationalNetProfit = 750

    const BL_INVOICE = {
      id: 110,
      status: "paid",
      subtotal: "1000.00",
      taxAmount: "0",
      total: "1000.00",
      issueDate: `${CURRENT_MONTH_STR}-01`,
      stripePaidAt: null,
      squarePaidAt: null,
      businessLine: "mfh",
    };
    const BL_MILEAGE_EXP = {
      id: 111,
      date: `${CURRENT_MONTH_STR}-01`,
      amount: "150.00",
      category: "mileage",
      businessLine: "mfh",
      jobId: null,
      excludeFromNetProfit: false,
      description: "Mileage import",
      vendor: null,
      notes: null,
    };
    const BL_SUPPLY_EXP = {
      id: 112,
      date: `${CURRENT_MONTH_STR}-01`,
      amount: "100.00",
      category: "Supplies",
      businessLine: "mfh",
      jobId: null,
      excludeFromNetProfit: false,
      description: "Supplies",
      vendor: null,
      notes: null,
    };

    h.selectQueue.push([BL_INVOICE]);                          // [0] kpiPaidInvoices
    h.selectQueue.push([]);                                    // [1] kpiNonPaidInvoices
    h.selectQueue.push([BL_MILEAGE_EXP, BL_SUPPLY_EXP]);      // [2] kpiExpenses
    h.selectQueue.push([]);                                    // [3] allMileage
    h.selectQueue.push([]);                                    // [4] kpiOtherIncome
    h.selectQueue.push([]);                                    // [5] kpiActiveJobs
    h.selectQueue.push([]);                                    // [6] recentJobsRows (leftJoin)
    h.selectQueue.push([]);                                    // [7] recentInvoicesRows (leftJoin)
    h.selectQueue.push([]);                                    // [8] kpiOwnerCapital
    h.selectQueue.push([]);                                    // [9] allSubPayments (cash-basis)
    h.selectQueue.push([]);                                    // [10] ytdMileageLogs (period=month extra select)
    h.selectQueue.push([]);                                    // [11] subPayRows (innerJoin)
    h.selectQueue.push([{ slug: "mfh", name: "MFH" }]);       // [12] allBusinesses — "mfh" is a known slug
    // monthlyRevenue loop: 6 months × 4 queries = 24 selects
    for (let i = 0; i < 24; i++) h.selectQueue.push([]);

    const res = await request(app).get("/reports/dashboard");
    expect(res.status).toBe(200);

    const mfhLine = res.body.byBusinessLine.find(
      (b: any) => b.businessLine === "mfh",
    );
    expect(mfhLine).toBeDefined();

    // totalExpenses = sum of non-mileage expenses = 100
    // Regression: 250
    expect(mfhLine.totalExpenses).toBeCloseTo(100, 10);

    // businessExpenses = totalExpenses − ownerDrawTotal = 100 − 0 = 100
    // Regression: 250
    expect(mfhLine.businessExpenses).toBeCloseTo(100, 10);

    // operationalNetProfit = revenue(1000) − (total − excluded)(100 − 0) = 900
    // Regression: 1000 − 250 = 750
    expect(mfhLine.operationalNetProfit).toBeCloseTo(900, 10);
  });
});

// ── Monthly income chart includes fixed/allocation sub payments ───────────────
//
// Guards that accSubPayByMonth is added into the monthlyIncome expenses bar.
// Before the fix, months where a fixed/allocation sub was paid in cash showed
// understated expenses in the chart even though totalExpenses was correct.
//
// Queue order for GET /accounting (no blFilter):
//   [0]  paidInvoices
//   [1]  nonPaidInvoices
//   [2]  expenses
//   [3]  mileageLogs
//   [4]  subs
//   [5]  settings
//   [6]  otherIncome
//   [7]  accFixedAllocSubPayments  <- the slot under test
//   [8]+ assets, assetBusinessUse, waterfall, ownerContrib, allBusinesses
//        all return [] from the empty-queue default

describe("Monthly income chart includes fixed/allocation sub payments", () => {

  const JUNE_REGULAR_EXP = {
    id:                   200,
    date:                 `${YEAR}-06-10`,
    amount:               "100.00",
    category:             "Supplies",
    businessLine:         null,
    jobId:                null,
    excludeFromNetProfit: false,
    description:          "Office supplies",
    isWageAdvance:        false,
  };

  const JUNE_SUB_PAY = {
    amount:       "350.00",
    paymentDate:  `${YEAR}-06-15`,
    businessLine: null,
  };

  it("/accounting monthlyIncome: month with sub payment shows expense = regular + sub total", async () => {
    h.selectQueue.push([]);                 // [0] paidInvoices
    h.selectQueue.push([]);                 // [1] nonPaidInvoices
    h.selectQueue.push([JUNE_REGULAR_EXP]); // [2] expenses ($100)
    h.selectQueue.push([]);                 // [3] mileageLogs
    h.selectQueue.push([]);                 // [4] subs
    h.selectQueue.push([SETTINGS_ROW]);     // [5] settings
    h.selectQueue.push([]);                 // [6] otherIncome
    h.selectQueue.push([JUNE_SUB_PAY]);     // [7] accFixedAllocSubPayments ($350)
    // [8]+ return [] from empty queue

    const res = await request(app).get(`/reports/accounting?year=${YEAR}`);
    expect(res.status).toBe(200);

    const juneBucket = (res.body.monthlyIncome as any[]).find(
      (b: any) => b.month === `${YEAR}-06`,
    );
    expect(juneBucket).toBeDefined();
    // $100 regular + $350 sub = $450; regression: $100 (sub omitted)
    expect(juneBucket.expenses).toBeCloseTo(450, 10);
  });

  it("/accounting monthlyIncome: month with ONLY a sub payment has non-zero expenses bar", async () => {
    h.selectQueue.push([]);             // [0] paidInvoices
    h.selectQueue.push([]);             // [1] nonPaidInvoices
    h.selectQueue.push([]);             // [2] expenses (none)
    h.selectQueue.push([]);             // [3] mileageLogs
    h.selectQueue.push([]);             // [4] subs
    h.selectQueue.push([SETTINGS_ROW]); // [5] settings
    h.selectQueue.push([]);             // [6] otherIncome
    h.selectQueue.push([JUNE_SUB_PAY]); // [7] accFixedAllocSubPayments ($350)

    const res = await request(app).get(`/reports/accounting?year=${YEAR}`);
    expect(res.status).toBe(200);

    const juneBucket = (res.body.monthlyIncome as any[]).find(
      (b: any) => b.month === `${YEAR}-06`,
    );
    expect(juneBucket).toBeDefined();
    // Regression: $0 (sub payment ignored entirely)
    expect(juneBucket.expenses).toBeCloseTo(350, 10);
  });

  it("/accounting monthlyIncome: sub payment does not bleed into adjacent months", async () => {
    h.selectQueue.push([]);             // [0] paidInvoices
    h.selectQueue.push([]);             // [1] nonPaidInvoices
    h.selectQueue.push([]);             // [2] expenses
    h.selectQueue.push([]);             // [3] mileageLogs
    h.selectQueue.push([]);             // [4] subs
    h.selectQueue.push([SETTINGS_ROW]); // [5] settings
    h.selectQueue.push([]);             // [6] otherIncome
    h.selectQueue.push([JUNE_SUB_PAY]); // [7] accFixedAllocSubPayments (June only)

    const res = await request(app).get(`/reports/accounting?year=${YEAR}`);
    expect(res.status).toBe(200);

    const monthly = res.body.monthlyIncome as any[];
    const juneBucket = monthly.find((b: any) => b.month === `${YEAR}-06`);
    expect(juneBucket?.expenses).toBeCloseTo(350, 10);

    for (const bucket of monthly) {
      if (bucket.month === `${YEAR}-06`) continue;
      expect(bucket.expenses).toBeCloseTo(0, 10);
    }
  });
});

// ── Mileage exclusion from accounting totals ──────────────────────────────────
//
// Guards the nonMileageExpenses filter (~line 493 of reports.ts).
// Mileage is deducted separately via mileage_logs / mileageDeduction, so any
// expense row with category "mileage" must be excluded from:
//   - summary.totalExpenses
//   - expensesByCategory entries
//   - summary.netProfit reduction
//
// A future change that accidentally drops the category filter would silently
// inflate totalExpenses and understate netProfit.
//
// Queue order for GET /accounting (no blFilter):
//   [0]   paidInvoices
//   [1]   nonPaidInvoices
//   [2]   expenses
//   [3]   mileageLogs
//   [4]   subs
//   [5]   settings
//   [6]   otherIncome
//   [7-8] computeDepreciationForYear → assets, assetBusinessUse
//   [9]   allBusinesses
//   [10]  outstandingSubRows (innerJoin)

describe("Mileage expense exclusion from accounting totals", () => {

  // A mileage expense — category must match the filter in reports.ts
  const MILEAGE_EXP = {
    id:                  90,
    date:                `${YEAR}-06-10`,
    amount:              "150.00",
    category:            "mileage",
    businessLine:        null,
    jobId:               null,
    excludeFromNetProfit: false,
    description:         "Mileage log import expense",
    vendor:              null,
    notes:               null,
  };

  // A regular business expense that SHOULD reduce totalExpenses and netProfit
  const REGULAR_SUPPLY_EXP = {
    id:                  91,
    date:                `${YEAR}-06-10`,
    amount:              "100.00",
    category:            "Supplies",
    businessLine:        null,
    jobId:               null,
    excludeFromNetProfit: false,
    description:         "Office supplies",
    vendor:              null,
    notes:               null,
  };

  it("mileage expense is absent from summary.totalExpenses, expensesByCategory, and netProfit", async () => {
    // Revenue: $1 000 paid invoice.
    // Expenses: $150 mileage (must be excluded) + $100 Supplies (must be included).
    // No mileage logs → mileageDeduction = 0.
    // No assets       → depreciationDeduction = 0.
    //
    // Expected:
    //   summary.totalExpenses = 100    (mileage row excluded)
    //   summary.netProfit     = 1 000 - 100 = 900
    //   expensesByCategory    has "Supplies" entry but NO "mileage" entry
    //
    // Regression values (if filter were absent):
    //   summary.totalExpenses = 250, netProfit = 750

    h.selectQueue.push([PAID_INVOICE]);                      // [0] paidInvoices
    h.selectQueue.push([]);                                  // [1] nonPaidInvoices
    h.selectQueue.push([MILEAGE_EXP, REGULAR_SUPPLY_EXP]);  // [2] expenses
    h.selectQueue.push([]);                                  // [3] mileageLogs
    h.selectQueue.push([]);                                  // [4] subs
    h.selectQueue.push([SETTINGS_ROW]);                      // [5] settings
    h.selectQueue.push([]);                                  // [6] otherIncome
    h.selectQueue.push([]);                                  // [7] assets (computeDepreciationForYear)
    h.selectQueue.push([]);                                  // [8] assetBusinessUse
    h.selectQueue.push([]);                                  // [9] allBusinesses
    h.selectQueue.push([]);                                  // [10] outstandingSubRows

    const res = await request(app).get(`/reports/accounting?year=${YEAR}`);
    expect(res.status).toBe(200);

    // ── summary.totalExpenses must exclude the mileage row ──────────────────
    expect(res.body.summary.totalExpenses).toBeCloseTo(100, 10);

    // ── summary.netProfit must reflect only the regular expense ─────────────
    // netProfit = paidRevenue(1000) - (totalExpenses(100) - ownerDrawTotal(0))
    //            - mileageDeduction(0) - depreciationDeduction(0)
    expect(res.body.summary.netProfit).toBeCloseTo(900, 10);

    // ── expensesByCategory must not contain a "mileage" entry ───────────────
    const categories: string[] = (res.body.expensesByCategory as Array<{ category: string }>)
      .map(e => e.category);
    expect(categories).not.toContain("mileage");

    // ── The regular expense still appears correctly ──────────────────────────
    const suppliesEntry = (res.body.expensesByCategory as Array<{ category: string; amount: number }>)
      .find(e => e.category === "Supplies");
    expect(suppliesEntry).toBeDefined();
    expect(suppliesEntry!.amount).toBeCloseTo(100, 10);
  });

  it("/accounting monthlyIncome: mileage expense is absent from the matching month's expenses bar", async () => {
    // Guards the nonMileageExpenses filter flowing into the monthlyIncome loop
    // (reports.ts ~line 646):
    //   monthExp = nonMileageExpenses.filter(e => e.date.startsWith(ms) && ...)
    // nonMileageExpenses is built from expenses.filter(e => e.category !== "mileage"),
    // so the mileage row must never appear in any month's expenses field.
    //
    // Scenario: $150 mileage expense + $100 Supplies expense, both dated June of YEAR.
    // The June monthlyIncome bucket's expenses field must equal $100 (Supplies only).
    // A regression would produce $250 (both amounts counted).

    h.selectQueue.push([PAID_INVOICE]);                      // [0] paidInvoices (June invoice)
    h.selectQueue.push([]);                                  // [1] nonPaidInvoices
    h.selectQueue.push([MILEAGE_EXP, REGULAR_SUPPLY_EXP]);  // [2] expenses
    h.selectQueue.push([]);                                  // [3] mileageLogs
    h.selectQueue.push([]);                                  // [4] subs
    h.selectQueue.push([SETTINGS_ROW]);                      // [5] settings
    h.selectQueue.push([]);                                  // [6] otherIncome
    h.selectQueue.push([]);                                  // [7] assets (computeDepreciationForYear)
    h.selectQueue.push([]);                                  // [8] assetBusinessUse
    h.selectQueue.push([]);                                  // [9] allBusinesses
    h.selectQueue.push([]);                                  // [10] outstandingSubRows

    const res = await request(app).get(`/reports/accounting?year=${YEAR}`);
    expect(res.status).toBe(200);

    // Both expenses are dated ${YEAR}-06-10 → they land in the June bucket
    const juneBucket = (res.body.monthlyIncome as any[]).find(
      (b: any) => b.month === `${YEAR}-06`,
    );
    expect(juneBucket).toBeDefined();

    // expenses bar must be $100 (Supplies only) — mileage row excluded
    // Regression value: $250 (mileage counted)
    expect(juneBucket.expenses).toBeCloseTo(100, 10);

    // Regular expense still counted — guard against over-exclusion
    expect(juneBucket.expenses).toBeGreaterThan(0);
  });
});
