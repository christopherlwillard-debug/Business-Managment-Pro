import { describe, expect, it } from "vitest";
import { sumIncludedJobCostDetails } from "./jobExpenseDisplay";

describe("sumIncludedJobCostDetails", () => {
  it("does not add a replaced estimate to the saved reimbursement", () => {
    expect(sumIncludedJobCostDetails([
      { amount: 177.8, informational: false },
      { amount: 35.56, informational: true, includedInJobCosts: false },
    ])).toBe(177.8);
  });

  it("keeps estimate-only fuel in the operational cost total", () => {
    expect(sumIncludedJobCostDetails([
      { amount: 35.56, informational: true, includedInJobCosts: true },
    ])).toBe(35.56);
  });

  it("ignores explicitly excluded and invalid detail values", () => {
    expect(sumIncludedJobCostDetails([
      { amount: "125.00" },
      { amount: "80.50", includedInJobCosts: false },
      { amount: "not-a-number" },
    ])).toBe(125);
  });
});