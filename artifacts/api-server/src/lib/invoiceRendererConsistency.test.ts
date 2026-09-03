import { describe, expect, it } from "vitest";
import { buildInvoiceEmailHtml as buildServerInvoiceEmailHtml } from "./invoiceEmail";

const browserEmailModulePath = new URL("../../../contractor-app/src/lib/gmailSend.ts", import.meta.url).href;
const browserPrintModulePath = new URL("../../../contractor-app/src/lib/printInvoice.ts", import.meta.url).href;
const { buildInvoiceEmailHtml: buildBrowserInvoiceEmailHtml } = await import(browserEmailModulePath);
const { buildInvoiceBodyHtml } = await import(browserPrintModulePath);

const logoDataUri = "data:image/png;base64,aW52b2ljZS1sb2dv";
const invoice = {
  invoiceNumber: "INV-1001",
  issueDate: "2026-09-03",
  dueDate: "2026-10-03",
  lineItems: [{ description: "Sealcoat", quantity: 1, unitPrice: 500 }],
  subtotal: 500,
  taxRate: null,
  taxAmount: null,
  total: 500,
};

describe("invoice logo renderer consistency", () => {
  it.each([
    ["top-left", "small", 120, 50],
    ["top-center", "large", 300, 120],
    ["top-right", "medium", 200, 75],
  ])("uses %s/%s in browser print, Gmail, and server email/PDF HTML", (position, size, width, height) => {
    const browserEmail = buildBrowserInvoiceEmailHtml({
      ...invoice,
      companyName: "Willard's Asphalt Sealing",
      companyAddress: "200 Sealcoat Road",
      logoSrc: logoDataUri,
      logoPosition: position,
      logoSize: size,
    });
    const browserPrint = buildInvoiceBodyHtml(invoice, {
      companyName: "Willard's Asphalt Sealing",
      companyAddress: "200 Sealcoat Road",
      logoAbsoluteUrl: logoDataUri,
      logoPosition: position,
      logoSize: size,
    });
    const serverEmail = buildServerInvoiceEmailHtml(
      {
        ...invoice,
        subtotal: String(invoice.subtotal),
        total: String(invoice.total),
      },
      {
        companyName: "Willard's Asphalt Sealing",
        companyAddress: "200 Sealcoat Road",
        logoDataUri,
        invoiceLogoPosition: position,
        invoiceLogoSize: size,
      },
    );

    for (const html of [browserEmail, browserPrint, serverEmail]) {
      expect(html).toContain(`data-invoice-brand-position="${position}"`);
      expect(html).toContain(`width:${width}px`);
      expect(html).toContain(`height:${height}px`);
      expect(html).toContain("Willard's Asphalt Sealing");
      expect(html).toContain("200 Sealcoat Road");
    }
  });

  it("keeps a centered business-name header when no logo can be used", () => {
    const browserEmail = buildBrowserInvoiceEmailHtml({
      ...invoice,
      companyName: "Willard's General Contracting LLC",
      logoSrc: null,
      logoPosition: "top-center",
      logoSize: "large",
    });
    const browserPrint = buildInvoiceBodyHtml(invoice, {
      companyName: "Willard's General Contracting LLC",
      logoAbsoluteUrl: null,
      logoPosition: "top-center",
      logoSize: "large",
    });
    const serverEmail = buildServerInvoiceEmailHtml(
      {
        ...invoice,
        subtotal: String(invoice.subtotal),
        total: String(invoice.total),
      },
      {
        companyName: "Willard's General Contracting LLC",
        logoDataUri: null,
        invoiceLogoPosition: "top-center",
        invoiceLogoSize: "large",
      },
    );

    for (const html of [browserEmail, browserPrint, serverEmail]) {
      expect(html).toContain('data-invoice-brand-position="top-center"');
      expect(html).toContain("Willard's General Contracting LLC");
      expect(html).not.toContain("data-invoice-logo=");
    }
  });
});