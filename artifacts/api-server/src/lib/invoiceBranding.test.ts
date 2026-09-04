import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { resolveInvoiceBrand } from "@workspace/api-zod";
import { buildInvoiceEmailHtml } from "./invoiceEmail";
import { loadInvoiceBrand } from "./invoiceBranding";

const settings = {
  companyName: "Willard's General Contracting LLC",
  companyAddress: "100 Main Street",
  companyCity: "Frankfort",
  companyState: "KY",
  companyZip: "40601",
  companyPhone: "555-0100",
  companyEmail: "office@example.com",
  logoUrl: "/objects/general-logo.png",
  dbaLogoUrl: "/objects/legacy-asphalt-logo.png",
};

const generalBusiness = {
  slug: "general_contracting",
  type: "general_contracting",
  name: "General Contracting",
  logoUrl: "/objects/wrong-generic-row-logo.png",
};

const asphaltBusiness = {
  slug: "asphalt_sealing",
  type: "asphalt_sealing",
  name: "Willard's Asphalt Sealing",
  address: "200 Sealcoat Road",
  city: "Lexington",
  state: "KY",
  zip: "40502",
  phone: "555-0200",
  email: "sealing@example.com",
  logoUrl: "/objects/asphalt-logo.png",
  invoiceLogoLayout: { x: 0.7, width: 240, height: 90 },
};

const invoice = {
  invoiceNumber: "INV-1001",
  issueDate: "2026-09-03",
  lineItems: [{ description: "Work", quantity: 1, unitPrice: 100 }],
  subtotal: 100,
  taxRate: null,
  taxAmount: null,
  total: 100,
};

describe("invoice branding", () => {
  it("uses the configured full company name and settings logo for General Contracting", () => {
    const brand = resolveInvoiceBrand("general_contracting", settings, generalBusiness);

    expect(brand.displayName).toBe("Willard's General Contracting LLC");
    expect(brand.logoUrl).toBe("/objects/general-logo.png");
    expect(brand.logoUrl).not.toBe(generalBusiness.logoUrl);
  });

  it("uses the selected Asphalt Sealing profile without borrowing the primary logo", () => {
    const brand = resolveInvoiceBrand("asphalt_sealing", settings, asphaltBusiness);

    expect(brand).toMatchObject({
      displayName: "Willard's Asphalt Sealing",
      address: "200 Sealcoat Road",
      email: "sealing@example.com",
      logoUrl: "/objects/asphalt-logo.png",
      logoLayout: { x: 0.7, width: 240, height: 90 },
    });
  });

  it("falls back to shared logo settings until the selected business saves a layout", () => {
    const brand = resolveInvoiceBrand(
      "general_contracting",
      { ...settings, invoiceLogoPosition: "top-center", invoiceLogoSize: "large" },
      generalBusiness,
    );

    expect(brand.logoLayout).toEqual({ x: 0.5, width: 300, height: 120 });
  });

  it("keeps the selected business name visible and does not cross-fill a mismatched logo", () => {
    const brand = resolveInvoiceBrand("asphalt_sealing", settings, generalBusiness);

    expect(brand.displayName).toBe("Asphalt Sealing");
    expect(brand.logoUrl).toBeNull();
    expect(brand.logoUrl).not.toBe(settings.logoUrl);
  });

  it("renders the resolved name and logo source in server email and PDF input HTML", () => {
    const logoDataUri = "data:image/png;base64,aW52b2ljZS1sb2dv";
    const emailHtml = buildInvoiceEmailHtml(
      {
        invoiceNumber: invoice.invoiceNumber,
        issueDate: invoice.issueDate,
        lineItems: invoice.lineItems,
        subtotal: String(invoice.subtotal),
        total: String(invoice.total),
      },
      {
        companyName: "Willard's Asphalt Sealing",
        companyAddress: "200 Sealcoat Road",
        logoDataUri,
        invoiceLogoPosition: "top-center",
        invoiceLogoSize: "large",
      },
    );

    expect(emailHtml).toContain("Willard's Asphalt Sealing");
    expect(emailHtml).toContain("200 Sealcoat Road");
    expect(emailHtml).toContain(logoDataUri);
    expect(emailHtml).toContain('data-invoice-brand-position="top-center"');
    expect(emailHtml).toContain("width:300px");
    expect(emailHtml).toContain("height:120px");
    expect(emailHtml).not.toContain("Willard's General Contracting LLC");
  });

  it("keeps a centered business-name header when the logo is unavailable", () => {
    const emailHtml = buildInvoiceEmailHtml(invoice as any, {
      companyName: "Willard's General Contracting LLC",
      companyEmail: "office@example.com",
      invoiceLogoPosition: "top-center",
      invoiceLogoSize: "large",
      logoDataUri: null,
    });

    expect(emailHtml).toContain('data-invoice-brand-position="top-center"');
    expect(emailHtml).toContain("Willard's General Contracting LLC");
    expect(emailHtml).not.toContain("data-invoice-logo=");
  });

  it("drops an unreadable logo while preserving the full business name fallback", async () => {
    const brand = await loadInvoiceBrand(
      "general_contracting",
      { ...settings, logoUrl: "https://untrusted.example/logo.png" } as any,
      generalBusiness as any,
    );

    expect(brand.displayName).toBe("Willard's General Contracting LLC");
    expect(brand.logo).toBeNull();
  });

  it("optimizes an embedded logo before it is placed in an email", async () => {
    const source = await sharp({
      create: {
        width: 800,
        height: 400,
        channels: 4,
        background: { r: 245, g: 158, b: 11, alpha: 1 },
      },
    }).png().toBuffer();
    const brand = await loadInvoiceBrand(
      "general_contracting",
      {
        ...settings,
        logoUrl: `data:image/png;base64,${source.toString("base64")}`,
      } as any,
      generalBusiness as any,
    );

    expect(brand.logo?.mimeType).toBe("image/png");
    expect(brand.logo?.dataUri).toMatch(/^data:image\/png;base64,/);
    const metadata = await sharp(brand.logo!.buffer).metadata();
    expect(metadata.width).toBeLessThanOrEqual(400);
    expect(metadata.height).toBeLessThanOrEqual(180);
  });
});