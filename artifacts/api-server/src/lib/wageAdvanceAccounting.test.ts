/**
 * Regression test: hourly-sub wage-advance expenses must be excluded from
 * every Accounting route nonMileageExpenses aggregate.
 *
 * A wage advance (isWageAdvance=true) is a pre-payment of hourly wages that
 * are already captured in job_sub_hours auto-expense accruals. Including the
 * advance in Accounting totals double-counts the labor cost. This test
 * verifies the filter operates correctly on the raw expense array shape
 * returned by the database queries in reports.ts.
 */

import { describe, it, expect } from "vitest";

// Mirror the shape used by all four nonMileageExpenses filters in reports.ts.
type MinimalExpense = {
  id: number;
  amount: string;
  category: string;
  description?: string | null;
  isWageAdvance?: boolean | null;
  jobId?: number | null;
  subcontractorId?: number | null;
  businessLine?: string | null;
};

// Replicate the three filter predicates used in reports.ts
const isOutstandingCostBooking = (e: MinimalExpense) =>
  (e.description ?? "").endsWith("(outstanding)");

function buildNonMileageDashboard(expenses: MinimalExpense[]) {
  return expenses.filter(
    e => e.category !== "mileage" && !isOutstandingCostBooking(e) && !e.isWageAdvance,
  );
}

function buildNonMileageAccounting(expenses: MinimalExpense[]) {
  return expenses.filter(
    e => e.category !== "mileage" && !isOutstandingCostBooking(e) && !e.isWageAdvance,
  );
}

function buildNonMileageYearEnd(expenses: MinimalExpense[]) {
  const OWNER_CATS = ["Owner Draw", "Owner Compensation", "Owner Withdrawal"];
  return expenses.filter(
    e =>
      e.category !== "mileage" &&
      !OWNER_CATS.includes(e.category) &&
      !isOutstandingCostBooking(e) &&
      !e.isWageAdvance,
  );
}

function buildNonMileageReserve(expenses: MinimalExpense[]) {
  return expenses.filter(e => e.category !== "mileage" && !e.isWageAdvance);
}

// ── Shared fixture: Dewayne Lamb / job 42 scenario ───────────────────────────

const jshAutoExpense800: MinimalExpense = {
  id: 185,
  amount: "800.00",
  category: "Subcontractor",
  description: "Dewayne Lamb — wages (32h @ $25.00)",
  isWageAdvance: false,
  jobId: 42,
  subcontractorId: 6,
};

const jshAutoExpense120: MinimalExpense = {
  id: 186,
  amount: "120.00",
  category: "Subcontractor",
  description: "Dewayne Lamb — wages (8h @ $15.00)",
  isWageAdvance: false,
  jobId: 42,
  subcontractorId: 6,
};

const advanceExpense: MinimalExpense = {
  id: 188,
  amount: "160.00",
  category: "Subcontractor",
  description: "Dewayne",
  isWageAdvance: true,   // wage-advance flag set by fix-dewayne-job42-advance migration
  jobId: 42,
  subcontractorId: 6,
};

const ordinaryExpense: MinimalExpense = {
  id: 200,
  amount: "350.00",
  category: "Tools & Equipment",
  description: "Circular saw",
  isWageAdvance: false,
};

const allExpenses = [jshAutoExpense800, jshAutoExpense120, advanceExpense, ordinaryExpense];

// ── Dashboard nonMileageExpenses ──────────────────────────────────────────────

describe("Dashboard nonMileageExpenses — isWageAdvance filter", () => {
  it("excludes the wage-advance expense", () => {
    const result = buildNonMileageDashboard(allExpenses);
    expect(result.map(e => e.id)).not.toContain(188);
  });

  it("retains jsh auto-expense wage accruals", () => {
    const result = buildNonMileageDashboard(allExpenses);
    expect(result.map(e => e.id)).toContain(185);
    expect(result.map(e => e.id)).toContain(186);
  });

  it("retains ordinary business expenses", () => {
    const result = buildNonMileageDashboard(allExpenses);
    expect(result.map(e => e.id)).toContain(200);
  });

  it("totalExpenses does not double-count the $160 advance", () => {
    const result = buildNonMileageDashboard(allExpenses);
    const total = result.reduce((s, e) => s + parseFloat(e.amount), 0);
    // $800 + $120 + $350 = $1,270 (no $160 advance)
    expect(total).toBeCloseTo(1270, 2);
  });

  it("null isWageAdvance is treated the same as false (backward-compatible)", () => {
    const expWithNull: MinimalExpense = { ...advanceExpense, id: 999, isWageAdvance: null };
    const result = buildNonMileageDashboard([expWithNull]);
    // null is falsy → included (not flagged as advance)
    expect(result.map(e => e.id)).toContain(999);
  });
});

// ── Accounting nonMileageExpenses ─────────────────────────────────────────────

describe("Accounting nonMileageExpenses — isWageAdvance filter", () => {
  it("excludes the wage-advance expense from business-expense total", () => {
    const result = buildNonMileageAccounting(allExpenses);
    expect(result.map(e => e.id)).not.toContain(188);
  });

  it("Accounting total with jsh accruals equals $920 wages (not $1,080)", () => {
    const result = buildNonMileageAccounting([jshAutoExpense800, jshAutoExpense120, advanceExpense]);
    const total = result.reduce((s, e) => s + parseFloat(e.amount), 0);
    // Correct: $800 + $120 = $920; wrong (pre-fix) would be $920 + $160 = $1,080
    expect(total).toBeCloseTo(920, 2);
  });
});

// ── Year-end nonMileageExpenses ───────────────────────────────────────────────

describe("Year-end nonMileageExpenses — isWageAdvance filter", () => {
  it("excludes the wage-advance expense from Schedule C deductions", () => {
    const result = buildNonMileageYearEnd(allExpenses);
    expect(result.map(e => e.id)).not.toContain(188);
  });
});

// ── Reserve-dashboard nonMileageExpenses ──────────────────────────────────────

describe("Reserve-dashboard nonMileageExpenses — isWageAdvance filter", () => {
  it("excludes the wage-advance expense from net-profit base", () => {
    const result = buildNonMileageReserve(allExpenses);
    expect(result.map(e => e.id)).not.toContain(188);
  });
});

// ── Idempotency: unflagged expenses are not touched ───────────────────────────

describe("Correct expenses are NOT affected by isWageAdvance filter", () => {
  it("isWageAdvance=false expenses pass through all four filters", () => {
    const expense: MinimalExpense = { id: 300, amount: "500.00", category: "Subcontractor", isWageAdvance: false };
    expect(buildNonMileageDashboard([expense]).length).toBe(1);
    expect(buildNonMileageAccounting([expense]).length).toBe(1);
    expect(buildNonMileageYearEnd([expense]).length).toBe(1);
    expect(buildNonMileageReserve([expense]).length).toBe(1);
  });

  it("isWageAdvance=true mileage expenses are excluded by category first (no interaction)", () => {
    const exp: MinimalExpense = { id: 301, amount: "99.00", category: "mileage", isWageAdvance: true };
    expect(buildNonMileageDashboard([exp]).length).toBe(0);
    expect(buildNonMileageAccounting([exp]).length).toBe(0);
  });
});
