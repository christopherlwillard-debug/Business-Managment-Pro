import { describe, expect, it } from "vitest";
import { buildInvoiceEmailHtml, dataUriToInlineImage } from "./gmailSend";
import { buildInvoiceBodyHtml } from "./printInvoice";

const logoDataUri = "data:image/png;base64,aW52b2ljZS1sb2dv";
const invoice = {
  invoiceNumber: "INV-1001",
  issueDate: "2026-09-03",
  lineItems: [{ description: "Sealcoat", quantity: 1, unitPrice: 500 }],
  subtotal: 500,
  taxRate: null,
  taxAmount: null,
  total: 500,
  businessLine: "asphalt_sealing",
};

describe("invoice brand rendering", () => {
  it("keeps Gmail preview and printable attachment inputs on the same business brand", () => {
    const emailHtml = buildInvoiceEmailHtml({
      ...invoice,
      companyName: "Willard's Asphalt Sealing",
      companyAddress: "200 Sealcoat Road",
      logoSrc: logoDataUri,
    });
    const printHtml = buildInvoiceBodyHtml(invoice, {
      companyName: "Willard's Asphalt Sealing",
      companyAddress: "200 Sealcoat Road",
      logoAbsoluteUrl: logoDataUri,
    });

    for (const html of [emailHtml, printHtml]) {
      expect(html).toContain("Willard's Asphalt Sealing");
      expect(html).toContain("200 Sealcoat Road");
      expect(html).toContain(logoDataUri);
      expect(html).not.toContain("Willard's General Contracting LLC");
    }
  });

  it("keeps the full business name when no logo can be rendered", () => {
    const emailHtml = buildInvoiceEmailHtml({
      ...invoice,
      companyName: "Willard's General Contracting LLC",
      businessLine: "general_contracting",
      logoSrc: null,
    });
    const printHtml = buildInvoiceBodyHtml(
      { ...invoice, businessLine: "general_contracting" },
      { companyName: "Willard's General Contracting LLC", logoAbsoluteUrl: null },
    );

    expect(emailHtml).toContain("Willard's General Contracting LLC");
    expect(printHtml).toContain("Willard's General Contracting LLC");
  });

  it("converts the optimized data URI into a Gmail inline image", () => {
    expect(dataUriToInlineImage(logoDataUri)).toEqual({
      mimeType: "image/png",
      base64: "aW52b2ljZS1sb2dv",
      filename: "invoice-logo.png",
      contentId: "invoice-brand-logo",
    });
  });
});