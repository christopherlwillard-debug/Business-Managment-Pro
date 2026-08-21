import { describe, expect, it } from "vitest";
import { isMaterialInvoiceLine } from "./invoiceLineItems";

describe("isMaterialInvoiceLine", () => {
  it("recognizes source-tagged material lines", () => {
    expect(isMaterialInvoiceLine({ description: "Custom supplies", source: "material" })).toBe(true);
  });

  it("recognizes manually entered singular and plural labels", () => {
    expect(isMaterialInvoiceLine({ description: "Material" })).toBe(true);
    expect(isMaterialInvoiceLine({ description: " materials " })).toBe(true);
  });

  it("does not classify unrelated invoice lines as materials", () => {
    expect(isMaterialInvoiceLine({ description: "Repair Labor" })).toBe(false);
    expect(isMaterialInvoiceLine({ description: "Material handling" })).toBe(false);
  });
});