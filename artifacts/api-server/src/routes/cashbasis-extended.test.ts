// Cash-basis extended regression tests
//
// Guards five cash-basis accounting rules introduced in Task #1912:
//   1. Outstanding cost-bookings excluded from P&L (description ends with "(outstanding)")
//   2. Fixed/allocation sub payments from sub_payment_records included in P&L cogs
//   3. No double-count: outstanding + sub_payment = 1× the sub payment, not 2×
//   4. Dashboard totalExpenses includes fixed/allocation sub payments
//   5. Dashboard outstanding cost-bookings excluded from totalExpenses
//
// Queue order for GET /reports/profit-loss (no blFilter, no hourly subs):
//   [0]  invRows              — invoices (issueDate-bounded, status=paid)
//   [1]  expRows              — expenses (ne mileage at DB level)
//   [2]  mileRows             — mileage aggregate {totalMiles, totalDed}
//   [3]  otherRows            — otherIncome
//   [4]  plSubPayRows         — fixed/allocation sub_payment_records (Task #1912)
//   [5]  outstandingSubRows   — job_subcontractors innerJoin jobs innerJoin subs
//   [6]  closedCountRow       — count of closed jobs in year
//   [7]  assets               — computeDepreciationForYear
//   [8]  busUseRows           — computeDepreciationForYear
//   [9]  ownerContribRows     — owner_capital_entries
//   [10] settingsRows         — settings (federalTaxElection)
//   [11] waterfallPaidInvs    — computeOwnerWaterfall (Task #1913; no jobId → no subHours query)
//
// Queue order for GET /reports/dashboard (no blFilter, default period=month):
//   [0-9]  main Promise.all (kpiPaidInv, kpiNonPaidInv, kpiExpenses, allMileage,
//           kpiOtherIncome, kpiActiveJobs, recentJobs, recentInvoices,
//           kpiOwnerCapital, allSubPayments)
//   [10] ytdMileageLogs  — period=month extra select for YTD mileage display
//   [11] subPayRows      — outstanding sub balance (innerJoin)
//   [12] allBusinesses
//   [13-36] monthlyRevenue loop: 6 months × 4 queries

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
  (_req as any).user = { id: 1, claims: { sub: "user_1" } };
  next();
});
app.use("/reports", reportsRouter);

beforeEach(() => {
  h.selectQueue.length = 0;
});

// ── Shared fixtures ───────────────────────────────────────────────────────────

const YEAR = new Date().getFullYear();
const CURRENT_MONTH_STR = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

// Invoice paid in the current year, issued in year
const PAID_INVOICE = {
  id: 1,
  status: "paid",
  issueDate: `${YEAR}-06-01`,
  total: "1000.00",
};

const NO_MILEAGE = [{ totalMiles: null, totalDed: null }];

/**
 * Push the 12 slots consumed by GET /profit-loss (no blFilter, no hourly subs).
 * Updated for Task #1913: computeOwnerWaterfall paidInvs slot added at [11].
 * @param expSlot — expenses for slot [1]
 * @param subPaySlot — sub_payment_records for slot [4] (default [])
 */
function pushPL(expSlot: any[], subPaySlot: any[] = []): void {
  h.selectQueue.push([PAID_INVOICE]); // [0] invRows
  h.selectQueue.push(expSlot);        // [1] expRows
  h.selectQueue.push(NO_MILEAGE);     // [2] mileRows
  h.selectQueue.push([]);             // [3] otherRows
  h.selectQueue.push(subPaySlot);     // [4] plSubPayRows
  h.selectQueue.push([]);             // [5] outstandingSubRows
  h.selectQueue.push([{ n: 0 }]);    // [6] closedCountRow
  h.selectQueue.push([]);             // [7] assets
  h.selectQueue.push([]);             // [8] busUseRows
  // computeOwnerWaterfall fires its first await synchronously before the outer
  // Promise.all calls .then() on the two direct chain objects (ownerContribRows, settingsRows).
  h.selectQueue.push([]);             // [9]  waterfallPaidInvs (no jobId → no subHours query)
  h.selectQueue.push([]);             // [10] ownerContribRows
  h.selectQueue.push([{}]);           // [11] settingsRows
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Return the YYYY-MM string for N months before the current month. */
function monthAgo(n: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ── P&L cash-basis tests ──────────────────────────────────────────────────────

describe("P&L cash-basis — outstanding cost-booking exclusion and sub payment inclusion", () => {

  it("outstanding cost-booking row is excluded from P&L expenses and netProfit", async () => {
    // An expense with description ending in "(outstanding)" represents an accrual-style
    // cost-booking. Cash-basis P&L must NOT count it as a deduction.
    const OUTSTANDING_EXP = {
      id: 50,
      category: "Subcontractor",
      amount: "750.00",
      description: "Work on roof (outstanding)",
      excludeFromNetProfit: false,
    };

    pushPL([OUTSTANDING_EXP]);

    const res = await request(app).get(`/reports/profit-loss?year=${YEAR}`);
    expect(res.status).toBe(200);

    // totalOperatingExpenses must be $0 — outstanding row excluded
    // Regression: $750 (outstanding row counted as deduction)
    expect(res.body.totalOperatingExpenses).toBeCloseTo(0, 10);

    // netProfit = revenue($1 000) - cogs($0) - opex($0) - mileage($0) - deprec($0) = $1 000
    // Regression: $1 000 - $750 = $250
    expect(res.body.netProfit).toBeCloseTo(1000, 10);
  });

  it("fixed/allocation sub payment from sub_payment_records appears in P&L cogs", async () => {
    // A cash payment recorded via pay-worker (in sub_payment_records only, not expenses)
    // must reduce P&L netProfit via the cogs bucket.
    const SUB_PAYMENT = { id: 1, amount: "500.00" };

    pushPL([], [SUB_PAYMENT]);

    const res = await request(app).get(`/reports/profit-loss?year=${YEAR}`);
    expect(res.status).toBe(200);

    // cogs must contain the sub payment — it is contract labor (COGS)
    // Regression: cogs = 0 (sub payment not added)
    expect(res.body.cogs.total).toBeCloseTo(500, 10);

    // netProfit = revenue($1 000) - cogs($500) - opex($0) ... = $500
    // Regression (sub payment missing): netProfit = $1 000
    expect(res.body.netProfit).toBeCloseTo(500, 10);
  });

  it("double-count: outstanding expense + sub_payment counted only once (once paid)", async () => {
    // Scenario: Willard completed a job and used "Complete Job & Keep As Outstanding".
    // This created an "(outstanding)" expense row for $750.
    // Later he ran pay-worker which created a sub_payment_record for $750.
    //
    // Cash-basis rule: outstanding row is excluded; sub_payment_record is included.
    // Net effect: $750 subtracted from profit — not $1 500 (double-count).
    const OUTSTANDING_EXP = {
      id: 50,
      category: "Subcontractor",
      amount: "750.00",
      description: "Roof work (outstanding)",
      excludeFromNetProfit: false,
    };
    const PAID_RECORD = { id: 1, amount: "750.00" };

    pushPL([OUTSTANDING_EXP], [PAID_RECORD]);

    const res = await request(app).get(`/reports/profit-loss?year=${YEAR}`);
    expect(res.status).toBe(200);

    // cogs = $750 from sub_payment_records only (outstanding row excluded)
    // Double-count regression: $1 500
    expect(res.body.cogs.total).toBeCloseTo(750, 10);

    // netProfit = revenue($1 000) - cogs($750) = $250
    // Double-count regression: $1 000 - $1 500 = -$500
    expect(res.body.netProfit).toBeCloseTo(250, 10);
  });

  it("regular (non-outstanding) Subcontractor expense is NOT excluded", async () => {
    // A Subcontractor expense without "(outstanding)" in the description
    // must still reduce profit normally (e.g. a manually logged hourly sub expense).
    const HOURLY_EXP = {
      id: 60,
      category: "Subcontractor",
      amount: "300.00",
      description: "Hourly sub labour - July",
      excludeFromNetProfit: false,
    };

    pushPL([HOURLY_EXP]);

    const res = await request(app).get(`/reports/profit-loss?year=${YEAR}`);
    expect(res.status).toBe(200);

    // totalOperatingExpenses or cogs must include $300
    const totalDeducted = (res.body.cogs?.total ?? 0) + res.body.totalOperatingExpenses;
    expect(totalDeducted).toBeCloseTo(300, 10);

    // netProfit = $1 000 - $300 = $700
    expect(res.body.netProfit).toBeCloseTo(700, 10);
  });

  it("expense with description containing but NOT ending with '(outstanding)' is NOT excluded", async () => {
    // Guard against an over-aggressive filter: only descriptions that END with "(outstanding)"
    // are excluded. Mid-string occurrences (e.g. "Replaced outstanding faucet") must be kept.
    const MIDSTRING_EXP = {
      id: 51,
      category: "Materials",
      amount: "120.00",
      description: "Replaced outstanding faucet",
      excludeFromNetProfit: false,
    };

    pushPL([MIDSTRING_EXP]);

    const res = await request(app).get(`/reports/profit-loss?year=${YEAR}`);
    expect(res.status).toBe(200);

    // Expense must be included (description contains but doesn't end with "(outstanding)")
    // Regression (over-filter): netProfit = $1 000 instead of $880
    expect(res.body.netProfit).toBeCloseTo(880, 10);
  });

  it("sub payment and non-outstanding expense are both included, no double-deduction", async () => {
    // A legitimate non-outstanding expense (e.g. materials) AND a separate fixed sub
    // payment should both reduce profit independently.
    const MATERIALS_EXP = {
      id: 70,
      category: "Materials",
      amount: "200.00",
      description: "Lumber",
      excludeFromNetProfit: false,
    };
    const SUB_PAYMENT = { id: 2, amount: "400.00" };

    pushPL([MATERIALS_EXP], [SUB_PAYMENT]);

    const res = await request(app).get(`/reports/profit-loss?year=${YEAR}`);
    expect(res.status).toBe(200);

    // cogs = materials($200) + sub_payment($400) = $600
    expect(res.body.cogs.total).toBeCloseTo(600, 10);

    // netProfit = $1 000 - $600 = $400
    expect(res.body.netProfit).toBeCloseTo(400, 10);
  });
});

// ── Dashboard byBusinessLine period isolation ─────────────────────────────────
//
// Guards that subPayByBl uses only KPI-period payments.
// The allSubPayments query spans 6 months (chartStartDate) but byBusinessLine must
// be period-consistent with invoices and ordinary expenses.
//
// Same queue order as the main dashboard describe above.

describe("Dashboard byBusinessLine — sub payment period isolation", () => {
  it("prior-chart-month sub payment does NOT inflate byBusinessLine for period=month", async () => {
    const THREE_MONTHS_AGO = monthAgo(3);
    const PRIOR_BL_PAYMENT = {
      amount: "600.00",
      paymentDate: `${THREE_MONTHS_AGO}-15`,
      businessLine: "mfh",
    };

    for (let i = 0; i < 9; i++) h.selectQueue.push([]);   // [0-8] other KPI slots
    h.selectQueue.push([PRIOR_BL_PAYMENT]);                // [9] allSubPayments (6-month window)
    h.selectQueue.push([]);                                // [10] ytdMileageLogs
    h.selectQueue.push([]);                                // [11] subPayRows (outstanding balance)
    h.selectQueue.push([{ slug: "mfh", name: "MFH" }]);   // [12] allBusinesses
    for (let i = 0; i < 24; i++) h.selectQueue.push([]);  // [13-36] monthly chart

    // period=month is the default
    const res = await request(app).get("/reports/dashboard");
    expect(res.status).toBe(200);

    const mfhLine = (res.body.byBusinessLine as any[]).find((b: any) => b.businessLine === "mfh");
    expect(mfhLine).toBeDefined();

    // The prior-month payment is NOT in the current-month KPI period →
    // byBusinessLine should show $0 expenses for "mfh".
    // Regression: $600 (using the wide chart window for BL breakdown)
    expect(mfhLine.totalExpenses).toBeCloseTo(0, 10);
  });

  it("current-month sub payment IS counted in byBusinessLine for period=month", async () => {
    const CURRENT_MONTH = monthAgo(0);
    const CURRENT_BL_PAYMENT = {
      amount: "350.00",
      paymentDate: `${CURRENT_MONTH}-10`,
      businessLine: "mfh",
    };

    for (let i = 0; i < 9; i++) h.selectQueue.push([]);   // [0-8]
    h.selectQueue.push([CURRENT_BL_PAYMENT]);              // [9] allSubPayments
    h.selectQueue.push([]);                                // [10] ytdMileageLogs
    h.selectQueue.push([]);                                // [11] subPayRows
    h.selectQueue.push([{ slug: "mfh", name: "MFH" }]);   // [12] allBusinesses
    for (let i = 0; i < 24; i++) h.selectQueue.push([]);  // [13-36] monthly chart

    const res = await request(app).get("/reports/dashboard");
    expect(res.status).toBe(200);

    const mfhLine = (res.body.byBusinessLine as any[]).find((b: any) => b.businessLine === "mfh");
    expect(mfhLine).toBeDefined();

    // Current-month payment is within the KPI period → must appear
    // Regression: $0 (payment excluded because filter was too narrow)
    expect(mfhLine.totalExpenses).toBeCloseTo(350, 10);
    expect(mfhLine.businessExpenses).toBeCloseTo(350, 10);
  });
});

// ── Accounting monthly income chart: sub payment inclusion ────────────────────
//
// Guards that accFixedAllocSubPayments appear in the per-month expenses bar of
// the accounting route's monthlyIncome array.
//
// Queue order for GET /accounting (no blFilter, year = current):
//   [0]  paidInvoices
//   [1]  nonPaidInvoices
//   [2]  expenses
//   [3]  mileageLogs
//   [4]  subs             — empty → computeYtd never called
//   [5]  settings
//   [6]  otherIncome
//   [7]  accFixedAllocSubPayments
//   [8]  assets           — computeDepreciationForYear
//   [9]  assetBusinessUse — computeDepreciationForYear
//   [10] allBusinesses
//   [11] outstandingSubRows (innerJoin)

describe("Accounting monthly income chart — sub payment inclusion", () => {
  it("fixed/allocation sub payment from June appears in June expenses bar", async () => {
    const JUNE_PAYMENT = {
      amount: "450.00",
      paymentDate: `${YEAR}-06-15`,
      jobId: 1,
      businessLine: null,
    };

    h.selectQueue.push([]);             // [0] paidInvoices
    h.selectQueue.push([]);             // [1] nonPaidInvoices
    h.selectQueue.push([]);             // [2] expenses
    h.selectQueue.push([]);             // [3] mileageLogs
    h.selectQueue.push([]);             // [4] subs
    h.selectQueue.push([{}]);           // [5] settings
    h.selectQueue.push([]);             // [6] otherIncome
    h.selectQueue.push([JUNE_PAYMENT]); // [7] accFixedAllocSubPayments
    h.selectQueue.push([]);             // [8] assets
    h.selectQueue.push([]);             // [9] assetBusinessUse
    h.selectQueue.push([]);             // [10] allBusinesses
    h.selectQueue.push([]);             // [11] outstandingSubRows

    const res = await request(app).get(`/reports/accounting?year=${YEAR}`);
    expect(res.status).toBe(200);

    const june = (res.body.monthlyIncome as any[]).find((m: any) => m.month === `${YEAR}-06`);
    expect(june).toBeDefined();

    // June expense bar must include the $450 sub payment
    // Regression: june.expenses = 0 (sub payment not included in chart)
    expect(june.expenses).toBeCloseTo(450, 10);

    // Other months must remain $0
    const jan = (res.body.monthlyIncome as any[]).find((m: any) => m.month === `${YEAR}-01`);
    expect(jan?.expenses ?? 0).toBeCloseTo(0, 10);
  });

  it("sub payment also appears in totalExpenses and directJobCosts", async () => {
    const MAY_PAYMENT = {
      amount: "800.00",
      paymentDate: `${YEAR}-05-20`,
      jobId: 2,
      businessLine: null,
    };

    h.selectQueue.push([]);              // [0] paidInvoices
    h.selectQueue.push([]);              // [1] nonPaidInvoices
    h.selectQueue.push([]);              // [2] expenses
    h.selectQueue.push([]);             // [3] mileageLogs
    h.selectQueue.push([]);              // [4] subs
    h.selectQueue.push([{}]);            // [5] settings
    h.selectQueue.push([]);              // [6] otherIncome
    h.selectQueue.push([MAY_PAYMENT]);   // [7] accFixedAllocSubPayments
    h.selectQueue.push([]);              // [8] assets
    h.selectQueue.push([]);              // [9] assetBusinessUse
    h.selectQueue.push([]);              // [10] allBusinesses
    h.selectQueue.push([]);              // [11] outstandingSubRows

    const res = await request(app).get(`/reports/accounting?year=${YEAR}`);
    expect(res.status).toBe(200);

    // Summary must include the sub payment
    expect(res.body.summary.totalExpenses).toBeCloseTo(800, 10);

    // directJobCosts must include the sub payment (sub payments are always job-linked)
    expect(res.body.summary.directJobCosts).toBeCloseTo(800, 10);

    // Subcontractor must appear in expensesByCategory
    const subCat = (res.body.expensesByCategory as any[]).find((c: any) => c.category === "Subcontractor");
    expect(subCat).toBeDefined();
    expect(subCat.amount).toBeCloseTo(800, 10);
  });
});

// ── Dashboard monthly chart: sub payment in prior chart month ─────────────────
//
// The dashboard chart always renders the last 6 months.  For period=month the
// KPI period is only the current month, but allSubPayments must cover the wider
// 6-month window (chartStartDate) so prior months aren't blank.
//
// Queue order for GET /dashboard (no blFilter, default period=month):
//   [0-9]  main 10-item Promise.all (allSubPayments = slot [9], uses chartStartDate)
//   [10]   ytdMileageLogs  — period=month extra await
//   [11]   subPayRows      — outstanding sub balance (innerJoin)
//   [12]   allBusinesses
//   [13-36] monthlyRevenue loop: 6 months × 4 queries

import { default as dashReportsRouter } from "./reports";

const dashApp = express();
dashApp.use(express.json());
dashApp.use((_req, _res, next) => {
  (_req as any).user = { id: 1, claims: { sub: "user_1" } };
  next();
});
dashApp.use("/reports", dashReportsRouter);

describe("Dashboard monthly chart — sub payment in prior chart month", () => {
  it("sub payment from 3 months ago appears in that month's chart expenses", async () => {
    const THREE_MONTHS_AGO = monthAgo(3);
    const PRIOR_SUB_PAYMENT = {
      amount: "600.00",
      paymentDate: `${THREE_MONTHS_AGO}-15`,
      businessLine: null,
    };

    // [0-9] main Promise.all — allSubPayments at [9] has the prior-month payment
    for (let i = 0; i < 9; i++) h.selectQueue.push([]);   // [0-8] other KPI slots
    h.selectQueue.push([PRIOR_SUB_PAYMENT]);               // [9] allSubPayments
    h.selectQueue.push([]);                                // [10] ytdMileageLogs
    h.selectQueue.push([]);                                // [11] subPayRows (outstanding balance)
    h.selectQueue.push([]);                                // [12] allBusinesses
    // [13-36] monthlyRevenue loop: 6 months × 4 queries = 24 selects
    for (let i = 0; i < 24; i++) h.selectQueue.push([]);

    const res = await request(dashApp).get("/reports/dashboard");
    expect(res.status).toBe(200);

    const chart: any[] = res.body.monthlyRevenue;
    expect(chart).toBeDefined();

    // The prior month should have expenses = $600 from the sub payment
    const priorMonthBar = chart.find((m: any) => m.month === THREE_MONTHS_AGO);
    expect(priorMonthBar).toBeDefined();
    expect(priorMonthBar.expenses).toBeCloseTo(600, 10);

    // The current month should have $0 expenses (payment is not in this KPI period)
    const currentMonthBar = chart.find((m: any) => m.month === monthAgo(0));
    expect(currentMonthBar).toBeDefined();
    expect(currentMonthBar.expenses).toBeCloseTo(0, 10);
  });

  it("sub payment in current month appears in both KPI totalExpenses and the chart", async () => {
    const CURRENT_MONTH = monthAgo(0);
    const CURRENT_MONTH_DAY = `${CURRENT_MONTH}-10`;
    const CURRENT_SUB_PAYMENT = {
      amount: "350.00",
      paymentDate: CURRENT_MONTH_DAY,
      businessLine: null,
    };

    for (let i = 0; i < 9; i++) h.selectQueue.push([]);   // [0-8] other KPI slots
    h.selectQueue.push([CURRENT_SUB_PAYMENT]);             // [9] allSubPayments
    h.selectQueue.push([]);                                // [10] ytdMileageLogs
    h.selectQueue.push([]);                                // [11] subPayRows
    h.selectQueue.push([]);                                // [12] allBusinesses
    for (let i = 0; i < 24; i++) h.selectQueue.push([]);  // [13-36] monthly chart

    const res = await request(dashApp).get("/reports/dashboard");
    expect(res.status).toBe(200);

    // KPI: totalExpenses must include the current-month sub payment
    expect(res.body.totalExpenses).toBeCloseTo(350, 10);

    // Monthly chart: current month bar must also include it
    const currentMonthBar = (res.body.monthlyRevenue as any[]).find(
      (m: any) => m.month === CURRENT_MONTH,
    );
    expect(currentMonthBar).toBeDefined();
    expect(currentMonthBar.expenses).toBeCloseTo(350, 10);
  });
});
