import { describe, expect, it } from "vitest";
import { calculateBidStats, daysUntilBidDeadline } from "./bidStats";
import type { BidOpportunity } from "./types";

function bid(overrides: Partial<BidOpportunity> = {}): BidOpportunity {
  return {
    id: 1, noticeId: "N-1", title: "Test", agency: null, naicsCode: "238330",
    description: null, postedDate: null, responseDeadline: null, url: null,
    status: "new", stage: "new", notes: null, source: "federal",
    sourceLabel: null, aiSummary: null, aiSummaryAt: null, createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("bid dashboard statistics", () => {
  it("counts a date-only deadline as due on the local calendar day", () => {
    const now = new Date(2026, 0, 5, 13, 30);
    expect(daysUntilBidDeadline("2026-01-05", now)).toBe(0);
    expect(daysUntilBidDeadline("2026-01-12", now)).toBe(7);
    expect(daysUntilBidDeadline("2026-01-04", now)).toBe(-1);
  });

  it("excludes expired, historical, rejected, and award-intelligence rows from active counts", () => {
    const now = new Date(2026, 0, 5, 12);
    const stats = calculateBidStats([
      bid({ id: 1 }),
      bid({ id: 2, stage: "won" }),
      bid({ id: 3, stage: "lost" }),
      bid({ id: 4, stage: "no_bid" }),
      bid({ id: 5, stage: "score_rejected" }),
      bid({ id: 6, responseDeadline: "2026-01-04" }),
      bid({ id: 7, source: "usa-spending", opportunityType: "award_intelligence" }),
    ], ["238330"], now);
    expect(stats.activeBids).toBe(1);
    expect(stats.naicsMatchCount).toBe(1);
  });

  it("excludes legacy dismissed records even when their stage was not updated", () => {
    const stats = calculateBidStats([
      bid({ id: 1, status: "dismissed", stage: "new" }),
      bid({ id: 2, status: "interested", stage: "reviewing" }),
    ], [], new Date(2026, 0, 5, 12));
    expect(stats.activeBids).toBe(1);
  });

  it("does not label a veteran evaluation preference as SDVOSB eligibility", () => {
    const stats = calculateBidStats([
      bid({ aiSummary: { veteranPreference: true, setAsideType: "veteran_preference" } }),
      bid({ id: 2, aiSummary: { setAsideType: "sdvosb" } }),
      bid({ id: 3, aiSummary: { setAsideType: "vosb" } }),
    ], [], new Date(2026, 0, 5, 12));
    expect(stats.veteranOpportunities).toBe(3);
  });

  it("recognizes raw SAM.gov veteran set-aside codes before AI analysis", () => {
    const stats = calculateBidStats([
      bid({ setAsideType: "SDVOSB" }),
      bid({ id: 2, setAsideType: "VOSB" }),
      bid({ id: 3, setAsideType: "SBA" }),
    ], [], new Date(2026, 0, 5, 12));
    expect(stats.veteranOpportunities).toBe(2);
  });

  it("counts bidding only for current opportunities and calculates win rate from completed outcomes", () => {
    const stats = calculateBidStats([
      bid({ stage: "bidding" }),
      bid({ id: 2, stage: "bidding", responseDeadline: "2026-01-04" }),
      bid({ id: 3, stage: "won" }),
      bid({ id: 4, stage: "lost" }),
      bid({ id: 5, stage: "submitted" }),
    ], [], new Date(2026, 0, 5, 12));
    expect(stats.bidding).toBe(1);
    expect(stats.submitted).toBe(1);
    expect(stats.winRate).toBe(50);
  });
});
