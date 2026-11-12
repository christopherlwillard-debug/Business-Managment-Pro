import { describe, expect, it } from "vitest";
import { getJobOwningBusinessDisplay } from "./jobBusinessDisplay";

const businesses = [
  { id: 1, name: "General Contracting", slug: "general_contracting" },
  { id: 2, name: "Asphalt Sealing", slug: "asphalt_sealing" },
];

describe("getJobOwningBusinessDisplay", () => {
  it("uses the canonical business ID instead of conflicting legacy text", () => {
    expect(getJobOwningBusinessDisplay(
      { businessId: 2, businessLine: "general_contracting" },
      businesses,
    )).toBe("Asphalt Sealing");
  });

  it("marks a legacy business-line match clearly", () => {
    expect(getJobOwningBusinessDisplay(
      { businessId: null, businessLine: "contracting" },
      businesses,
    )).toBe("Legacy · General Contracting");
  });

  it("shows unassigned when no ownership data exists", () => {
    expect(getJobOwningBusinessDisplay({ businessId: null, businessLine: null }, businesses))
      .toBe("Unassigned");
  });

  it("does not use legacy text to replace an unknown canonical ID", () => {
    expect(getJobOwningBusinessDisplay(
      { businessId: 99, businessLine: "general_contracting" },
      businesses,
    )).toBe("Business #99");
  });
});
