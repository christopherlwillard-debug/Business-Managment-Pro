import { describe, expect, it } from "vitest";
import { computeSubOwed } from "./allocation";

describe("computeSubOwed", () => {
  it("uses an agreed hourly amount instead of the raw hours calculation", () => {
    expect(computeSubOwed({
      compensationType: "hourly",
      amountOwed: "800",
      fixedAmount: null,
      allocationPct: null,
      computedOwed: "2327.07",
    }, 0)).toBe(800);
  });

  it("keeps allocation pay tied to the split pool", () => {
    expect(computeSubOwed({
      compensationType: "allocation",
      amountOwed: null,
      fixedAmount: null,
      allocationPct: "20",
    }, 3000)).toBe(600);
  });

  it("does not treat allocation pay as hourly labor", () => {
    const allocation = computeSubOwed({
      compensationType: "allocation",
      amountOwed: null,
      fixedAmount: null,
      allocationPct: "20",
    }, 3000);
    const hourly = computeSubOwed({
      compensationType: "hourly",
      amountOwed: "800",
      fixedAmount: null,
      allocationPct: null,
      computedOwed: "2327.07",
    }, 3000);

    expect(hourly).toBe(800);
    expect(allocation).toBe(600);
    expect(hourly).not.toBe(allocation);
  });
});