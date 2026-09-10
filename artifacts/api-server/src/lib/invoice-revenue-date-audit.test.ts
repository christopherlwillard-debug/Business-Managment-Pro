import { describe, expect, it } from "vitest";
import { buildInvoiceRevenueDateAuditCsv, type InvoiceRevenueDateAuditRow } from "./invoice-revenue-date-audit.js";

const row: InvoiceRevenueDateAuditRow = {
  id: 12,
  invoiceNumber: "INV-12",
  clientName: 'Smith, "West"',
  jobTitle: "Seal driveway",
  issueDate: "2026-08-01",
  dashboardRevenueDate: "2026-08-01",
  amount: 1250.5,
  businessId: 2,
  businessLine: "asphalt",
};

describe("buildInvoiceRevenueDateAuditCsv", () => {
  it("exports the same issue-date fallback classification and audit fields", () => {
    const csv = buildInvoiceRevenueDateAuditCsv([row]);

    expect(csv).toContain('"Dashboard revenue date"');
    expect(csv).toContain('"Date basis"');
    expect(csv).toContain('"Issue date fallback"');
    expect(csv).toContain('"1250.50"');
    expect(csv).toContain('"2","asphalt"');
    expect(csv).toContain('"Smith, ""West"""');
  });

  it("protects spreadsheet exports from formula-like text", () => {
    const csv = buildInvoiceRevenueDateAuditCsv([{
      ...row,
      invoiceNumber: "=1+1",
      clientName: "@unsafe",
    }]);

    expect(csv).toContain('"\'=1+1"');
    expect(csv).toContain('"\'@unsafe"');
  });
});