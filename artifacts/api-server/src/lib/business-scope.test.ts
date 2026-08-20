import { describe, expect, it } from "vitest";
import { belongsToBusiness } from "./business-scope";

describe("business ownership policy", () => {
  const asphalt = { id: 1, slug: "asphalt_sealing" };
  const contracting = { id: 2, slug: "contracting" };

  it("accepts canonical business IDs", () => {
    expect(belongsToBusiness({ businessId: 1, businessLine: "old-slug" }, asphalt)).toBe(true);
    expect(belongsToBusiness({ businessId: 2, businessLine: "asphalt_sealing" }, asphalt)).toBe(false);
  });

  it("uses the legacy slug only for rows not backfilled yet", () => {
    expect(belongsToBusiness({ businessId: null, businessLine: "contracting" }, contracting)).toBe(true);
    expect(belongsToBusiness({ businessId: null, businessLine: "contracting" }, asphalt)).toBe(false);
  });

  it("preserves the explicit all-businesses view", () => {
    expect(belongsToBusiness({ businessId: 2, businessLine: contracting.slug }, null)).toBe(true);
  });
});