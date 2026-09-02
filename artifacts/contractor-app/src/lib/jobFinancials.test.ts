import { describe, expect, it } from "vitest";
import { calculateJobFinancialWaterfall, formatJobFinancialAmount } from "./jobFinancials";

describe("calculateJobFinancialWaterfall", () => {
  const base = {
    revenue: 5000.30,
    jobExpenses: 1123.81,
    mileageReimbursementCost: 199.60,
    subLaborCost: 2327.07,
    growthReservePct: 5,
    ownerSplitPct: 50,
    taxReservePct: 25,
  };

  it("balances a 50% team allocation with the automatic 50% owner share", () => {
    const result = calculateJobFinancialWaterfall({ ...base, allocationPcts: [50] });

    expect(result.allocationWarning).toBe(false);
    expect(result.totalAllocPct).toBe(50);
    expect(result.ownerPct).toBe(50);
    expect(result.toSplit).toBeCloseTo(1545.22, 2);
    expect(result.ownerTakeHome).toBeCloseTo(579.46, 2);
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

    expect(withMileage.toSplit).toBeCloseTo(1545.22, 2);
    expect(withoutMileage.toSplit).toBeCloseTo(withMileage.toSplit, 2);
  });

  it("reports job income after all costs while keeping reimbursement outside the split pool", () => {
    const result = calculateJobFinancialWaterfall({ ...base, allocationPcts: [50] });

    expect(result.jobIncome).toBeCloseTo(3876.49, 2);
    expect(result.splitIncome).toBeCloseTo(4076.09, 2);
    expect(result.toSplit).toBeCloseTo(1545.22, 2);
  });

  it("uses the same pool when the close-job path includes team allocations", () => {
    const panel = calculateJobFinancialWaterfall({ ...base, allocationPcts: [50], hourlyFixedCost: base.subLaborCost });
    const closeJob = calculateJobFinancialWaterfall({ ...base, allocationPcts: [50], hourlyFixedCost: base.subLaborCost });

    expect(closeJob.toSplit).toBeCloseTo(panel.toSplit, 2);
    expect(closeJob.toSplit * 0.5).toBeCloseTo(772.61, 2);
  });

  it("uses the agreed hourly payout when the worker has an amount override", () => {
    const result = calculateJobFinancialWaterfall({
      ...base,
      subLaborCost: 800,
      hourlyFixedCost: 800,
      allocationPcts: [20],
    });

    expect(result.hourlyWorkers).toBe(800);
    expect(result.toSplit).toBeCloseTo(3072.29, 2);
  });

  it("calculates the configured growth reserve from gross revenue", () => {
    const result = calculateJobFinancialWaterfall({
      ...base,
      growthReservePct: 15,
      allocationPcts: [],
    });

    expect(result.growthReserve).toBeCloseTo(611.41, 2);
  });
});

describe("formatJobFinancialAmount", () => {
  const formatter = (amount: number) => `$${amount.toFixed(2)}`;

  it("renders unavailable balances as unavailable instead of zero", () => {
    expect(formatJobFinancialAmount(null, formatter)).toBe("Unavailable");
    expect(formatJobFinancialAmount(undefined, formatter)).toBe("Unavailable");
  });

  it("continues to render a known zero as zero", () => {
    expect(formatJobFinancialAmount(0, formatter)).toBe("$0.00");
  });
});