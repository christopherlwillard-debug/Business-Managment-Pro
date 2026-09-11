import { describe, expect, it } from "vitest";
import { classifyProductionService } from "./job-production-components";

function service(overrides: Partial<{
  name: string;
  itemKey: string | null;
  category: string | null;
  appliesTo: string;
}> = {}) {
  return {
    name: "Production item",
    itemKey: null,
    category: null,
    appliesTo: "production",
    ...overrides,
  };
}

describe("job production component classification", () => {
  it("keeps Service catalog rows out of production components", () => {
    expect(classifyProductionService(service({
      name: "Service Call",
      itemKey: "service_call",
      appliesTo: "service",
    }), "VOG")).toBeNull();
  });

  it("keeps travel surcharges out even when the legacy catalog marked them production", () => {
    expect(classifyProductionService(service({
      name: "Travel Surcharge",
      itemKey: "travel_surcharge",
      category: "Travel",
    }), "VOG")).toBeNull();
  });

  it.each([
    ["VOG Interior Finish", "vog", "vog"],
    ["Hybrid Interior Finish", "interior_hybrid", "hybrid"],
    ["Drywall Interior Finish", "drywall", "drywall"],
  ])("maps %s to Interior Finish · %s", (name, itemKey, variant) => {
    expect(classifyProductionService(service({ name, itemKey }), null)).toEqual({
      componentKey: "interior_finish",
      componentLabel: "Interior Finish",
      variant,
    });
  });

  it.each([
    ["Siding", "siding", "siding"],
    ["Plumbing Hookup", "plumbing_hookup", "plumbing"],
    ["Heat Wrap Waterline", "heat_wrap_waterline", "plumbing"],
    ["Skirting", "skirting", "skirting"],
  ])("maps %s to the approved %s component", (name, itemKey, componentKey) => {
    expect(classifyProductionService(service({ name, itemKey }), null)?.componentKey).toBe(componentKey);
  });

  it("uses the job construction type when a legacy interior item has no variant", () => {
    expect(classifyProductionService(service({
      name: "Interior Trim",
      itemKey: "interior_trim",
    }), "LOT_Hybrid")).toMatchObject({
      componentKey: "interior_finish",
      variant: "hybrid",
    });
  });

  it("quarantines prohibited or unknown production labels under Custom", () => {
    expect(classifyProductionService(service({
      name: "Electrical and Cleanup",
      itemKey: "electrical_cleanup",
    }), null)).toEqual({
      componentKey: "custom",
      componentLabel: "Custom",
      variant: null,
    });
  });
});