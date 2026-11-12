import { describe, expect, it } from "vitest";
import { getJobPropertyDisplay } from "./jobPropertyDisplay";

describe("getJobPropertyDisplay", () => {
  it("shows a clear state for unlinked jobs", () => {
    expect(getJobPropertyDisplay({ propertyId: null, propertyLabel: null }))
      .toEqual({ label: "No property linked", address: null });
  });

  it("does not expose a property when its details are unavailable", () => {
    expect(getJobPropertyDisplay({ propertyId: 12, propertyLabel: null }))
      .toEqual({ label: "Property details unavailable", address: null });
  });

  it("shows the saved Aerial Quote label and any available address parts", () => {
    expect(getJobPropertyDisplay({
      propertyId: 12,
      propertyLabel: "Main House",
      propertyStreet: "123 Oak St",
      propertyCity: "Owensboro",
      propertyState: "KY",
      propertyZip: "42301",
    })).toEqual({
      label: "Main House",
      address: "123 Oak St, Owensboro, KY, 42301",
    });
  });

  it("handles a linked property without a saved address", () => {
    expect(getJobPropertyDisplay({ propertyId: 12, propertyLabel: "Main House" }))
      .toEqual({ label: "Main House", address: null });
  });
});
