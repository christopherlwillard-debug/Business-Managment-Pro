import { describe, expect, it } from "vitest";
import { calculateJobProfit } from "./job-profit.js";

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

  it("keeps a job with no costs at its invoiced revenue", () => {
    const result = calculateJobProfit({
      invoices: [{ total: "182.27", status: "paid" }],
    });

    expect(result.netProfit).toBeCloseTo(182.27);
    expect(result.includedCostTotal).toBe(0);
  });
});