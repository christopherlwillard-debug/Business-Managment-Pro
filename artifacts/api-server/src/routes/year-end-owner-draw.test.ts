// Year-end / Schedule C — owner-draw exclusion regression tests
//
// Guards that all three owner-pay category names (Owner Draw, Owner Compensation,
// Owner Withdrawal) are absent from the Schedule C deductible expense total and
// the net profit calculation on GET /reports/year-end.
//
// A silent regression here would cause an incorrect Schedule C filing.
//
// Queue order for GET /year-end (no blFilter, no subs, no assets):
//
//   Promise.all([invoices, expenses, mileageLogs, otherIncomeRows,
//                assets, taxPayments, subs, settings, busUseRows,
//                fixedAllocSubPayments])
//   [0]  invoices             (paid, leftJoin clients)
//   [1]  expenses             (date-bounded)
//   [2]  mileageLogs          (date-bounded, business classification)
//   [3]  otherIncomeRows      (date-bounded)
//   [4]  assets
//   [5]  taxPayments          (year-bounded)
//   [6]  subs                 (empty → computeYtd never called)
//   [7]  settings
//   [8]  busUseRows           (assetBusinessUse)
//   [9]  fixedAllocSubPayments (innerJoin job_subcontractors)

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

// Paid invoice — $1 000 revenue (issue date = payment date, no Stripe/Square timestamps)
const PAID_INVOICE = {
  id: 1,
  invoiceNumber: "INV-001",
  status: "paid",
  issueDate: `${YEAR}-06-01`,
  total: "1000.00",
  subtotal: "1000.00",
  clientName: "Test Client",
  city: "Other City",
  state: "KY",
  stripePaidAt: null,
  squarePaidAt: null,
};

const SETTINGS_ROW = {
  companyName: "Test LLC",
  mileageRate: "0.67",
  thresholdAmount1099: "600",
  operatingReserveMode: "0",
  operatingReserveCustom: null,
};

// Ordinary deductible expense — must always count toward Schedule C totals
const REGULAR_EXP = {
  id: 10,
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

/**
 * Push the 10 select slots consumed by GET /year-end (no blFilter).
 * Pass the expenses array you want the route to see in slot [1].
 */
function pushYearEndSelects(expensesSlot: any[]): void {
  h.selectQueue.push([PAID_INVOICE]); // [0] invoices (paid only)
  h.selectQueue.push(expensesSlot);   // [1] expenses
  h.selectQueue.push([]);             // [2] mileageLogs
  h.selectQueue.push([]);             // [3] otherIncomeRows
  h.selectQueue.push([]);             // [4] assets
  h.selectQueue.push([]);             // [5] taxPayments
  h.selectQueue.push([]);             // [6] subs (empty → no computeYtd calls)
  h.selectQueue.push([SETTINGS_ROW]); // [7] settings
  h.selectQueue.push([]);             // [8] busUseRows (assetBusinessUse)
  h.selectQueue.push([]);             // [9] fixedAllocSubPayments
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Year-end / Schedule C — owner-draw exclusion from deductible expenses and net profit", () => {

  // ── 1. "Owner Draw" category ──────────────────────────────────────────────

  it("'Owner Draw' is excluded from summary.totalExpenses and summary.netProfit", async () => {
    const OWNER_DRAW = {
      id: 20, date: `${YEAR}-06-15`, amount: "500.00", category: "Owner Draw",
      businessLine: null, jobId: null, excludeFromNetProfit: false,
      description: "Owner draw", vendor: null, notes: null,
    };
    pushYearEndSelects([OWNER_DRAW, REGULAR_EXP]);

    const res = await request(app).get(`/reports/year-end?year=${YEAR}`);
    expect(res.status).toBe(200);

    // totalExpenses = $100 (Supplies only) — a regression would produce $600
    expect(res.body.summary.totalExpenses).toBeCloseTo(100, 10);
    expect(res.body.totalExpenses).toBeCloseTo(100, 10);

    // netProfit = $1 000 revenue − $100 expenses = $900
    // A regression (draw included) would produce $400
    expect(res.body.summary.netProfit).toBeCloseTo(900, 10);
  });

  // ── 2. "Owner Compensation" category ─────────────────────────────────────

  it("'Owner Compensation' is excluded from summary.totalExpenses and summary.netProfit", async () => {
    const OWNER_COMP = {
      id: 21, date: `${YEAR}-06-15`, amount: "400.00", category: "Owner Compensation",
      businessLine: null, jobId: null, excludeFromNetProfit: false,
      description: "Compensation", vendor: null, notes: null,
    };
    pushYearEndSelects([OWNER_COMP, REGULAR_EXP]);

    const res = await request(app).get(`/reports/year-end?year=${YEAR}`);
    expect(res.status).toBe(200);

    expect(res.body.summary.totalExpenses).toBeCloseTo(100, 10);
    expect(res.body.totalExpenses).toBeCloseTo(100, 10);
    expect(res.body.summary.netProfit).toBeCloseTo(900, 10);
  });

  // ── 3. "Owner Withdrawal" category ───────────────────────────────────────

  it("'Owner Withdrawal' is excluded from summary.totalExpenses and summary.netProfit", async () => {
    const OWNER_WITHDRAWAL = {
      id: 22, date: `${YEAR}-06-15`, amount: "300.00", category: "Owner Withdrawal",
      businessLine: null, jobId: null, excludeFromNetProfit: false,
      description: "Withdrawal", vendor: null, notes: null,
    };
    pushYearEndSelects([OWNER_WITHDRAWAL, REGULAR_EXP]);

    const res = await request(app).get(`/reports/year-end?year=${YEAR}`);
    expect(res.status).toBe(200);

    expect(res.body.summary.totalExpenses).toBeCloseTo(100, 10);
    expect(res.body.totalExpenses).toBeCloseTo(100, 10);
    expect(res.body.summary.netProfit).toBeCloseTo(900, 10);
  });

  // ── 4. All three names absent from expensesBySchedC ───────────────────────

  it("all three owner-pay categories are absent from expensesBySchedC", async () => {
    const draws = [
      { id: 20, date: `${YEAR}-06-15`, amount: "500.00", category: "Owner Draw",
        businessLine: null, jobId: null, excludeFromNetProfit: false,
        description: "Draw", vendor: null, notes: null },
      { id: 21, date: `${YEAR}-06-16`, amount: "400.00", category: "Owner Compensation",
        businessLine: null, jobId: null, excludeFromNetProfit: false,
        description: "Comp", vendor: null, notes: null },
      { id: 22, date: `${YEAR}-06-17`, amount: "300.00", category: "Owner Withdrawal",
        businessLine: null, jobId: null, excludeFromNetProfit: false,
        description: "Withdrawal", vendor: null, notes: null },
    ];
    pushYearEndSelects([...draws, REGULAR_EXP]);

    const res = await request(app).get(`/reports/year-end?year=${YEAR}`);
    expect(res.status).toBe(200);

    const schedC: { schedCLine: string; amount: number; items: { description: string }[] }[] = res.body.expensesBySchedC;

    // No Schedule C line name should reference any owner-pay label
    for (const cat of schedC) {
      expect(cat.schedCLine.toLowerCase()).not.toMatch(/owner/);
    }

    // No individual line-item description should be an owner-pay description
    const OWNER_PAY_DESCRIPTIONS = ["Owner draw", "Comp", "Withdrawal"];
    for (const cat of schedC) {
      for (const item of cat.items) {
        expect(OWNER_PAY_DESCRIPTIONS).not.toContain(item.description);
      }
    }

    // The regular expense must still be present across the Schedule C lines.
    // "Supplies" category has no exact key in SCHED_C_MAP so it falls through
    // to the default "Line 27a – Other" bucket.
    const otherCat = schedC.find(c => c.schedCLine === "Line 27a – Other");
    expect(otherCat).toBeDefined();
    expect(otherCat!.amount).toBeCloseTo(100, 10);

    // Totals still exclude the $1 200 in draws
    expect(res.body.summary.totalExpenses).toBeCloseTo(100, 10);
    expect(res.body.summary.netProfit).toBeCloseTo(900, 10);
  });

  // ── 5. Regular expenses are not over-excluded ─────────────────────────────

  it("regular expenses still count when no owner draws are present", async () => {
    pushYearEndSelects([REGULAR_EXP]);

    const res = await request(app).get(`/reports/year-end?year=${YEAR}`);
    expect(res.status).toBe(200);

    expect(res.body.summary.totalExpenses).toBeCloseTo(100, 10);
    expect(res.body.totalExpenses).toBeCloseTo(100, 10);
    // netProfit = $1 000 − $100 = $900
    expect(res.body.summary.netProfit).toBeCloseTo(900, 10);
  });

  // ── 6. Tax estimates use owner-draw-excluded net profit ───────────────────
  //
  // Correct:  netProfit = $900  → SE tax ≈ 900 × 0.9235 × 0.153 ≈ $127.07
  // Regressed: netProfit = $400  → SE tax ≈ 400 × 0.9235 × 0.153 ≈ $56.48
  // We verify the reported figure exceeds what a $400 base would produce,
  // keeping the assertion independent of the progressive-bracket formula.

  it("selfEmploymentTax in taxEstimates is based on owner-draw-excluded net profit", async () => {
    const OWNER_DRAW = {
      id: 20, date: `${YEAR}-06-15`, amount: "500.00", category: "Owner Draw",
      businessLine: null, jobId: null, excludeFromNetProfit: false,
      description: "Draw", vendor: null, notes: null,
    };
    pushYearEndSelects([OWNER_DRAW, REGULAR_EXP]);

    const res = await request(app).get(`/reports/year-end?year=${YEAR}`);
    expect(res.status).toBe(200);

    // SE tax floor derived from the wrong (regressed) net profit of $400
    const seTaxIfDrawIncluded = 400 * 0.9235 * 0.153;
    const { selfEmploymentTax } = res.body.taxEstimates as { selfEmploymentTax: number };

    // The reported SE tax must exceed what the regressed $400 base produces.
    // If the draw slips in, selfEmploymentTax would equal seTaxIfDrawIncluded (≈ $56.48)
    // rather than the correct value (≈ $127.07 for the $900 base).
    expect(selfEmploymentTax).toBeGreaterThan(seTaxIfDrawIncluded);
  });
});
