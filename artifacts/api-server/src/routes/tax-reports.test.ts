// Unit tests for Schedule C Line 24b meal deduction logic.
//
// Pins the rule from IRC §274(n): business meals are 50% deductible.
// When deductible_amount is explicitly stored in the expenses table
// (e.g. set by trip-receipt logic), that stored value MUST be used as-is.
// When deductible_amount is NULL, the fallback is amount * 0.5.
//
// This prevents double-applying the 50% multiplier (which would
// understate deductions) and honours any explicit override.
import { describe, it, expect } from "vitest";
import { scheduleCExpenseIsIncluded, scheduleCMealsTaxAmount } from "./tax-reports.js";

describe("scheduleCExpenseIsIncluded — hourly wage advances", () => {
  it("counts hourly accrual expenses once and excludes a settled advance", () => {
    const expenses = [
      { id: 1, category: "Subcontractor", amount: "800.00", isWageAdvance: false },
      { id: 2, category: "Subcontractor", amount: "120.00", isWageAdvance: false },
      { id: 3, category: "Subcontractor", amount: "160.00", isWageAdvance: true },
    ];

    const contractLabor = expenses
      .filter(scheduleCExpenseIsIncluded)
      .reduce((total, expense) => total + Number(expense.amount), 0);

    expect(contractLabor).toBe(920);
    expect(contractLabor).not.toBe(1080);
  });

  it("keeps ordinary and legacy-unflagged expenses included", () => {
    expect(scheduleCExpenseIsIncluded({ category: "Supplies", isWageAdvance: false })).toBe(true);
    expect(scheduleCExpenseIsIncluded({ category: "Subcontractor", isWageAdvance: null })).toBe(true);
    expect(scheduleCExpenseIsIncluded({ category: "Subcontractor" })).toBe(true);
  });

  it("does not change the preserved source-history treatment for mileage filtering", () => {
    expect(scheduleCExpenseIsIncluded({ category: "mileage", isWageAdvance: false })).toBe(false);
    expect(scheduleCExpenseIsIncluded({ category: "Subcontractor", isWageAdvance: true })).toBe(false);
  });
});

describe("scheduleCMealsTaxAmount — Line 24b IRS 50% rule", () => {
  // ── Core acceptance criterion ──────────────────────────────────────────────
  it("returns $50 for a $100 meal with no stored deductibleAmount (50% fallback)", () => {
    expect(scheduleCMealsTaxAmount("mealsDeductible", 100, null)).toBe(50);
  });

  it("returns $50 for a $100 meal whose stored deductibleAmount is already $50", () => {
    expect(scheduleCMealsTaxAmount("mealsDeductible", 100, 50)).toBe(50);
  });

  // ── Stored value is the source of truth ───────────────────────────────────
  it("uses stored deductibleAmount ($30) even when 50% of rawAmount would give $50", () => {
    // e.g. a partially non-deductible meal or IRS per-diem cap applied
    expect(scheduleCMealsTaxAmount("mealsDeductible", 100, 30)).toBe(30);
  });

  it("uses stored deductibleAmount ($80) when it exceeds 50% of rawAmount", () => {
    // e.g. a manually overridden deductible portion
    expect(scheduleCMealsTaxAmount("mealsDeductible", 100, 80)).toBe(80);
  });

  it("handles deductibleAmount of 0 (fully non-deductible meal)", () => {
    expect(scheduleCMealsTaxAmount("mealsDeductible", 100, 0)).toBe(0);
  });

  // ── Non-meal categories are unaffected ────────────────────────────────────
  it("returns raw amount unchanged for non-meal categories (materials)", () => {
    expect(scheduleCMealsTaxAmount("cogs", 500, null)).toBe(500);
  });

  it("returns raw amount for travelLodging even if deductibleSum is present", () => {
    // deductibleSum is only relevant for meals; other categories use raw amount
    expect(scheduleCMealsTaxAmount("travelLodging", 300, 150)).toBe(300);
  });

  it("returns raw amount for 'other' category expenses", () => {
    expect(scheduleCMealsTaxAmount("other", 200, null)).toBe(200);
  });

  // ── Edge cases ────────────────────────────────────────────────────────────
  it("handles $0 meal correctly (no deductible)", () => {
    expect(scheduleCMealsTaxAmount("mealsDeductible", 0, null)).toBe(0);
  });

  it("handles fractional cents correctly (rounds naturally via JS float)", () => {
    // $15 meal * 50% = $7.50
    expect(scheduleCMealsTaxAmount("mealsDeductible", 15, null)).toBe(7.5);
  });
});
