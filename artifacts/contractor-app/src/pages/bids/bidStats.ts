import type { BidOpportunity } from "./types";
import { getNaicsMatch } from "./types";

export interface BidStats {
  activeBids: number;
  veteranOpportunities: number;
  dueThisWeek: number;
  bidding: number;
  submitted: number;
  won: number;
  lost: number;
  winRate: number | null;
  naicsMatchCount: number;
}

/** Treat YYYY-MM-DD as a local calendar date, not UTC midnight. */
export function daysUntilBidDeadline(dateStr: string | null, now = new Date()): number | null {
  if (!dateStr) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  const due = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(dateStr);
  if (Number.isNaN(due.getTime())) return null;

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

function isCurrentOpportunity(bid: BidOpportunity, now: Date): boolean {
  if (bid.source === "usa-spending" || bid.opportunityType === "award_intelligence") return false;
  if (bid.status === "dismissed" || ["won", "lost", "no_bid", "score_rejected"].includes(bid.stage)) return false;
  if (bid.lifecycleState === "expired" || bid.lifecycleState === "historical") return false;
  const days = daysUntilBidDeadline(bid.responseDeadline, now);
  return days === null || days >= 0;
}

export function calculateBidStats(
  bids: BidOpportunity[],
  primaryNaicsCodes: string[] = [],
  now = new Date(),
): BidStats {
  const active = bids.filter((bid) => isCurrentOpportunity(bid, now));
  const veteranOpportunities = active.filter((bid) => {
    const rawCode = bid.setAsideType?.trim().toUpperCase();
    const rawVeteranSetAside = rawCode === "SDVOSB" || rawCode === "VOSB" || rawCode === "VSBAOP"
      || rawCode === "VOB" || rawCode === "VETS" || rawCode === "VP";
    const analyzedType = bid.aiSummary?.setAsideType;
    return rawVeteranSetAside
      || analyzedType === "sdvosb"
      || analyzedType === "vosb"
      || analyzedType === "veteran_preference"
      || bid.aiSummary?.veteranPreference === true;
  }).length;
  const won = bids.filter((bid) => bid.stage === "won").length;
  const lost = bids.filter((bid) => bid.stage === "lost").length;
  const completed = won + lost;

  return {
    activeBids: active.length,
    veteranOpportunities,
    dueThisWeek: active.filter((bid) => {
      const days = daysUntilBidDeadline(bid.responseDeadline, now);
      return days !== null && days <= 7;
    }).length,
    bidding: active.filter((bid) => bid.stage === "bidding").length,
    submitted: bids.filter((bid) => bid.stage === "submitted").length,
    won,
    lost,
    winRate: completed > 0 ? Math.round((won / completed) * 100) : null,
    naicsMatchCount: active.filter((bid) => getNaicsMatch(bid.naicsCode, primaryNaicsCodes) !== "none").length,
  };
}
