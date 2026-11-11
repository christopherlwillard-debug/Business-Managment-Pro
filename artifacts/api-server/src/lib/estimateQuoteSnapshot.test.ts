import { describe, expect, it } from "vitest";
import { buildEstimateQuoteSnapshot } from "./estimateQuoteSnapshot.js";

const estimate: any = {
  id: 12,
  title: "Driveway service",
  clientId: 3,
  template: null,
  status: "draft",
  subtotal: "120.00",
  markupPercent: "10",
  contingencyPercent: null,
  total: "132.00",
  jobType: "Maintenance",
  notes: "INTERNAL COSTS: do not expose",
  internalCost: "90.00",
  marginPercent: "25",
  privateNotes: "Never send this note",
  internalApiField: "internal-only-value",
  workAddress: "12 Main St",
  customerNotes: "Payment due on completion",
  quoteExpiresAt: null,
  lineItems: [
    { category: "Labor", description: "Wash and seal", quantity: 1, unit: "job", unitCost: 120 },
  ],
  jobId: null,
  businessLine: "general_contracting",
  businessId: 1,
  stripePaymentLinkId: null,
  stripePaymentLinkUrl: null,
  squarePaymentLinkId: null,
  squarePaymentLinkUrl: null,
  depositPaidAt: null,
  depositPaidAmount: null,
  mfhDealerPrice: null,
  mfhQuotedPrice: null,
  mfhGuideName: null,
  createdAt: new Date("2026-01-02T12:00:00.000Z"),
  clientName: "Test Customer",
  clientEmail: "test@example.com",
  clientPhone: null,
  clientAddress: "12 Main St",
  clientCity: "Town",
  clientState: "KY",
  clientZip: "40000",
};

describe("buildEstimateQuoteSnapshot", () => {
  it("keeps the customer snapshot allow-listed and stable", async () => {
    const first = await buildEstimateQuoteSnapshot({
      estimate,
      business: null,
      settings: null,
      revision: 1,
      expiresAt: "2026-02-01",
    });
    const second = await buildEstimateQuoteSnapshot({
      estimate,
      business: null,
      settings: null,
      revision: 1,
      expiresAt: "2026-02-01",
    });

    expect(first.contentHash).toBe(second.contentHash);
    expect(first.customerSnapshot).not.toHaveProperty("notes");
    expect(first.customerSnapshot).not.toHaveProperty("businessId");
    expect(first.customerSnapshot).not.toHaveProperty("internalCost");
    expect(first.customerSnapshot).not.toHaveProperty("marginPercent");
    expect(first.customerSnapshot).not.toHaveProperty("privateNotes");
    expect(first.customerSnapshot).not.toHaveProperty("internalApiField");
    expect(JSON.stringify(first.customerSnapshot)).not.toContain("INTERNAL COSTS");
    expect(JSON.stringify(first.customerSnapshot)).not.toContain("internal-only-value");
    expect(first.customerSnapshot.items[0]?.amount).toBe(132);
  });

  it("keeps content identity stable when only the revision number changes", async () => {
    const first = await buildEstimateQuoteSnapshot({
      estimate,
      business: null,
      settings: null,
      revision: 1,
      expiresAt: "2026-02-01",
    });
    const nextRevision = await buildEstimateQuoteSnapshot({
      estimate,
      business: null,
      settings: null,
      revision: 2,
      expiresAt: "2026-02-01",
    });
    expect(nextRevision.customerSnapshot.revision).toBe(2);
    expect(nextRevision.contentHash).toBe(first.contentHash);
  });

  it("changes content identity when a customer-visible field changes", async () => {
    const original = await buildEstimateQuoteSnapshot({
      estimate,
      business: null,
      settings: null,
      revision: 1,
      expiresAt: "2026-02-01",
    });
    const changed = await buildEstimateQuoteSnapshot({
      estimate: { ...estimate, title: "Driveway cleaning and sealing" },
      business: null,
      settings: null,
      revision: 2,
      expiresAt: "2026-02-01",
    });
    expect(changed.contentHash).not.toBe(original.contentHash);
  });

  it("rejects a saved total that does not reconcile", async () => {
    await expect(buildEstimateQuoteSnapshot({
      estimate: { ...estimate, total: "133.00" } as never,
      business: null,
      settings: null,
      revision: 1,
      expiresAt: null,
    })).rejects.toThrow("does not reconcile");
  });
});
