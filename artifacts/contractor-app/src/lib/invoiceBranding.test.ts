import { describe, expect, it } from "vitest";
import { buildInvoiceEmailHtml, dataUriToInlineImage } from "./gmailSend";
import { buildInvoiceBodyHtml } from "./printInvoice";
import { normalizeInvoiceLogoLayout, resolveInvoiceBrand } from "@workspace/api-zod";
import {
  moveInvoiceLogoLayout,
  resizeInvoiceLogoLayout,
  shouldEnterInvoiceLogoLayoutMode,
} from "./invoiceLogoConstants";

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
  it("converts legacy shared placement into a safe initial business layout", () => {
    expect(normalizeInvoiceLogoLayout(null, "top-right", "small")).toEqual({
      x: 1,
      width: 120,
      height: 50,
    });
  });

  it("constrains direct movement and preserves the resize aspect ratio", () => {
    const initial = { x: 0.5, width: 200, height: 80 };
    expect(moveInvoiceLogoLayout(initial, 500, 400).x).toBe(1);
    expect(moveInvoiceLogoLayout(initial, -500, 400).x).toBe(0);

    const resized = resizeInvoiceLogoLayout(initial, 50, 0);
    expect(resized).toMatchObject({ width: 250, height: 100 });
    expect(resized.width / resized.height).toBe(initial.width / initial.height);

    const tall = { x: 0.5, width: 80, height: 140 };
    const boundedTall = resizeInvoiceLogoLayout(tall, 500, 500);
    expect(boundedTall).toEqual(tall);
    expect(boundedTall.width / boundedTall.height).toBe(tall.width / tall.height);
  });

  it("does not re-enter layout mode and reset the draft after a resize interaction", () => {
    const saved = { x: 0.5, width: 200, height: 80 };
    const draftAfterResize = resizeInvoiceLogoLayout(saved, 40, 0);

    expect(shouldEnterInvoiceLogoLayoutMode(true)).toBe(false);
    expect(draftAfterResize).toEqual({ x: 0.5, width: 240, height: 96 });
    expect(draftAfterResize).not.toEqual(saved);
  });

  it("keeps saved layouts isolated by selected business", () => {
    const settings = { invoiceLogoPosition: "top-left", invoiceLogoSize: "medium" };
    const asphalt = resolveInvoiceBrand("asphalt_sealing", settings, {
      slug: "asphalt_sealing",
      name: "Asphalt",
      invoiceLogoLayout: { x: 0.82, width: 246, height: 92 },
    });
    const general = resolveInvoiceBrand("general_contracting", settings, {
      slug: "general_contracting",
      name: "General",
      invoiceLogoLayout: { x: 0.15, width: 144, height: 54 },
    });

    expect(asphalt.logoLayout).toEqual({ x: 0.82, width: 246, height: 92 });
    expect(general.logoLayout).toEqual({ x: 0.15, width: 144, height: 54 });
  });

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
    expect(printHtml).toContain('data-invoice-brand-fallback="true"');
  });

  it.each([
    ["top-left", "large", "300px", "120px"],
    ["top-center", "large", "300px", "120px"],
    ["top-right", "small", "120px", "50px"],
  ])("applies %s/%s consistently to Gmail and printable HTML", (position, size, width, height) => {
    const emailHtml = buildInvoiceEmailHtml({
      ...invoice,
      companyName: "Willard's Asphalt Sealing",
      logoSrc: logoDataUri,
      logoPosition: position,
      logoSize: size,
    });
    const printHtml = buildInvoiceBodyHtml(invoice, {
      companyName: "Willard's Asphalt Sealing",
      logoAbsoluteUrl: logoDataUri,
      logoPosition: position,
      logoSize: size,
    });

    for (const html of [emailHtml, printHtml]) {
      expect(html).toContain(`data-invoice-brand-position="${position}"`);
      expect(html).toContain(`width:${width}`);
      expect(html).toContain(`height:${height}`);
    }
  });

  it("applies a direct custom layout consistently to Gmail and printable HTML", () => {
    const logoLayout = { x: 0.63, width: 238, height: 89 };
    const emailHtml = buildInvoiceEmailHtml({
      ...invoice,
      companyName: "Willard's Asphalt Sealing",
      logoSrc: logoDataUri,
      logoLayout,
    });
    const printHtml = buildInvoiceBodyHtml(invoice, {
      companyName: "Willard's Asphalt Sealing",
      logoAbsoluteUrl: logoDataUri,
      logoLayout,
    });

    for (const html of [emailHtml, printHtml]) {
      expect(html).toContain('data-invoice-logo-x="0.63"');
      expect(html).toContain("width:238px");
      expect(html).toContain("height:89px");
      expect(html).toContain("margin-left:calc(63% - 149.94px)");
    }
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