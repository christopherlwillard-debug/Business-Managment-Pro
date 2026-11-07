interface HiddenBidCandidate {
  stage: string;
  source: string;
  opportunityType?: string | null;
  notes?: string | null;
}

/** A notice identifier is unique only within its originating source. */
export function unifiedBidIdentity(record: { source?: string | null; noticeId: string }): string {
  return `${(record.source ?? "").trim().toLowerCase()}|${record.noticeId.trim().toLowerCase()}`;
}

export function selectUnifiedCandidateGroup<T extends HiddenBidCandidate>(
  group: T[],
  includeHidden: boolean,
): T[] {
  if (!includeHidden) return group;
  return group.filter((row) =>
    (row.stage === "score_rejected" || row.stage === "no_bid")
    && row.source !== "usa-spending"
    && row.opportunityType !== "award_intelligence"
  );
}

export function buildBidFilterReason(row: HiddenBidCandidate): string | null {
  if (row.stage === "score_rejected") {
    return row.notes ?? "Below the relevance threshold";
  }
  if (row.stage === "no_bid") return "Marked No Bid";
  return null;
}