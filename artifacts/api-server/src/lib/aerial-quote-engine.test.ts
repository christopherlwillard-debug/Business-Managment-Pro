import { describe, expect, it } from "vitest";
import { calculateServiceEstimate } from "./aerial-quote-engine.js";

const entries = [{
  label: "Front lawn",
  category: "mowable_area",
  kind: "area" as const,
  quantity: 43_560,
  unit: "sq_ft" as const,
}];

describe("calculateServiceEstimate", () => {
  it("converts measured area and prices with the configured unit", () => {
    const result = calculateServiceEstimate({
      serviceKey: "lawn_mowing",
      profileVersion: 1,
      entries,
      rules: {
        components: [{
          label: "Mowing",
          category: "Lawn service",
          basis: "customer_rate",
          chargeType: "per_unit",
          amount: 100,
          measurementCategory: "mowable_area",
          kind: "area",
          unit: "acre",
        }],
        marginMode: "none",
        marginPercent: 0,
        minimumCharge: 0,
        quantityRounding: { mode: "none", increment: 1 },
      },
    });
    expect(result.lineItems[0]).toMatchObject({ quantity: 1, unit: "acre", unitCost: 100 });
    expect(result.subtotal).toBe(100);
  });

  it.each([
    ["markup", 20, 120],
    ["target_margin", 20, 125],
  ] as const)("applies %s to direct cost", (marginMode, marginPercent, expected) => {
    const result = calculateServiceEstimate({
      serviceKey: "parking_lot_cleaning",
      profileVersion: 2,
      entries: [{ label: "Lot", category: "lot", kind: "area", quantity: 1000, unit: "sq_ft" }],
      rules: {
        components: [{
          label: "Labor",
          category: "Labor",
          basis: "direct_cost",
          chargeType: "fixed",
          amount: 100,
        }],
        marginMode,
        marginPercent,
        minimumCharge: 0,
        quantityRounding: { mode: "none", increment: 1 },
      },
    });
    expect(result.subtotal).toBe(expected);
  });

  it("adds a separate minimum adjustment and rejects missing measurements", () => {
    const rules = {
      components: [{
        label: "Mowing",
        category: "Lawn service",
        basis: "customer_rate",
        chargeType: "per_unit",
        amount: 0.001,
        measurementCategory: "mowable_area",
        kind: "area",
        unit: "sq_ft",
      }],
      marginMode: "none",
      marginPercent: 0,
      minimumCharge: 100,
      quantityRounding: { mode: "none", increment: 1 },
    };
    const result = calculateServiceEstimate({ serviceKey: "lawn_mowing", profileVersion: 1, entries, rules });
    expect(result.subtotal).toBe(100);
    expect(result.lineItems.at(-1)).toMatchObject({
      category: "Adjustment",
      description: "Minimum service charge",
      unitCost: 56.44,
    });
    expect(() => calculateServiceEstimate({
      serviceKey: "lawn_mowing",
      profileVersion: 1,
      entries,
      rules: { ...rules, components: [{ ...rules.components[0], chargeType: "per_unit", measurementCategory: "wrong" }] },
    })).toThrow("No wrong measurement is available");
  });

  it("does not accept an incompatible measurement unit", () => {
    expect(() => calculateServiceEstimate({
      serviceKey: "lawn_mowing",
      profileVersion: 1,
      entries: [{ label: "Boundary", category: "edge", kind: "area", quantity: 20, unit: "ft" as never }],
      rules: {
        components: [{
          label: "Mowing",
          category: "Lawn service",
          basis: "customer_rate",
          chargeType: "per_unit",
          amount: 1,
          measurementCategory: "edge",
          kind: "area",
          unit: "sq_ft",
        }],
        marginMode: "none",
        marginPercent: 0,
        minimumCharge: 0,
        quantityRounding: { mode: "none", increment: 1 },
      },
    })).toThrow("No edge measurement is available");
  });
});
