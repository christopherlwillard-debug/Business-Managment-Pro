import { describe, expect, it } from "vitest";
import { buildBidFilterReason, selectUnifiedCandidateGroup, unifiedBidIdentity } from "./bidHiddenFeed.js";

describe("hidden bid recovery feed", () => {
  it("keeps recoverable rows while excluding active bids and award intelligence", () => {
    const rows = [
      { id: 1, stage: "new", source: "federal", opportunityType: "solicitation" },
      { id: 2, stage: "score_rejected", source: "federal", opportunityType: "solicitation" },
      { id: 3, stage: "no_bid", source: "state-local", opportunityType: "solicitation" },
      { id: 4, stage: "no_bid", source: "usa-spending", opportunityType: "award_intelligence" },
    ];

    expect(selectUnifiedCandidateGroup(rows, true).map((row) => row.id)).toEqual([2, 3]);
    expect(selectUnifiedCandidateGroup(rows, false)).toBe(rows);
  });

  it("does not merge equal notice IDs from different procurement sources", () => {
    expect(unifiedBidIdentity({ source: "federal", noticeId: "12345" }))
      .not.toBe(unifiedBidIdentity({ source: "state-local", noticeId: "12345" }));
    expect(unifiedBidIdentity({ source: "federal", noticeId: " ABC " }))
      .toBe(unifiedBidIdentity({ source: "FEDERAL", noticeId: "abc" }));
  });

  it("returns a plain-language reason for each recoverable stage", () => {
    expect(buildBidFilterReason({
      stage: "score_rejected",
      source: "federal",
      notes: "Filtered: score 12 below 20 minimum",
    })).toBe("Filtered: score 12 below 20 minimum");
    expect(buildBidFilterReason({ stage: "no_bid", source: "federal" })).toBe("Marked No Bid");
  });
});