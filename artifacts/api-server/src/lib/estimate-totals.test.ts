import { describe, expect, it } from "vitest";
import { calculateInvoiceTotals } from "@workspace/api-zod";
import {
  calculateEstimateTotals,
  expandEstimateLinesForInvoice,
  type EstimateLineItemInput,
} from "./estimate-totals.js";

describe("estimate totals with explicit tax lines", () => {
  const lines: EstimateLineItemInput[] = [
    { category: "Sealing", description: "Sealing", quantity: 1234.6, unitCost: 0.28 },
    { category: "Adjustment", description: "Minimum/rounding adjustment", quantity: 1, unitCost: 4.31 },
    { category: "Tax", description: "Sales Tax (6.5%)", quantity: 1, unitCost: 22.75 },
  ];

  it("keeps tax outside subtotal and adds it once after markup and contingency", () => {
    const totals = calculateEstimateTotals(lines, 10, 5);

    expect(totals.subtotal).toBe(350);
    expect(totals.total).toBe(427);
  });

  it("keeps zero-tax invoice drafts equal to their saved estimate total", () => {
    const zeroTaxLines = lines.filter(line => line.category !== "Tax");
    const estimate = calculateEstimateTotals(zeroTaxLines, null, null);
    const invoiceLines = expandEstimateLinesForInvoice(zeroTaxLines, null, null);
    const invoice = calculateInvoiceTotals(invoiceLines, null);

    expect(invoice.total).toBe(estimate.total);
  });

  it("keeps tax-inclusive invoice drafts equal to their saved estimate total", () => {
    const estimate = calculateEstimateTotals(lines, null, null);
    const invoiceLines = expandEstimateLinesForInvoice(lines, null, null);
    const invoice = calculateInvoiceTotals(invoiceLines, null);

    expect(estimate.subtotal).toBe(350);
    expect(estimate.total).toBe(372.75);
    expect(invoice.total).toBe(estimate.total);
  });

  it("does not apply estimate markup or contingency to the tax line", () => {
    const invoiceLines = expandEstimateLinesForInvoice(lines, 10, 5);
    const taxLine = invoiceLines.find(line => line.description.startsWith("Sales Tax"));

    expect(taxLine?.unitPrice).toBe(22.75);
  });
});
