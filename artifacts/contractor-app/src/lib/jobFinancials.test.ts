import { describe, expect, it } from "vitest";
import {
  calculateJobFinancialWaterfall,
  calculateOwnerReimbursement,
  formatJobFinancialAmount,
  jobFinancialSummaryDetail,
} from "./jobFinancials";

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
    expect(result.toSplit).toBeCloseTo(1355.60, 2);
    expect(result.ownerTakeHome).toBeCloseTo(508.35, 2);
  });

  it("warns only when team allocations exceed the available split", () => {
    expect(calculateJobFinancialWaterfall({ ...base, allocationPcts: [100] }).allocationWarning).toBe(false);
    expect(calculateJobFinancialWaterfall({ ...base, allocationPcts: [60, 41] }).allocationWarning).toBe(true);
  });

  it("deducts mileage reimbursement with every other displayed job cost", () => {
    const withMileage = calculateJobFinancialWaterfall({ ...base, allocationPcts: [50] });
    const withoutMileage = calculateJobFinancialWaterfall({
      ...base,
      jobExpenses: base.jobExpenses - base.mileageReimbursementCost,
      mileageReimbursementCost: 0,
      allocationPcts: [50],
    });

    expect(withMileage.toSplit).toBeCloseTo(1355.60, 2);
    expect(withoutMileage.toSplit).toBeCloseTo(1545.22, 2);
  });

  it("uses job income after all costs as the split-income base", () => {
    const result = calculateJobFinancialWaterfall({ ...base, allocationPcts: [50] });

    expect(result.jobIncome).toBeCloseTo(3876.49, 2);
    expect(result.splitIncome).toBeCloseTo(3876.49, 2);
    expect(result.toSplit).toBeCloseTo(1355.60, 2);
  });

  it("uses the same pool when the close-job path includes team allocations", () => {
    const panel = calculateJobFinancialWaterfall({ ...base, allocationPcts: [50], hourlyFixedCost: base.subLaborCost });
    const closeJob = calculateJobFinancialWaterfall({ ...base, allocationPcts: [50], hourlyFixedCost: base.subLaborCost });

    expect(closeJob.toSplit).toBeCloseTo(panel.toSplit, 2);
    expect(closeJob.toSplit * 0.5).toBeCloseTo(677.80, 2);
  });

  it("uses the agreed hourly payout when the worker has an amount override", () => {
    const result = calculateJobFinancialWaterfall({
      ...base,
      subLaborCost: 800,
      hourlyFixedCost: 800,
      allocationPcts: [20],
    });

    expect(result.hourlyWorkers).toBe(800);
    expect(result.toSplit).toBeCloseTo(2882.67, 2);
  });

  it("calculates the configured growth reserve after all job costs", () => {
    const result = calculateJobFinancialWaterfall({
      ...base,
      growthReservePct: 15,
      allocationPcts: [],
    });

    expect(result.growthReserve).toBeCloseTo(581.47, 2);
  });

  it("matches the Grubb waterfall shown in Job Financials", () => {
    const result = calculateJobFinancialWaterfall({
      revenue: 3876.76,
      jobExpenses: 177.80,
      mileageReimbursementCost: 177.80,
      subLaborCost: 800,
      allocationPcts: [50],
      growthReservePct: 5,
      ownerSplitPct: 50,
      taxReservePct: 25,
    });

    expect(result.jobIncome).toBeCloseTo(3698.96, 2);
    expect(result.growthReserve).toBeCloseTo(184.95, 2);
    expect(result.toSplit).toBeCloseTo(2714.01, 2);
    expect(result.subShare).toBeCloseTo(1357.01, 2);
    expect(result.ownerShare).toBeCloseTo(1357.01, 2);
    expect(result.taxReserve).toBeCloseTo(339.25, 2);
    expect(result.ownerTakeHome).toBeCloseTo(1017.75, 2);
  });
});

describe("calculateOwnerReimbursement", () => {
  it("returns the automatic fuel estimate after the taxed take-home", () => {
    const result = calculateOwnerReimbursement({
      ownerTakeHome: 1017.75,
      includeMileageInJobCosts: true,
      mileageReimbursementApplied: true,
      savedReimbursement: null,
      estimatedFuelCost: 177.80,
    });

    expect(result.amount).toBeCloseTo(177.80, 2);
    expect(result.outstanding).toBeCloseTo(177.80, 2);
    expect(result.totalOwnerSettlement).toBeCloseTo(1195.55, 2);
    expect(result.isAutomatic).toBe(true);
  });

  it("prefers a saved owner reimbursement over the estimate", () => {
    const result = calculateOwnerReimbursement({
      ownerTakeHome: 1017.75,
      includeMileageInJobCosts: true,
      savedReimbursement: {
        amount: 200,
        recipientType: "owner",
        status: "owed",
      },
      estimatedFuelCost: 177.80,
    });

    expect(result.amount).toBe(200);
    expect(result.totalOwnerSettlement).toBeCloseTo(1217.75, 2);
    expect(result.isAutomatic).toBe(false);
  });

  it("does not reimburse a disabled, replaced, or non-owner amount", () => {
    expect(calculateOwnerReimbursement({
      ownerTakeHome: 1000,
      includeMileageInJobCosts: false,
      estimatedFuelCost: 177.80,
    }).amount).toBe(0);
    expect(calculateOwnerReimbursement({
      ownerTakeHome: 1000,
      includeMileageInJobCosts: true,
      mileageReimbursementApplied: false,
      estimatedFuelCost: 177.80,
    }).amount).toBe(0);
    expect(calculateOwnerReimbursement({
      ownerTakeHome: 1000,
      includeMileageInJobCosts: true,
      savedReimbursement: {
        amount: 177.80,
        recipientType: "subcontractor",
        status: "owed",
      },
      estimatedFuelCost: 177.80,
    }).amount).toBe(0);
  });
});

describe("formatJobFinancialAmount", () => {
  const formatter = (amount: number) => `$${amount.toFixed(2)}`;

  it("renders unavailable balances as unavailable instead of zero", () => {
    expect(formatJobFinancialAmount(null, formatter)).toBe("Unavailable");
    expect(formatJobFinancialAmount(undefined, formatter)).toBe("Unavailable");
  });

  it("uses only the server-provided unavailable reason in payment summaries", () => {
    expect(jobFinancialSummaryDetail(null, "Profit pool is unavailable.", "owed"))
      .toBe("Profit pool is unavailable.");
    expect(jobFinancialSummaryDetail(null, null, "owed")).toBeNull();
    expect(jobFinancialSummaryDetail(0, null, "owed")).toBe("owed");
  });

  it("continues to render a known zero as zero", () => {
    expect(formatJobFinancialAmount(0, formatter)).toBe("$0.00");
  });
});