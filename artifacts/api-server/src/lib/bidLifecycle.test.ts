import { describe, expect, it } from "vitest";
import { getBidLifecycleState, legacyStageForBidStatus, isActionableBid, isAwardIntelligence, isDefaultActiveBid, isExpiredDeadline, legacyStatusForBidStage, mergeBidSourceFields, normalizedBidIdentity, shouldPruneScopeMismatch, shouldRejectNewBid, shouldRestoreScoreRejectedBid } from "./bidLifecycle.js";

describe("bid lifecycle boundary", () => {
  it("keeps legacy status-only updates aligned with pipeline stages", () => {
    expect(legacyStageForBidStatus("new")).toBe("new");
    expect(legacyStageForBidStatus("interested")).toBe("reviewing");
    expect(legacyStageForBidStatus("dismissed")).toBe("no_bid");
    expect(legacyStageForBidStatus("unknown")).toBeNull();
  });

  it("keeps legacy status aligned across every pipeline stage", () => {
    expect(legacyStatusForBidStage("new")).toBe("new");
    for (const stage of ["reviewing", "bidding", "submitted"]) {
      expect(legacyStatusForBidStage(stage)).toBe("interested");
    }
    for (const stage of ["won", "lost", "no_bid"]) {
      expect(legacyStatusForBidStage(stage)).toBe("dismissed");
    }
  });

  it("keeps USA Spending awards out of actionable work", () => {
    const award = { source: "usa-spending", opportunityType: "award_intelligence" };
    expect(isAwardIntelligence(award)).toBe(true);
    expect(isActionableBid(award)).toBe(false);
  });

  it("recognizes legacy rows by opportunity type too", () => {
    expect(isActionableBid({ source: "federal", opportunityType: "award_intelligence" })).toBe(false);
  });

  it("refreshes amended solicitation fields while retaining values omitted by a portal", () => {
    const existing = {
      title: "Old title",
      agency: "City",
      naicsCode: "238330",
      description: "Existing full description",
      postedDate: "2026-10-01",
      responseDeadline: "2026-11-20",
      url: "https://agency.gov/old.pdf",
      noticeType: "solicitation",
      setAsideType: "SBA",
    };
    const merged = mergeBidSourceFields(existing, {
      title: "Amended title",
      responseDeadline: "2026-11-27",
      url: "https://agency.gov/amendment-1.pdf",
      description: null,
      naicsCode: "",
    });
    expect(merged.title).toBe("Amended title");
    expect(merged.responseDeadline).toBe("2026-11-27");
    expect(merged.url).toBe("https://agency.gov/amendment-1.pdf");
    expect(merged.description).toBe("Existing full description");
    expect(merged.naicsCode).toBe("238330");
    expect(merged.agency).toBe("City");
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

  it("never auto-prunes a user-marked no-bid or other reviewed stage", () => {
    expect(shouldPruneScopeMismatch("new")).toBe(true);
    expect(shouldPruneScopeMismatch("no_bid")).toBe(false);
    expect(shouldPruneScopeMismatch("reviewing")).toBe(false);
    expect(shouldPruneScopeMismatch("bidding")).toBe(false);
    expect(shouldPruneScopeMismatch("submitted")).toBe(false);
    expect(shouldPruneScopeMismatch("won")).toBe(false);
  });

  it("moves only untouched new opportunities below the score floor to recovery", () => {
    expect(shouldRejectNewBid("new", 19, 20)).toBe(true);
    expect(shouldRejectNewBid("new", 20, 20)).toBe(false);
    expect(shouldRejectNewBid("reviewing", 0, 20)).toBe(false);
    expect(shouldRejectNewBid("bidding", 0, 20)).toBe(false);
    expect(shouldRejectNewBid("no_bid", 0, 20)).toBe(false);
  });

  it("restores score-rejected opportunities when an updated profile clears the score floor", () => {
    expect(shouldRestoreScoreRejectedBid("score_rejected", 20, 20)).toBe(true);
    expect(shouldRestoreScoreRejectedBid("score_rejected", 19, 20)).toBe(false);
    expect(shouldRestoreScoreRejectedBid("new", 100, 20)).toBe(false);
  });

  it("deduplicates repeated records by source notice ID", () => {
    expect(normalizedBidIdentity({ source: "federal", noticeId: "  ABC-123 ", title: "Old Title", agency: "City" }))
      .toBe(normalizedBidIdentity({ source: "FEDERAL", noticeId: "abc-123", title: "Updated Title", agency: "Different Agency" }));
  });

  it("preserves recurring solicitations with the same title but different notice IDs", () => {
    expect(normalizedBidIdentity({ source: "federal", noticeId: "ABC-123", title: "Roof Repair", agency: "City" }))
      .not.toBe(normalizedBidIdentity({ source: "federal", noticeId: "ABC-456", title: "Roof Repair", agency: "City" }));
  });

  it("normalizes title and agency only when a source notice ID is unavailable", () => {
    expect(normalizedBidIdentity({ source: "federal", title: "  Roof Repair ", agency: "City" }))
      .toBe(normalizedBidIdentity({ source: "federal", title: "roof repair", agency: " city " }));
  });
});