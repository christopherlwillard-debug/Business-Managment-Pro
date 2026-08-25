import { describe, expect, it } from "vitest";
import { isActionableBid, isAwardIntelligence } from "./bidLifecycle.js";

describe("bid lifecycle boundary", () => {
  it("keeps USA Spending awards out of actionable work", () => {
    const award = { source: "usa-spending", opportunityType: "award_intelligence" };
    expect(isAwardIntelligence(award)).toBe(true);
    expect(isActionableBid(award)).toBe(false);
  });

  it("recognizes legacy rows by opportunity type too", () => {
    expect(isActionableBid({ source: "federal", opportunityType: "award_intelligence" })).toBe(false);
  });

  it("keeps solicitations actionable", () => {
    expect(isAwardIntelligence({ source: "federal", opportunityType: "solicitation" })).toBe(false);
    expect(isActionableBid({ source: "federal", opportunityType: "solicitation" })).toBe(true);
  });
});