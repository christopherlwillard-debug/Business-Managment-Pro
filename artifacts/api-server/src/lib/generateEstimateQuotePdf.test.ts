import { describe, expect, it } from "vitest";
import { generateEstimateQuotePdf } from "./generateEstimateQuotePdf.js";

describe("generateEstimateQuotePdf", () => {
  it("creates a valid customer quote PDF", async () => {
    const pdf = await generateEstimateQuotePdf({
      quoteNumber: "Q-2026-000042",
      title: "Routine maintenance",
      issuedAt: "2026-11-10T12:00:00.000Z",
      expiresAt: "2026-12-10",
      customerName: "Sample Customer",
      customerEmail: "customer@example.test",
      customerPhone: "555-0100",
      billingAddress: "1 Main St, Anytown, IL 60000",
      workAddress: "2 Work St, Anytown, IL 60000",
      jobType: "Maintenance",
      terms: "Payment due upon completion.",
      items: [{ description: "Seasonal service", quantity: 1, unit: "LOT", amount: 500 }],
      subtotal: 500,
      adjustment: 0,
      tax: 35,
      total: 535,
      brand: {
        name: "Sample Contracting",
        address: "10 Office St",
        city: "Anytown",
        state: "IL",
        zip: "60000",
        phone: "555-0199",
        email: "office@example.test",
        website: null,
        logo: null,
      },
    });

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1")).toContain("%%EOF");
    expect(pdf.length).toBeGreaterThan(500);
  });
});
