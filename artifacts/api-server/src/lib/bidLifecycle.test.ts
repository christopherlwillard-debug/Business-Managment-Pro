import { describe, expect, it } from "vitest";
import { getBidLifecycleState, isActionableBid, isAwardIntelligence, isDefaultActiveBid, isExpiredDeadline, normalizedBidIdentity } from "./bidLifecycle.js";

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

  it("classifies expired opportunities without deleting them", () => {
    expect(isExpiredDeadline("2026-08-20", new Date("2026-08-24T12:00:00Z"))).toBe(true);
    expect(isExpiredDeadline("2026-08-24", new Date("2026-08-24T12:00:00Z"))).toBe(false);
    expect(getBidLifecycleState({
      stage: "new", responseDeadline: "2026-08-20", dataCompleteness: "complete",
    }, new Date("2026-08-24T12:00:00Z"))).toBe("expired");
  });

  it("separates missing information from active work", () => {
    expect(getBidLifecycleState({ stage: "new", dataCompleteness: "needs_verification" })).toBe("verification_needed");
    expect(getBidLifecycleState({ stage: "new", dataCompleteness: "partial" })).toBe("incomplete");
    expect(isDefaultActiveBid({ stage: "new", dataCompleteness: "partial", opportunityScore: 90 })).toBe(false);
  });

  it("keeps zero-score and completed records out of default active counts", () => {
    expect(isDefaultActiveBid({ stage: "new", dataCompleteness: "complete", opportunityScore: 0 })).toBe(false);
    expect(getBidLifecycleState({ stage: "won", dataCompleteness: "complete" })).toBe("historical");
  });

  it("gives repeated source records the same identity", () => {
    expect(normalizedBidIdentity({ source: "federal", title: "  Roof Repair ", agency: "City" }))
      .toBe(normalizedBidIdentity({ source: "federal", title: "roof repair", agency: " city " }));
  });
});