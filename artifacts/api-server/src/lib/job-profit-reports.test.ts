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
});