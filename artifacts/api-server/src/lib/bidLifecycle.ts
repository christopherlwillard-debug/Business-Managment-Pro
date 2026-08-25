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