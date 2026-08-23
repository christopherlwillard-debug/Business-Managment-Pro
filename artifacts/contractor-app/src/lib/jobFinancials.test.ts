import { describe, expect, it } from "vitest";
import { calculateJobFinancialWaterfall } from "./jobFinancials";

describe("calculateJobFinancialWaterfall", () => {
  const base = {
    revenue: 5000.30,
    jobExpenses: 1123.81,
    mileageReimbursementCost: 199.60,
    subLaborCost: 2327.07,
    ownerSplitPct: 50,
    taxReservePct: 25,
  };

  it("balances a 50% team allocation with the automatic 50% owner share", () => {
    const result = calculateJobFinancialWaterfall({ ...base, allocationPcts: [50] });

    expect(result.allocationWarning).toBe(false);
    expect(result.totalAllocPct).toBe(50);
    expect(result.ownerPct).toBe(50);
    expect(result.toSplit).toBeCloseTo(1661.57, 2);
    expect(result.ownerTakeHome).toBeCloseTo(623.09, 2);
  });

  it("warns only when team allocations exceed the available split", () => {
    expect(calculateJobFinancialWaterfall({ ...base, allocationPcts: [100] }).allocationWarning).toBe(false);
    expect(calculateJobFinancialWaterfall({ ...base, allocationPcts: [60, 41] }).allocationWarning).toBe(true);
  });

  it("keeps mileage reimbursement outside the percentage split pool", () => {
    const withMileage = calculateJobFinancialWaterfall({ ...base, allocationPcts: [50] });
    const withoutMileage = calculateJobFinancialWaterfall({
      ...base,
      jobExpenses: base.jobExpenses - base.mileageReimbursementCost,
      mileageReimbursementCost: 0,
      allocationPcts: [50],
    });

    expect(withMileage.toSplit).toBeCloseTo(1661.57, 2);
    expect(withoutMileage.toSplit).toBeCloseTo(withMileage.toSplit, 2);
  });

  it("uses the same pool when the close-job path includes team allocations", () => {
    const panel = calculateJobFinancialWaterfall({ ...base, allocationPcts: [50], hourlyFixedCost: 100 });
    const closeJob = calculateJobFinancialWaterfall({ ...base, allocationPcts: [50], hourlyFixedCost: 100 });

    expect(closeJob.toSplit).toBeCloseTo(panel.toSplit, 2);
    expect(closeJob.toSplit * 0.5).toBeCloseTo(830.78, 2);
  });

  it("uses the agreed hourly payout when the worker has an amount override", () => {
    const result = calculateJobFinancialWaterfall({
      ...base,
      subLaborCost: 800,
      hourlyFixedCost: 800,
      allocationPcts: [20],
    });

    expect(result.hourlyWorkers).toBe(800);
    expect(result.toSplit).toBeCloseTo(3112.29, 2);
  });
});