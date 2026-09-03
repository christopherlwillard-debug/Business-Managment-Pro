import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {} }));

import {
  filterPaymentHistoryJobs,
  paymentHistoryExportFilename,
  paymentHistoryToCsv,
  validatePaymentHistoryDateRange,
} from "./subcontractors";

describe("paymentHistoryToCsv", () => {
  it("exports the bookkeeping columns with escaped values and formatted amounts", () => {
    const csv = paymentHistoryToCsv([{
      jobId: 7,
      jobTitle: "Roof, Main",
      businessLine: 'Line "A"',
      compensationType: "hourly",
      totalHours: 8.5,
      amountOwed: 1234.5,
      amountPaid: 1000,
      paymentStatus: "partial",
      paidDate: null,
      paidAt: "2026-09-01",
    }]);

    expect(csv).toBe(
      '"Job","Business Line","Comp Type","Hours","Owed","Paid","Status","Paid Date"\r\n' +
      '"Roof, Main","Line ""A""","hourly","8.50","1234.50","1000.00","partial","2026-09-01"\r\n'
    );
  });

  it("uses a job fallback and leaves optional values blank", () => {
    const csv = paymentHistoryToCsv([{
      jobId: 42,
      jobTitle: null,
      businessLine: null,
      compensationType: "fixed",
      totalHours: 0,
      amountOwed: null,
      amountPaid: 0,
      paymentStatus: "unpaid",
      paidDate: null,
      paidAt: null,
    }]);

    expect(csv).toContain('"Job #42","","fixed","0.00","","0.00","unpaid",""');
  });

  it("adds the subcontractor identity to aggregate bookkeeping exports", () => {
    const csv = paymentHistoryToCsv([
      {
        subcontractorName: "A&B Roofing",
        jobId: 7,
        jobTitle: "Roof, Main",
        businessLine: "Roofing",
        compensationType: "hourly",
        totalHours: 8.5,
        amountOwed: 1234.5,
        amountPaid: 1000,
        paymentStatus: "paid",
        paidDate: "2026-09-01",
        paidAt: null,
      },
      {
        subcontractorName: "Concrete Co.",
        jobId: 8,
        jobTitle: null,
        businessLine: null,
        compensationType: "fixed",
        totalHours: 0,
        amountOwed: null,
        amountPaid: 0,
        paymentStatus: "unpaid",
        paidDate: null,
        paidAt: null,
      },
    ], { includeSubcontractor: true });

    expect(csv).toBe(
      '"Subcontractor","Job","Business Line","Comp Type","Hours","Owed","Paid","Status","Paid Date"\r\n' +
      '"A&B Roofing","Roof, Main","Roofing","hourly","8.50","1234.50","1000.00","paid","2026-09-01"\r\n' +
      '"Concrete Co.","Job #8","","fixed","0.00","","0.00","unpaid",""\r\n',
    );
  });

  it("validates complete, malformed, and reversed date ranges", () => {
    expect(validatePaymentHistoryDateRange("2026-01-01", "2026-03-31")).toEqual({
      startDate: "2026-01-01",
      endDate: "2026-03-31",
      error: null,
    });
    expect(validatePaymentHistoryDateRange("2026-02-30", "2026-03-31").error)
      .toMatch(/valid dates/);
    expect(validatePaymentHistoryDateRange("2026-04-01", "2026-03-31").error)
      .toMatch(/on or after/);
    expect(validatePaymentHistoryDateRange("2026-01-01", "").error)
      .toMatch(/Both start and end/);
  });

  it("uses the selected range in both export filenames", () => {
    const dateRange = validatePaymentHistoryDateRange("2026-01-01", "2026-03-31");
    expect(paymentHistoryExportFilename(7, null, dateRange))
      .toBe("subcontractor-7-payment-history-2026-01-01-to-2026-03-31.csv");
    expect(paymentHistoryExportFilename(null, null, dateRange))
      .toBe("subcontractors-payment-history-2026-01-01-to-2026-03-31.csv");
  });

  it("filters by inclusive effective dates and keeps business-line filtering", () => {
    const jobs = [
      {
        subcontractorId: 1, subcontractorName: "A", jobId: 1, jobTitle: "In range",
        businessLine: "Roofing", compensationType: "fixed", totalHours: 0,
        amountOwed: 100, amountPaid: 100, paymentStatus: "paid", paidDate: null,
        paidAt: null, effectiveYear: 2025, effectiveDate: "2026-03-31",
      },
      {
        subcontractorId: 1, subcontractorName: "A", jobId: 2, jobTitle: "Out of range",
        businessLine: "Roofing", compensationType: "fixed", totalHours: 0,
        amountOwed: 100, amountPaid: 0, paymentStatus: "unpaid", paidDate: null,
        paidAt: null, effectiveYear: 2026, effectiveDate: "2026-04-01",
      },
      {
        subcontractorId: 1, subcontractorName: "A", jobId: 3, jobTitle: "Other line",
        businessLine: "Sealing", compensationType: "fixed", totalHours: 0,
        amountOwed: 100, amountPaid: 0, paymentStatus: "unpaid", paidDate: null,
        paidAt: null, effectiveYear: 2026, effectiveDate: "2026-03-15",
      },
    ];

    expect(filterPaymentHistoryJobs(jobs, 2025, "Roofing", "2026-03-01", "2026-03-31")
      .map(job => job.jobId)).toEqual([1]);
  });
});