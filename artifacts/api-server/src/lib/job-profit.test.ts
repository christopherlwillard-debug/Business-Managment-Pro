import { describe, expect, it } from "vitest";
import {
  buildJobProfitResponse,
  buildJobProfitSummaryResponse,
  calculateJobProfit,
} from "./job-profit.js";

describe("calculateJobProfit", () => {
  it("keeps a job positive when its source records contain ordinary costs and hourly labor", () => {
    const result = calculateJobProfit({
      invoices: [{ total: "1406.27", status: "paid" }],
      expenses: [{ id: 1, amount: "387.57", category: "Tools/Equipment", countsTowardJobProfit: true }],
      hourlyLaborCost: 320,
    });

    expect(result.grossInvoiced).toBeCloseTo(1406.27);
    expect(result.includedCostTotal).toBeCloseTo(707.57);
    expect(result.netProfit).toBeCloseTo(698.70);
  });

  it("uses a paid hourly subcontractor fallback without changing raw job-hour totals", () => {
    const result = calculateJobProfit({
      invoices: [{ total: "1406.27", status: "paid" }],
      expenses: [{ id: 1, amount: "387.57", category: "Tools/Equipment", countsTowardJobProfit: true }],
      hourlySubcontractorPaymentFallbackCost: 320,
      totalSubHours: 0,
    });

    expect(result.subLaborCost).toBeCloseTo(320);
    expect(result.totalSubHours).toBe(0);
    expect(result.includedCostTotal).toBeCloseTo(707.57);
    expect(result.netProfit).toBeCloseTo(698.70);
  });

  it("does not treat owner withdrawals, audit rows, or payroll-linked rows as job costs", () => {
    const result = calculateJobProfit({
      invoices: [{ total: "1000.00", status: "paid" }],
      expenses: [
        { amount: "500.00", category: "Owner Compensation", countsTowardJobProfit: true },
        { amount: "250.00", category: "Travel", countsTowardJobProfit: false, tripId: 4 },
        { amount: "800.00", category: "Labor", subcontractorId: 7, countsTowardJobProfit: true },
        { amount: "100.00", category: "Materials", countsTowardJobProfit: true },
      ],
    });

    expect(result.jobExpenses).toBeCloseTo(100);
    expect(result.netProfit).toBeCloseTo(900);
    expect(result.profitBreakdown.excludedFromProfit.ownerWithdrawals).toBeCloseTo(500);
    expect(result.profitBreakdown.excludedFromProfit.auditTrail).toBeCloseTo(250);
    expect(result.profitBreakdown.excludedFromProfit.payrollLinkedExpenses).toBeCloseTo(800);
  });

  it("counts an allocated source expense once instead of direct plus allocated", () => {
    const result = calculateJobProfit({
      invoices: [{ total: "1000.00", status: "paid" }],
      expenses: [
        { id: 12, amount: "100.00", category: "Materials", countsTowardJobProfit: true },
        { id: 13, amount: "40.00", category: "Tools/Equipment", countsTowardJobProfit: true },
      ],
      allocations: [{ expenseId: 12, amount: "60.00" }],
    });

    expect(result.directExpenseTotal).toBeCloseTo(40);
    expect(result.allocatedExpenseTotal).toBeCloseTo(60);
    expect(result.jobExpenses).toBeCloseTo(100);
    expect(result.netProfit).toBeCloseTo(900);
  });

  it("uses a saved reimbursement once and does not replace it with an estimate", () => {
    const result = calculateJobProfit({
      invoices: [{ total: "500.00", status: "paid" }],
      mileageReimbursement: 42.75,
      hasMileageReimbursement: true,
      estimatedFuelCost: 80,
      includeMileageInJobCosts: true,
    });

    expect(result.jobExpenses).toBeCloseTo(42.75);
    expect(result.estimatedFuelCost).toBe(0);
    expect(result.netProfit).toBeCloseTo(457.25);
  });

  it("keeps a saved reimbursement in the source data without applying it when opted out", () => {
    const result = calculateJobProfit({
      invoices: [{ total: "500.00", status: "paid" }],
      mileageReimbursement: 42.75,
      hasMileageReimbursement: true,
      estimatedFuelCost: 80,
      includeMileageInJobCosts: false,
    });

    expect(result.mileageReimbursement).toBe(0);
    expect(result.jobExpenses).toBe(0);
    expect(result.includedCostTotal).toBe(0);
    expect(result.profitBreakdown.includedCosts.mileageReimbursement).toBe(0);
    expect(result.netProfit).toBeCloseTo(500);
  });

  it("keeps a job with no costs at its invoiced revenue", () => {
    const result = calculateJobProfit({
      invoices: [{ total: "182.27", status: "paid" }],
    });

    expect(result.netProfit).toBeCloseTo(182.27);
    expect(result.includedCostTotal).toBe(0);
  });

  it("reports reversed fixed and allocation payouts without changing active costs", () => {
    const result = calculateJobProfit({
      invoices: [{ total: "1000.00", status: "paid" }],
      fixedSubCost: 400,
      allocPaid: 250,
      reversedFixedPayout: 900,
      reversedAllocationPayout: 750,
    });

    expect(result.subLaborCost).toBeCloseTo(400);
    expect(result.allocPaid).toBeCloseTo(250);
    expect(result.includedCostTotal).toBeCloseTo(650);
    expect(result.netProfit).toBeCloseTo(350);
    expect(result.profitBreakdown.excludedFromProfit.reversedFixedPayouts).toBeCloseTo(900);
    expect(result.profitBreakdown.excludedFromProfit.reversedAllocationPayouts).toBeCloseTo(750);
  });
});

describe("job profit response builders", () => {
  it("preserves explicit unavailable fuel values instead of restoring calculation zeroes", () => {
    const calculation = calculateJobProfit({
      invoices: [{ total: "2500.00", status: "paid" }],
      estimatedFuelCost: 0,
    });

    const detail = buildJobProfitResponse(calculation, {
      splitPool: 0,
      mileageReimbursement: null,
      estimatedFuelCost: null,
      actualFuelCost: null,
    });
    const summary = buildJobProfitSummaryResponse(calculation, {
      splitPool: 0,
      estimatedFuelCost: null,
      actualFuelCost: null,
    });

    expect(detail.estimatedFuelCost).toBeNull();
    expect(detail.actualFuelCost).toBeNull();
    expect(summary.estimatedFuelCost).toBeNull();
    expect(summary.actualFuelCost).toBeNull();
  });

  it("keeps route estimate and real fuel expense values when the route supplies them", () => {
    const calculation = calculateJobProfit({
      invoices: [{ total: "2500.00", status: "paid" }],
      expenses: [{ id: 1, amount: "38.50", category: "Fuel/Travel", countsTowardJobProfit: true }],
      estimatedFuelCost: 25,
      hasActualFuelExpense: true,
    });

    const response = buildJobProfitResponse(calculation, {
      splitPool: 0,
      mileageReimbursement: null,
      estimatedFuelCost: null,
      actualFuelCost: 38.5,
    });

    expect(response.estimatedFuelCost).toBeNull();
    expect(response.actualFuelCost).toBe(38.5);
  });
});