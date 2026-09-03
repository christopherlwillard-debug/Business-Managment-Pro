import { describe, expect, it } from "vitest";
import { resolveJobFuelReconciliation } from "./job-fuel-reconciliation.js";

describe("resolveJobFuelReconciliation", () => {
  it("identifies the screenshot case as a reimbursement/estimate mismatch", () => {
    expect(resolveJobFuelReconciliation({
      includeMileageInJobCosts: true,
      hasActualFuelExpense: false,
      reimbursementAmount: 177.8,
      estimatedFuelCost: 35.56,
    })).toBe("reimbursement_differs_from_estimate");
  });

  it("recognizes a reimbursement that matches the current route estimate", () => {
    expect(resolveJobFuelReconciliation({
      includeMileageInJobCosts: true,
      hasActualFuelExpense: false,
      reimbursementAmount: 177.8,
      estimatedFuelCost: 177.8,
    })).toBe("reimbursement_matches_estimate");
  });

  it.each([
    ["estimate_only", { reimbursementAmount: null, estimatedFuelCost: 35.56 }],
    ["reimbursement_without_estimate", { reimbursementAmount: 177.8, estimatedFuelCost: null }],
    ["actual_fuel_expense", { hasActualFuelExpense: true, reimbursementAmount: null, estimatedFuelCost: 35.56 }],
    ["actual_fuel_expense_replaces_reimbursement", { hasActualFuelExpense: true, reimbursementAmount: 177.8, estimatedFuelCost: 35.56 }],
    ["excluded_from_job_costs", { includeMileageInJobCosts: false, reimbursementAmount: 177.8, estimatedFuelCost: 35.56 }],
    ["estimate_unavailable", { reimbursementAmount: null, estimatedFuelCost: null }],
  ] as const)("returns %s for the corresponding source state", (expected, overrides) => {
    expect(resolveJobFuelReconciliation({
      includeMileageInJobCosts: true,
      hasActualFuelExpense: false,
      ...overrides,
    })).toBe(expected);
  });
});