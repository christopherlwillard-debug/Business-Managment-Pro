import { describe, expect, it } from "vitest";
import { validateDivisionAllocationAmounts } from "./division-allocations";

describe("shared expense division allocations", () => {
  const divisions = new Set([2, 3]);

  it("normalizes dollar amounts and permits an unallocated remainder", () => {
    expect(validateDivisionAllocationAmounts(
      [{ businessId: 2, amount: "15.5" }],
      "100.00",
      divisions,
      true,
    )).toEqual([{ businessId: 2, amount: "15.50" }]);
  });

  it("rejects totals above the source expense", () => {
    expect(() => validateDivisionAllocationAmounts(
      [{ businessId: 2, amount: 80 }, { businessId: 3, amount: 20.01 }],
      100,
      divisions,
      true,
    )).toThrow("cannot exceed");
  });

  it("rejects duplicate or out-of-owner divisions", () => {
    expect(() => validateDivisionAllocationAmounts(
      [{ businessId: 2, amount: 1 }, { businessId: 2, amount: 2 }],
      100,
      divisions,
      true,
    )).toThrow("only be allocated once");
    expect(() => validateDivisionAllocationAmounts(
      [{ businessId: 4, amount: 1 }],
      100,
      divisions,
      true,
    )).toThrow("under the expense’s legal owner");
  });

  it("requires shared overhead and positive values", () => {
    expect(() => validateDivisionAllocationAmounts([{ businessId: 2, amount: 1 }], 100, divisions, false))
      .toThrow("Only shared overhead");
    expect(() => validateDivisionAllocationAmounts([{ businessId: 2, amount: 0 }], 100, divisions, true))
      .toThrow("greater than zero");
  });
});
