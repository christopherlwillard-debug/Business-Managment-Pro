import { describe, expect, it } from "vitest";
import { buildCustomerQuoteView } from "./CustomerQuotePreview";

describe("buildCustomerQuoteView", () => {
  it("excludes internal costs, markup, contingency, and notes", () => {
    const view = buildCustomerQuoteView({
      id: 1,
      title: "Maintenance visit",
      clientName: "Sample Customer",
      status: "draft",
      subtotal: 300,
      markupPercent: 20,
      contingencyPercent: 5,
      total: 396,
      jobType: "Maintenance",
      notes: "INTERNAL: labor rate and margin notes",
      customerNotes: "Balance due upon completion.",
      workAddress: "100 Main St, Town, ST",
      lineItems: [
        { id: 1, category: "Labor", description: "Seasonal maintenance", quantity: 1, unit: "LOT", unitCost: 300, total: 300 },
        { id: 2, category: "Tax", description: "Sales tax", quantity: 1, unit: null, unitCost: 16, total: 16 },
      ],
      createdAt: "2026-11-10T12:00:00.000Z",
    });

    expect(view).toMatchObject({
      title: "Maintenance visit",
      workAddress: "100 Main St, Town, ST",
      tax: 16,
      total: 396,
      scope: [{ description: "Seasonal maintenance", quantity: 1, unit: "LOT" }],
    });
    expect(view).not.toHaveProperty("markupPercent");
    expect(view).not.toHaveProperty("contingencyPercent");
    expect(view).not.toHaveProperty("notes");
    expect(view.customerNotes).toBe("Balance due upon completion.");
    expect(view.scope[0]).not.toHaveProperty("unitCost");
  });
});
