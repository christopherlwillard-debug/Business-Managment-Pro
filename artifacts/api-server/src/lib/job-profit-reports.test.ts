import { describe, expect, it } from "vitest";
import { calculateJobProfit } from "./job-profit.js";
import { buildClosedJobExportRow, calculateOwnerPayFromJobProfit } from "./job-profit-reports.js";
import type { LoadedJobProfit } from "./job-profit-loader.js";

function loaded(input: Parameters<typeof calculateJobProfit>[0]): LoadedJobProfit {
  return {
    calculation: calculateJobProfit(input),
    expenses: input.expenses ?? [],
    allocations: input.allocations ?? [],
    invoiceStatus: "paid",
    includeMileageInJobCosts: true,
    totalSubHours: input.totalSubHours ?? 0,
    manHours: null,
  };
}

describe("job profit report projections", () => {
  it("keeps export and owner-pay values isolated by job", () => {
    const jobA = loaded({
      invoices: [{ total: "1000.00", status: "paid" }],
      expenses: [
        { id: 11, amount: "300.00", category: "Labor", countsTowardJobProfit: true },
        { id: 12, amount: "50.00", category: "Travel", countsTowardJobProfit: false, tripId: 3 },
      ],
      hourlyLaborCost: 200,
    });
    const jobB = loaded({
      invoices: [{ total: "1000.00", status: "paid" }],
    });

    const exportA = buildClosedJobExportRow({
      dateOpened: "2026-08-01",
      dateClosed: "2026-08-02",
      jobNumber: 101,
      businessLine: "general",
      jobName: "Job A",
      customer: "Customer A",
      location: "A",
      invoiceStatus: "paid",
      subStatus: "Outstanding",
    }, jobA);
    const exportB = buildClosedJobExportRow({
      dateOpened: "2026-08-01",
      dateClosed: "2026-08-02",
      jobNumber: 102,
      businessLine: "general",
      jobName: "Job B",
      customer: "Customer B",
      location: "B",
      invoiceStatus: "paid",
      subStatus: "Outstanding",
    }, jobB);

    expect(exportA.netProfit).toBeCloseTo(500);
    expect(exportB.netProfit).toBeCloseTo(1000);
    expect(exportA.labor).toBeCloseTo(500);
    expect(exportB.labor).toBe(0);
    expect(calculateOwnerPayFromJobProfit(jobA, 0, 5, 25).revenue).toBe(1000);
    expect(calculateOwnerPayFromJobProfit(jobB, 0, 5, 25).revenue).toBe(1000);
    expect(calculateOwnerPayFromJobProfit(jobA, 0, 5, 25).takeHome)
      .toBeLessThan(calculateOwnerPayFromJobProfit(jobB, 0, 5, 25).takeHome);
  });

  it("does not count allocated sources twice and excludes audit-only rows", () => {
    const source = loaded({
      invoices: [{ total: "1000.00", status: "paid" }],
      expenses: [
        { id: 1, amount: "100.00", category: "Materials", countsTowardJobProfit: true },
        { id: 2, amount: "75.00", category: "Travel", countsTowardJobProfit: false, tripId: 8 },
      ],
      allocations: [{ expenseId: 1, amount: "60.00" }],
    });
    source.allocations[0].category = "Materials";

    const row = buildClosedJobExportRow({
      dateOpened: null,
      dateClosed: null,
      jobNumber: 103,
      businessLine: "general",
      jobName: "Allocated job",
      customer: "",
      location: "",
      invoiceStatus: "paid",
      subStatus: "Outstanding",
    }, source);

    expect(row.materials).toBe(60);
    expect(row.netProfit).toBeCloseTo(940);
    expect(source.calculation.auditTrailTotal).toBe(75);
  });

  it("keeps reversed fixed/allocation payouts out of closed export and owner pay", () => {
    const active = loaded({
      invoices: [{ total: "2400.00", status: "paid" }],
      expenses: [
        { id: 21, amount: "300.00", category: "Materials", countsTowardJobProfit: true },
      ],
      fixedSubCost: 400,
      allocPaid: 250,
    });
    const withReversals = loaded({
      invoices: [{ total: "2400.00", status: "paid" }],
      expenses: [
        { id: 21, amount: "300.00", category: "Materials", countsTowardJobProfit: true },
      ],
      fixedSubCost: 400,
      allocPaid: 250,
      reversedFixedPayout: 900,
      reversedAllocationPayout: 750,
    });

    const exportRow = buildClosedJobExportRow({
      dateOpened: "2026-08-10",
      dateClosed: "2026-08-12",
      jobNumber: 104,
      businessLine: "general",
      jobName: "Reversal-aware job",
      customer: "Customer",
      location: "A",
      invoiceStatus: "paid",
      subStatus: "Settled",
    }, withReversals);
    const pay = calculateOwnerPayFromJobProfit(withReversals, 25, 5, 20);
    const activePay = calculateOwnerPayFromJobProfit(active, 25, 5, 20);

    expect(withReversals.calculation.profitBreakdown.includedCosts.total).toBeCloseTo(950);
    expect(withReversals.calculation.profitBreakdown.includedCosts.splitPayouts).toBeCloseTo(250);
    expect(withReversals.calculation.profitBreakdown.excludedFromProfit.reversedFixedPayouts).toBeCloseTo(900);
    expect(withReversals.calculation.profitBreakdown.excludedFromProfit.reversedAllocationPayouts).toBeCloseTo(750);
    expect(exportRow.materials).toBeCloseTo(300);
    expect(exportRow.labor).toBeCloseTo(650);
    expect(exportRow.netProfit).toBeCloseTo(1450);

    expect(pay.splitPool).toBeCloseTo(1595);
    expect(pay.ownerShare).toBeCloseTo(1196.25);
    expect(pay.taxReserve).toBeCloseTo(239.25);
    expect(pay.takeHome).toBeCloseTo(957);
    expect(pay).toEqual(activePay);
  });
});