/**
 * Awards are historical intelligence, not actionable work.
 * Keep this predicate centralized so API counts, sync guards, and UI contracts
 * cannot drift apart when another award source is added.
 */
export function isAwardIntelligence(record: {
  source?: string | null;
  opportunityType?: string | null;
}): boolean {
  return record.source === "usa-spending" || record.opportunityType === "award_intelligence";
}

export function isActionableBid(record: {
  source?: string | null;
  opportunityType?: string | null;
}): boolean {
  return !isAwardIntelligence(record);
}

export type BidLifecycleState =
  | "active"
  | "incomplete"
  | "verification_needed"
  | "expired"
  | "historical";

export interface BidLifecycleInput {
  source?: string | null;
  opportunityType?: string | null;
  stage?: string | null;
  responseDeadline?: string | null;
  dataCompleteness?: string | null;
  opportunityScore?: number | null;
}

export function isExpiredDeadline(deadline: string | null | undefined, now = new Date()): boolean {
  if (!deadline) return false;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(deadline)
    ? new Date(`${deadline}T00:00:00`)
    : new Date(deadline);
  if (Number.isNaN(parsed.getTime())) return false;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return parsed.getTime() < today.getTime();
}

export function normalizedBidIdentity(record: {
  source?: string | null;
  noticeId?: string | null;
  title: string;
  agency?: string | null;
}): string {
  const source = (record.source ?? "").trim().toLowerCase();
  const noticeId = record.noticeId?.trim().toLowerCase();
  // A distinct official/source ID is a distinct opportunity even when an agency
  // reuses the same title for recurring procurements.
  if (noticeId) return `${source}|id:${noticeId}`;
  return `${source}|title:${record.title.trim().toLowerCase()}|${(record.agency ?? "").trim().toLowerCase()}`;
}

export function getBidLifecycleState(record: BidLifecycleInput, now = new Date()): BidLifecycleState {
  if (isAwardIntelligence(record) || ["won", "lost", "no_bid", "score_rejected"].includes(record.stage ?? "")) {
    return "historical";
  }
  if (isExpiredDeadline(record.responseDeadline, now)) return "expired";
  if (record.dataCompleteness === "needs_verification") return "verification_needed";
  if (record.dataCompleteness === "partial" || record.dataCompleteness === "unknown" || !record.dataCompleteness) {
    return "incomplete";
  }
  return "active";
}

/** Only untouched new rows may be automatically pruned for a scope mismatch. */
export function shouldPruneScopeMismatch(stage: string | null | undefined): boolean {
  return stage === "new";
}

/** Re-open a previously score-rejected row when an updated profile makes it relevant. */
export function shouldRestoreScoreRejectedBid(
  stage: string | null | undefined,
  score: number,
  minimumScore: number,
): boolean {
  return stage === "score_rejected" && score >= minimumScore;
}

export function isDefaultActiveBid(record: BidLifecycleInput, now = new Date()): boolean {
  return isActionableBid(record)
    && getBidLifecycleState(record, now) === "active"
    && (record.opportunityScore ?? 0) > 0;
}