import { describe, expect, it } from "vitest";
import { buildInvoiceEmailHtml } from "./invoiceEmail";

describe("server invoice email rendering", () => {
  it("renders the linked external work-order number for contract invoices", () => {
    const html = buildInvoiceEmailHtml({
      invoiceNumber: "INV-TEST-1042",
      issueDate: "2026-11-17",
      clientName: "E2E Contract Payer",
      contractExternalOrderNumber: "SAGE-TEST-1042",
      lineItems: [{ description: "Repair", quantity: 1, unitPrice: 125 }],
      subtotal: "125.00",
      taxRate: "0",
      taxAmount: "0",
      total: "125.00",
    }, { companyName: "BuildPro Test" });

    expect(html).toContain("E2E Contract Payer");
    expect(html).toContain("External work order: SAGE-TEST-1042");
  });

  it("does not add an external work-order label to ordinary invoices", () => {
    const html = buildInvoiceEmailHtml({
      invoiceNumber: "INV-TEST-ORDINARY",
      issueDate: "2026-11-17",
      clientName: "E2E Residential Customer",
      lineItems: [{ description: "Repair", quantity: 1, unitPrice: 125 }],
      subtotal: "125.00",
      taxRate: "0",
      taxAmount: "0",
      total: "125.00",
    }, { companyName: "BuildPro Test" });

    expect(html).toContain("E2E Residential Customer");
    expect(html).not.toContain("External work order:");
  });
});
