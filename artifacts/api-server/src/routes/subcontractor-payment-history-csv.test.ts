import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {} }));

import { paymentHistoryToCsv } from "./subcontractors";

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
});