import { describe, expect, it } from "vitest";
import { calculateAllocationSplitPool, computeSubOwed } from "./allocation";

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

describe("calculateAllocationSplitPool", () => {
  it("includes job-only allocations in the same expense base as Job Financials", () => {
    const result = calculateAllocationSplitPool({
      revenue: 5000.30,
      directExpenses: 101.21,
      allocatedExpenses: 23,
      subLaborCost: 800,
      growthReservePct: 5,
    });

    expect(result.expenses).toBeCloseTo(124.21, 2);
    expect(result.splitPool).toBeCloseTo(3832.29, 2);
    expect(computeSubOwed({
      compensationType: "allocation",
      amountOwed: null,
      fixedAmount: null,
      allocationPct: "50",
    }, result.splitPool)).toBeCloseTo(1916.14, 2);
  });

  it("uses the displayed remaining amount as the split pool", () => {
    const result = calculateAllocationSplitPool({
      revenue: 3876.76,
      directExpenses: 177.80,
      allocatedExpenses: 0,
      subLaborCost: 800,
      growthReservePct: 5,
    });

    expect(result.expenses).toBeCloseTo(177.80, 2);
    expect(result.growthReserve).toBeCloseTo(184.95, 2);
    expect(result.splitPool).toBeCloseTo(2714.01, 2);
    expect(computeSubOwed({
      compensationType: "allocation",
      amountOwed: null,
      fixedAmount: null,
      allocationPct: "50",
    }, result.splitPool)).toBeCloseTo(1357.01, 2);
  });
});