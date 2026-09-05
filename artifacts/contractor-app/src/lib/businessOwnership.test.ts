import { describe, expect, it } from "vitest";
import { belongsToSelectedBusiness } from "./businessOwnership";

const generalContracting = { id: 1, slug: "general_contracting" };

describe("belongsToSelectedBusiness", () => {
  it("uses canonical business ownership even when legacy text is absent", () => {
    expect(belongsToSelectedBusiness(
      { businessId: 1, businessLine: null },
      generalContracting,
    )).toBe(true);
  });

  it("does not let conflicting legacy text override canonical ownership", () => {
    expect(belongsToSelectedBusiness(
      { businessId: 2, businessLine: "general_contracting" },
      generalContracting,
    )).toBe(false);
  });

  it("keeps the legacy slug fallback only for records not yet backfilled", () => {
    expect(belongsToSelectedBusiness(
      { businessId: null, businessLine: "general_contracting" },
      generalContracting,
    )).toBe(true);
  });
});