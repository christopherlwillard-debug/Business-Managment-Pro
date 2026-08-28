// Mileage rate split 2026 — regression tests
//
// Covers three concerns:
//
//  1. getIrsRateForDate boundary — trips dated before 2026-07-01 use $0.725;
//     trips dated 2026-07-01 or later use $0.760. This ensures newly-logged
//     H2 2026 trips automatically receive the correct IRS deduction.
//
//  2. Mileage-category expense exclusion from /accounting — expenses with
//     category="mileage" must not appear in totalExpenses or netProfit. The
//     actual mileage deduction is sourced from mileage_logs.deductionAmount,
//     not from the expenses table, so double-counting is prevented.
//
//  3. Mileage-category expense exclusion from /year-end — same invariant for
//     the Schedule C report (separate code path from /accounting).
//
//  Note on /profit-loss: that route filters mileage at DB level via
//  ne(expensesTable.category, "mileage") in the WHERE clause (confirmed at
//  routes/reports.ts ~line 1269). A mock-queue test would bypass the DB filter
//  and is therefore not meaningful; the DB-level filter is audited in code review.
//
// Queue order reference:
//
//   GET /accounting?year=YEAR
//     [0]  paidInvoices             — no issueDate filter
//     [1]  nonPaidInvoices          — issueDate-bounded
//     [2]  expenses                 ← mileage expense injected here
//     [3]  mileageLogs
//     [4]  subs
//     [5]  settings
//     [6]  otherIncome
//     [7]  accFixedAllocSubPayments
//     [8]  assets                   — computeDepreciationForYear
//     [9]  assetBusinessUse
//     [10] waterfallPaidInvs        — computeOwnerWaterfall
//     [11] accOwnerContribRows      — ownerCapitalEntries
//     (further selects return [] from the exhausted queue)
//
//   GET /year-end?year=YEAR
//     [0]  invoices                 — no date filter
//     [1]  expenses                 ← mileage expense injected here
//     [2]  mileageLogs
//     [3]  otherIncomeRows
//     [4]  assets
//     [5]  taxPayments
//     [6]  subs
//     [7]  settings
//     [8]  busUseRows (assetBusinessUse)
//     [9]  fixedAllocSubPayments

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
  getRequestUserId: () => null,
}));
vi.mock("../lib/irs-rates.js",  () => ({
  getIrsMileageRate: vi.fn().mockReturnValue(0.760),
  getIrsRateForDate: (date: string) => date >= "2026-07-01" ? 0.760 : date >= "2026-01-01" ? 0.725 : date >= "2025-01-01" ? 0.700 : 0.670,
  calculateMileageDeduction: (miles: number | string, classification: string, date: string) => ({
    rate: date >= "2026-07-01" ? 0.760 : date >= "2026-01-01" ? 0.725 : date >= "2025-01-01" ? 0.700 : 0.670,
    deduction: classification === "business" ? Number(miles) * (date >= "2026-07-01" ? 0.760 : date >= "2026-01-01" ? 0.725 : date >= "2025-01-01" ? 0.700 : 0.670) : 0,
  }),
  summarizeMileageRecords: (logs: Array<{ miles: number | string; classification: string; date: string }>) => {
    const periods = new Map<string, any>();
    for (const log of logs) {
      if (log.classification !== "business") continue;
      const rate = log.date >= "2026-07-01" ? 0.760 : log.date >= "2026-01-01" ? 0.725 : log.date >= "2025-01-01" ? 0.700 : 0.670;
      const effectiveDate = rate === 0.760 ? "2026-07-01" : rate === 0.725 ? "2026-01-01" : rate === 0.700 ? "2025-01-01" : "2024-01-01";
      const year = log.date.slice(0, 4);
      const key = `${year}:${effectiveDate}`;
      const period = periods.get(key) ?? {
        effectiveDate,
        periodStart: effectiveDate > `${year}-01-01` ? effectiveDate : `${year}-01-01`,
        periodEnd: effectiveDate === "2026-01-01" ? "2026-06-30" : `${year}-12-31`,
        rate,
        miles: 0,
        deduction: 0,
      };
      period.miles += Number(log.miles) || 0;
      period.deduction += (Number(log.miles) || 0) * rate;
      periods.set(key, period);
    }
    const ratePeriods = [...periods.values()].sort((a, b) => a.periodStart.localeCompare(b.periodStart));
    const totalMiles = ratePeriods.reduce((sum, period) => sum + period.miles, 0);
    const totalDeduction = ratePeriods.reduce((sum, period) => sum + period.deduction, 0);
    return { totalMiles, totalDeduction, ratePerMile: ratePeriods.length === 1 ? ratePeriods[0].rate : null, ratePeriods };
  },
}));
vi.mock("../lib/allocation.js", () => ({
  computeAllocationSplitPools: vi.fn().mockResolvedValue([]),
  computeSubOwed:              vi.fn().mockReturnValue(0),
}));

// Import pure function and router after mocks are in place
const { getIrsRateForDate } = await import("./mileage");
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
const YEAR = 2026;

const PAID_INVOICE = {
  id: 1,
  status: "paid",
  subtotal: "1000.00",
  taxAmount: "0",
  total: "1000.00",
  issueDate: `${YEAR}-06-01`,
  stripePaidAt: null,
  squarePaidAt: null,
  invoiceCity: "Other City",
  invoiceState: "KY",
  jobCity: null,
  jobState: null,
  clientName: "Test Client",
  invoiceNumber: "INV-001",
  businessLine: null,
  jobId: null,
  lineItems: [{ description: "Test service", quantity: 1, unitPrice: 1000 }],
};

const SETTINGS_ROW = {
  mileageRate: "0.760",
  operatingReserveMode: "0",
  operatingReserveCustom: null,
  includeGrowthFundInReserve: 0,
  companyName: "Test LLC",
  thresholdAmount1099: "600",
};

// Mileage-category expense — must be excluded from totalExpenses and netProfit
const MILEAGE_EXPENSE = {
  id: 90,
  date: `${YEAR}-08-01`,
  amount: "200.00",
  category: "mileage",
  businessLine: null,
  jobId: null,
  excludeFromNetProfit: false,
  description: "August 2026 IRS Mileage",
  vendor: "IRS Mileage",
  notes: null,
  mileageImportId: null,
};

// Ordinary deductible expense — must still count
const REGULAR_EXP = {
  id: 91,
  date: `${YEAR}-06-15`,
  amount: "100.00",
  category: "Supplies",
  businessLine: null,
  jobId: null,
  excludeFromNetProfit: false,
  description: "Office supplies",
  vendor: null,
  notes: null,
};

// ── 1. getIrsRateForDate — 2026 split boundary ───────────────────────────────

describe("getIrsRateForDate — 2026 H1/H2 rate split", () => {

  it("returns $0.725/mile for trips before July 1, 2026", () => {
    expect(getIrsRateForDate("2026-01-01")).toBe(0.725);
    expect(getIrsRateForDate("2026-06-30")).toBe(0.725);
  });

  it("returns $0.760/mile for July 1, 2026 and later", () => {
    expect(getIrsRateForDate("2026-07-01")).toBe(0.760);
    expect(getIrsRateForDate("2026-08-15")).toBe(0.760);
    expect(getIrsRateForDate("2026-12-31")).toBe(0.760);
  });

  it("2025 dates still return $0.700/mile (unchanged)", () => {
    expect(getIrsRateForDate("2025-01-01")).toBe(0.700);
    expect(getIrsRateForDate("2025-12-31")).toBe(0.700);
  });

  it("2024 dates still return $0.670/mile (unchanged)", () => {
    expect(getIrsRateForDate("2024-06-15")).toBe(0.670);
  });

  it("trip on June 30 uses H1 rate; trip on July 1 uses H2 rate", () => {
    const h1Trip = { miles: 100, date: "2026-06-30" };
    const h2Trip = { miles: 100, date: "2026-07-01" };
    const h1Deduction = h1Trip.miles * getIrsRateForDate(h1Trip.date);
    const h2Deduction = h2Trip.miles * getIrsRateForDate(h2Trip.date);
    expect(h1Deduction).toBeCloseTo(72.5, 10);
    expect(h2Deduction).toBeCloseTo(76.0, 10);
  });
});

// Shared mileage-log fixtures for split-rate tests
const H1_LOG = {
  id: 101, date: `${YEAR}-06-30`, miles: "100", classification: "business",
  ratePerMile: "0.725", deductionAmount: "72.50", businessId: 1, subcontractorId: null,
};
const H2_LOG = {
  id: 102, date: `${YEAR}-07-01`, miles: "100", classification: "business",
  ratePerMile: "0.760", deductionAmount: "76.00", businessId: 1, subcontractorId: null,
};
// ── 2. /accounting — mileage expense excluded from totalExpenses/netProfit ───

describe("/accounting — mileage-category expense excluded from totalExpenses and netProfit", () => {

  /**
   * Push the 12 queue slots consumed by GET /accounting.
   * Accepts a custom expenses array for slot [2] and optional mileage logs for slot [3].
   */
  function pushAccountingSelects(expensesSlot: any[], mileageSlot: any[] = []) {
    h.selectQueue.push([PAID_INVOICE]); // [0] paidInvoices — no issueDate filter
    h.selectQueue.push([]);             // [1] nonPaidInvoices — issueDate-bounded
    h.selectQueue.push(expensesSlot);   // [2] expenses
    h.selectQueue.push(mileageSlot);    // [3] mileageLogs
    h.selectQueue.push([]);             // [4] subs (empty → computeYtd mock returns 0)
    h.selectQueue.push([SETTINGS_ROW]); // [5] settings
    h.selectQueue.push([]);             // [6] otherIncome
    h.selectQueue.push([]);             // [7] accFixedAllocSubPayments
    h.selectQueue.push([]);             // [8] assets (computeDepreciationForYear)
    h.selectQueue.push([]);             // [9] assetBusinessUse
    h.selectQueue.push([]);             // [10] computeOwnerWaterfall paidInvs
    h.selectQueue.push([]);             // [11] accOwnerContribRows (ownerCapitalEntries)
    h.selectQueue.push([]);             // [12] allBusinesses
    h.selectQueue.push([]);             // [13] outstandingSubRows
  }

  it("mileage-category expense is absent from totalExpenses (only regular expense counts)", async () => {
    pushAccountingSelects([MILEAGE_EXPENSE, REGULAR_EXP]);

    const res = await request(app).get(`/reports/accounting?year=${YEAR}`);
    expect(res.status).toBe(200);

    // totalExpenses = $100 (Supplies only); a regression would produce $300
    expect(res.body.summary.totalExpenses).toBeCloseTo(100, 10);
  });

  it("mileage-category expense does not reduce netProfit", async () => {
    pushAccountingSelects([MILEAGE_EXPENSE, REGULAR_EXP]);

    const res = await request(app).get(`/reports/accounting?year=${YEAR}`);
    expect(res.status).toBe(200);

    // netProfit = paidRevenue ($1 000) − business expenses ($100) − mileageDeduction ($0) = $900
    // A regression (mileage expense included) would produce $700
    expect(res.body.summary.netProfit).toBeCloseTo(900, 10);
  });

  it("mileage-only expenses: totalExpenses is zero, netProfit equals revenue", async () => {
    pushAccountingSelects([MILEAGE_EXPENSE]);

    const res = await request(app).get(`/reports/accounting?year=${YEAR}`);
    expect(res.status).toBe(200);

    expect(res.body.summary.totalExpenses).toBeCloseTo(0, 10);
    // netProfit = $1 000 revenue − $0 business expenses = $1 000
    expect(res.body.summary.netProfit).toBeCloseTo(1000, 10);
  });

  it("summary keeps the rate null and exposes separate IRS rate periods for split-year trips", async () => {
    pushAccountingSelects([], [H1_LOG, H2_LOG]);

    const res = await request(app).get(`/reports/accounting?year=${YEAR}`);
    expect(res.status).toBe(200);

    expect(res.body.summary.mileageRate).toBeNull();
    expect(res.body.summary.ratePeriods).toEqual([
      { effectiveDate: "2026-01-01", periodStart: "2026-01-01", periodEnd: "2026-06-30", rate: 0.725, miles: 100, deduction: 72.5 },
      { effectiveDate: "2026-07-01", periodStart: "2026-07-01", periodEnd: "2026-12-31", rate: 0.76, miles: 100, deduction: 76 },
    ]);
    expect(res.body.summary.mileageDeduction).toBeCloseTo(148.5, 5);
  });
});

// ── 3. /year-end — mileage expense excluded from Schedule C totals ────────────

describe("/year-end — mileage-category expense excluded from Schedule C totalExpenses and netProfit", () => {

  /**
   * Push the 10 queue slots consumed by GET /year-end.
   * Accepts a custom expenses array for slot [1].
   */
  function pushYearEndSelects(expensesSlot: any[], mileageSlot: any[] = []) {
    h.selectQueue.push([PAID_INVOICE]); // [0] invoices — no date filter
    h.selectQueue.push(expensesSlot);   // [1] expenses
    h.selectQueue.push(mileageSlot);    // [2] mileageLogs
    h.selectQueue.push([]);             // [3] otherIncomeRows
    h.selectQueue.push([]);             // [4] assets
    h.selectQueue.push([]);             // [5] taxPayments
    h.selectQueue.push([]);             // [6] subs
    h.selectQueue.push([SETTINGS_ROW]); // [7] settings
    h.selectQueue.push([]);             // [8] busUseRows (assetBusinessUse)
    h.selectQueue.push([]);             // [9] fixedAllocSubPayments
    h.selectQueue.push([]);             // [10] ownerContribRows
    h.selectQueue.push([]);             // [11] waterfallPaidInvs
  }

  it("mileage-category expense is absent from summary.totalExpenses", async () => {
    pushYearEndSelects([MILEAGE_EXPENSE, REGULAR_EXP]);

    const res = await request(app).get(`/reports/year-end?year=${YEAR}`);
    expect(res.status).toBe(200);

    // totalExpenses = $100 (Supplies only); regression would produce $300
    expect(res.body.summary.totalExpenses).toBeCloseTo(100, 10);
    expect(res.body.totalExpenses).toBeCloseTo(100, 10);
  });

  it("mileage-category expense does not reduce netProfit on the Schedule C", async () => {
    pushYearEndSelects([MILEAGE_EXPENSE, REGULAR_EXP]);

    const res = await request(app).get(`/reports/year-end?year=${YEAR}`);
    expect(res.status).toBe(200);

    // netProfit = $1 000 revenue − $100 business expenses = $900
    // A regression would produce $700 (mileage expense wrongly included)
    expect(res.body.summary.netProfit).toBeCloseTo(900, 10);
  });

  it("mileage-only expenses: totalExpenses is zero on Schedule C", async () => {
    pushYearEndSelects([MILEAGE_EXPENSE]);

    const res = await request(app).get(`/reports/year-end?year=${YEAR}`);
    expect(res.status).toBe(200);

    expect(res.body.summary.totalExpenses).toBeCloseTo(0, 10);
    expect(res.body.totalExpenses).toBeCloseTo(0, 10);
    // netProfit = $1 000 revenue − $0 deductible expenses = $1 000
    expect(res.body.summary.netProfit).toBeCloseTo(1000, 10);
  });

  it("summary and mileage expose separate IRS rate periods for split-year trips", async () => {
    pushYearEndSelects([], [H1_LOG, H2_LOG]);

    const res = await request(app).get(`/reports/year-end?year=${YEAR}`);
    expect(res.status).toBe(200);

    expect(res.body.summary.mileageRate).toBeNull();
    expect(res.body.mileage.mileageRate).toBeNull();
    const expectedRatePeriods = [
      { effectiveDate: "2026-01-01", periodStart: "2026-01-01", periodEnd: "2026-06-30", rate: 0.725, miles: 100, deduction: 72.5 },
      { effectiveDate: "2026-07-01", periodStart: "2026-07-01", periodEnd: "2026-12-31", rate: 0.76, miles: 100, deduction: 76 },
    ];
    expect(res.body.summary.ratePeriods).toEqual(expectedRatePeriods);
    expect(res.body.mileage.ratePeriods).toEqual(expectedRatePeriods);
    expect(res.body.summary.mileageDeduction).toBeCloseTo(148.5, 5);
  });
});
