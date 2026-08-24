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
function pushYearEndSelects(expensesSlot: any[], fixedAllocSubPaymentsSlot: any[] = []): void {
  h.selectQueue.push([PAID_INVOICE]); // [0] invoices (paid only)
  h.selectQueue.push(expensesSlot);   // [1] expenses
  h.selectQueue.push([]);             // [2] mileageLogs
  h.selectQueue.push([]);             // [3] otherIncomeRows
  h.selectQueue.push([]);             // [4] assets
  h.selectQueue.push([]);             // [5] taxPayments
  h.selectQueue.push([]);             // [6] subs (empty → no computeYtd calls)
  h.selectQueue.push([SETTINGS_ROW]); // [7] settings
  h.selectQueue.push([]);             // [8] busUseRows (assetBusinessUse)
  h.selectQueue.push(fixedAllocSubPaymentsSlot); // [9] fixedAllocSubPayments
  h.selectQueue.push([]);             // [10] ownerContribRows
  h.selectQueue.push([]);             // [11] waterfallPaidInvs
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

  it("reconciles Schedule C detail with totalExpenses across hourly and fixed sub pay", async () => {
    const hourlyAutoExpense = {
      id: 30,
      date: `${YEAR}-06-20`,
      amount: "120.00",
      category: "Subcontractor",
      businessLine: null,
      jobId: 10,
      jobSubHoursId: 77,
      subcontractorId: 1,
      excludeFromNetProfit: false,
      description: "Hourly sub labor",
      vendor: "Hourly Sub",
      notes: null,
      isWageAdvance: false,
    };
    const fixedSubPayment = {
      id: 31,
      jobId: 11,
      amount: "300.00",
      paymentDate: `${YEAR}-06-21`,
      description: "Fixed sub final payment",
      subcontractorId: 2,
    };

    // Hourly labor enters through its jobSubHours-linked auto-expense. Fixed
    // labor enters through sub_payment_records and must be injected once.
    pushYearEndSelects([hourlyAutoExpense], [fixedSubPayment]);

    const res = await request(app).get(`/reports/year-end?year=${YEAR}`);
    expect(res.status).toBe(200);

    const contractLabor = (res.body.expensesBySchedC as {
      schedCLine: string;
      amount: number;
      count: number;
      items: { amount: number; description: string }[];
    }[]).find(c => c.schedCLine === "Line 11 – Contract Labor");
    expect(contractLabor).toBeDefined();
    expect(contractLabor!.amount).toBeCloseTo(420, 10);
    expect(contractLabor!.count).toBe(2);
    expect(contractLabor!.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ amount: 120, description: "Hourly sub labor" }),
      expect.objectContaining({ amount: 300, description: "Fixed sub final payment" }),
    ]));

    const detailTotal = (res.body.expensesBySchedC as { amount: number }[])
      .reduce((sum, category) => sum + category.amount, 0);
    expect(detailTotal).toBeCloseTo(res.body.totalExpenses, 10);
    expect(res.body.totalExpenses).toBeCloseTo(420, 10);
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

// ── Cross-year invoice gap regression tests ───────────────────────────────────
//
// Guards the fix for the December-issued / January-paid invoice gap on the
// year-end Schedule C report specifically.
//
// /year-end uses getEffectivePaymentYear (returns a number) rather than the
// string-comparison getEffectivePaymentDate used by /accounting. A regression
// in that helper could silently drop revenue from the Schedule C grossReceipts
// without the /accounting cross-year tests (in reserve-tax-parity.test.ts)
// catching it, because the two helpers are separate code paths.
//
// The invoices query on /year-end has NO date filter — all paid invoices are
// fetched, then JS filters by getEffectivePaymentYear(i) === year. The tests
// confirm that year attribution follows the electronic payment timestamp, not
// the issue date.
//
// Queue order for GET /year-end is identical to the owner-draw suite above:
//   [0] invoices — no date filter (JS payment-year gate in route)
//   [1] expenses  [2] mileageLogs  [3] otherIncomeRows  [4] assets
//   [5] taxPayments  [6] subs  [7] settings  [8] busUseRows
//   [9] fixedAllocSubPayments
//   (slots [1]–[9] are empty in all cross-year scenarios)

describe("Year-end / Schedule C — cross-year invoice revenue attribution", () => {

  const PREV_YEAR = YEAR - 1;

  // Invoice issued Dec 28 of the prior year, paid via Stripe on Jan 3 of YEAR.
  // This is the canonical cross-year scenario: issueDate ∈ PREV_YEAR,
  // payment received ∈ YEAR — cash-basis accounting requires it in YEAR.
  const CROSS_YEAR_INVOICE = {
    id: 99,
    invoiceNumber: "INV-CY01",
    status: "paid",
    issueDate: `${PREV_YEAR}-12-28`,
    total: "500.00",
    subtotal: "500.00",
    clientName: "Cross-Year Client",
    city: "Other City",
    state: "KY",
    // Date instance so getEffectivePaymentYear calls .getFullYear() correctly
    stripePaidAt: new Date(`${YEAR}-01-03T12:00:00.000Z`),
    squarePaidAt: null,
  };

  /** Push all 10 year-end select slots with a custom invoices array (slots [1]–[9] empty). */
  function pushYearEndWithInvoices(invoicesSlot: any[]): void {
    h.selectQueue.push(invoicesSlot); // [0] invoices — no date filter
    h.selectQueue.push([]);           // [1] expenses
    h.selectQueue.push([]);           // [2] mileageLogs
    h.selectQueue.push([]);           // [3] otherIncomeRows
    h.selectQueue.push([]);           // [4] assets
    h.selectQueue.push([]);           // [5] taxPayments
    h.selectQueue.push([]);           // [6] subs
    h.selectQueue.push([SETTINGS_ROW]); // [7] settings
    h.selectQueue.push([]);           // [8] busUseRows
    h.selectQueue.push([]);           // [9] fixedAllocSubPayments
    h.selectQueue.push([]);           // [10] ownerContribRows
    h.selectQueue.push([]);           // [11] waterfallPaidInvs
  }

  it(`appears in summary.grossReceipts for ${YEAR} (payment year via stripePaidAt)`, async () => {
    // Unbounded invoice query returns the cross-year invoice.
    // getEffectivePaymentYear → stripePaidAt.getFullYear() → YEAR → included.
    pushYearEndWithInvoices([CROSS_YEAR_INVOICE]);

    const res = await request(app).get(`/reports/year-end?year=${YEAR}`);
    expect(res.status).toBe(200);

    // $500 invoice must land in the payment year's gross receipts
    expect(res.body.summary.grossReceipts).toBeCloseTo(500, 10);
    expect(res.body.summary.totalRevenue).toBeCloseTo(500, 10);
    // Net profit = $500 revenue − $0 expenses = $500
    expect(res.body.summary.netProfit).toBeCloseTo(500, 10);
  });

  it(`is absent from summary.grossReceipts for ${PREV_YEAR} (issue year — payment was next year)`, async () => {
    // Same unbounded query returns the invoice, but payment year is YEAR ≠ PREV_YEAR,
    // so getEffectivePaymentYear filters it out of the prior-year report.
    pushYearEndWithInvoices([CROSS_YEAR_INVOICE]);

    const res = await request(app).get(`/reports/year-end?year=${PREV_YEAR}`);
    expect(res.status).toBe(200);

    // Revenue must be zero — the invoice belongs to the next year
    expect(res.body.summary.grossReceipts).toBeCloseTo(0, 10);
    expect(res.body.summary.totalRevenue).toBeCloseTo(0, 10);
    // The invoice list must be empty for the issue year
    expect((res.body.invoices as any[]).length).toBe(0);
  });

  it(`res.body.invoices for ${YEAR} lists the invoice with paymentDate from stripePaidAt`, async () => {
    pushYearEndWithInvoices([CROSS_YEAR_INVOICE]);

    const res = await request(app).get(`/reports/year-end?year=${YEAR}`);
    expect(res.status).toBe(200);

    const inv = (res.body.invoices as any[]).find((i: any) => i.invoiceNumber === "INV-CY01");
    expect(inv).toBeDefined();
    // paymentDate must be the Stripe timestamp date, not the December issueDate
    expect(inv!.paymentDate).toBe(`${YEAR}-01-03`);
    expect(inv!.total).toBeCloseTo(500, 10);
  });

  it("squarePaidAt is also honoured — invoice appears in its squarePaidAt year, not issueDate year", async () => {
    const SQUARE_CROSS_YEAR = {
      ...CROSS_YEAR_INVOICE,
      id: 100,
      invoiceNumber: "INV-CY02",
      // No Stripe payment; Square payment in January of YEAR
      stripePaidAt: null,
      squarePaidAt: new Date(`${YEAR}-01-15T10:00:00.000Z`),
    };

    // Must appear in YEAR (squarePaidAt year)
    pushYearEndWithInvoices([SQUARE_CROSS_YEAR]);
    const yearRes = await request(app).get(`/reports/year-end?year=${YEAR}`);
    expect(yearRes.status).toBe(200);
    expect(yearRes.body.summary.grossReceipts).toBeCloseTo(500, 10);

    // Must be absent from PREV_YEAR (issue year)
    pushYearEndWithInvoices([SQUARE_CROSS_YEAR]);
    const prevYearRes = await request(app).get(`/reports/year-end?year=${PREV_YEAR}`);
    expect(prevYearRes.status).toBe(200);
    expect(prevYearRes.body.summary.grossReceipts).toBeCloseTo(0, 10);
  });

  it("issueDate fallback: invoice without timestamps is attributed to its issueDate year", async () => {
    // An invoice with no Stripe/Square payment — issueDate is Dec of PREV_YEAR.
    // getEffectivePaymentYear falls back to parseInt(issueDate.slice(0,4)) = PREV_YEAR.
    // It must appear in PREV_YEAR (not YEAR) — this also guards the fallback branch.
    const MANUAL_INVOICE = {
      ...CROSS_YEAR_INVOICE,
      id: 101,
      invoiceNumber: "INV-CY03",
      stripePaidAt: null,
      squarePaidAt: null,
      // issueDate is `${PREV_YEAR}-12-28` (inherited) — determines attribution year
    };

    // Must appear in PREV_YEAR (issueDate year — no timestamp to override it)
    pushYearEndWithInvoices([MANUAL_INVOICE]);
    const prevRes = await request(app).get(`/reports/year-end?year=${PREV_YEAR}`);
    expect(prevRes.status).toBe(200);
    expect(prevRes.body.summary.grossReceipts).toBeCloseTo(500, 10);

    // Must be absent from YEAR
    pushYearEndWithInvoices([MANUAL_INVOICE]);
    const yearRes = await request(app).get(`/reports/year-end?year=${YEAR}`);
    expect(yearRes.status).toBe(200);
    expect(yearRes.body.summary.grossReceipts).toBeCloseTo(0, 10);
  });
});
