import { describe, expect, it, vi } from "vitest";

const renderHtmlToPdf = vi.fn(async (html: string) =>
  new Blob([html], { type: "application/pdf" }),
);

vi.mock("./renderHtmlToPdf", () => ({ renderHtmlToPdf }));

const { generateAssetDepreciationPdf } = await import("./generateAssetDepreciationPdf");

function asset(name: string) {
  return {
    name,
    assetType: "Equipment",
    status: "active",
    purchaseDate: "2026-01-15",
    purchasePrice: 12000,
    vendor: "Equipment Dealer",
    serialNumber: "SN-123",
    depreciationMethod: "straight-line",
    usefulLifeYears: 5,
    salvageValue: 0,
    section179Eligible: false,
    schedule: [{
      year: 2026,
      annualDeduction: 2400,
      accumulated: 2400,
      bookValue: 9600,
    }],
  };
}

describe("generateAssetDepreciationPdf", () => {
  it("keeps a single-asset export scoped and names the selected asset in the header", async () => {
    const selectedAsset = asset("Compact Excavator");
    const otherAsset = asset("Utility Trailer");

    const blob = await generateAssetDepreciationPdf([selectedAsset]);
    const html = await blob.text();

    expect(renderHtmlToPdf).toHaveBeenCalledOnce();
    expect(html).toContain("Equipment &amp; Assets &mdash; Compact Excavator Report");
    expect(html).toContain("Compact Excavator");
    expect(html).not.toContain(otherAsset.name);
    expect(html).toContain("Assets Shown");
    expect(html).toContain(">1<");
  });
});