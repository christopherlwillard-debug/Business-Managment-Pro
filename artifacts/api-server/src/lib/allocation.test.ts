import { describe, expect, it } from "vitest";
import {
  calculateAllocationSplitPool,
  computeSubOwed,
  resolveSplitPoolLaborCost,
} from "./allocation";

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
  it("deducts agreed fixed worker pay before calculating 50% shares", () => {
    const laborCost = resolveSplitPoolLaborCost({
      hourlyAssignmentCost: 0,
      fixedAssignmentCost: 800,
      fixedPaymentFallbackCost: 0,
      legacyFlatSubCost: 0,
      accruedBonusCost: 0,
    });
    const result = calculateAllocationSplitPool({
      revenue: 2500,
      directExpenses: 0,
      allocatedExpenses: 0,
      subLaborCost: laborCost,
      growthReservePct: 5,
    });

    const jamesDue = computeSubOwed({
      compensationType: "allocation",
      amountOwed: null,
      fixedAmount: null,
      allocationPct: "50",
    }, result.splitPool);

    expect(result.growthReserve).toBeCloseTo(125, 2);
    expect(result.subLaborCost).toBeCloseTo(800, 2);
    expect(result.splitPool).toBeCloseTo(1575, 2);
    expect(jamesDue).toBeCloseTo(787.50, 2);
  });

  it("does not count a fixed obligation and its payment fallback twice", () => {
    expect(resolveSplitPoolLaborCost({
      hourlyAssignmentCost: 0,
      fixedAssignmentCost: 800,
      fixedPaymentFallbackCost: 800,
      legacyFlatSubCost: 0,
      accruedBonusCost: 0,
    })).toBe(800);
  });

  it("retains fixed payment and legacy fallbacks when no agreed assignment amount exists", () => {
    expect(resolveSplitPoolLaborCost({
      hourlyAssignmentCost: 0,
      fixedAssignmentCost: 0,
      fixedPaymentFallbackCost: 800,
      legacyFlatSubCost: 1200,
      accruedBonusCost: 0,
    })).toBe(800);
    expect(resolveSplitPoolLaborCost({
      hourlyAssignmentCost: 0,
      fixedAssignmentCost: 0,
      fixedPaymentFallbackCost: 0,
      legacyFlatSubCost: 1200,
      accruedBonusCost: 0,
    })).toBe(1200);
  });

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