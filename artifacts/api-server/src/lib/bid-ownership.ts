import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, bidOpportunitiesTable, businessesTable } from "@workspace/db";
import { classifyOpportunityScope, isScopeCompatibleWithBusiness } from "./bidScopeClassifier.js";

export async function getExistingBusiness(businessId: number) {
  const [business] = await db
    .select({ id: businessesTable.id, type: businessesTable.type, name: businessesTable.name })
    .from(businessesTable)
    .where(eq(businessesTable.id, businessId))
    .limit(1);
  return business ?? null;
}

/**
 * Legacy bid rows may have no owner because the original schema allowed it.
 * Keep those rows for recovery, but make them invisible to normal feeds and
 * clearly mark them instead of guessing which business owns them.
 */
export async function quarantineOrphanBidOpportunities(): Promise<number> {
  const orphans = await db
    .select({
      id: bidOpportunitiesTable.id,
      notes: bidOpportunitiesTable.notes,
    })
    .from(bidOpportunitiesTable)
    .where(isNull(bidOpportunitiesTable.businessId));

  for (const orphan of orphans) {
    const marker = "Quarantined: missing business ownership; requires manual review.";
    const notes = orphan.notes?.includes(marker)
      ? orphan.notes
      : [orphan.notes, marker].filter(Boolean).join("\n");

    await db
      .update(bidOpportunitiesTable)
      .set({ status: "quarantined", stage: "no_bid", notes })
      .where(and(
        eq(bidOpportunitiesTable.id, orphan.id),
        isNull(bidOpportunitiesTable.businessId),
      ));
  }

  return orphans.length;
}

/**
 * Preserve opportunities whose stored business conflicts with a high-confidence
 * scope classification. They remain in the existing hidden-bids recovery panel
 * (stage=no_bid) and can be restored by the owner; never discard source evidence
 * because an automated classifier may be wrong.
 */
export async function quarantineMisclassifiedBidOpportunities(): Promise<number> {
  const candidates = await db
    .select({
      id: bidOpportunitiesTable.id,
      title: bidOpportunitiesTable.title,
      naicsCode: bidOpportunitiesTable.naicsCode,
      source: bidOpportunitiesTable.source,
      notes: bidOpportunitiesTable.notes,
      businessType: businessesTable.type,
    })
    .from(bidOpportunitiesTable)
    .innerJoin(businessesTable, eq(bidOpportunitiesTable.businessId, businessesTable.id))
    .where(inArray(bidOpportunitiesTable.stage, ["new", "no_bid"]));

  let quarantined = 0;
  for (const row of candidates) {
    if (!row.businessType) continue;
    const scope = classifyOpportunityScope(row.title, row.naicsCode, row.source ?? "unknown");
    if (isScopeCompatibleWithBusiness(scope.primaryCategory, scope.confidence, row.businessType)) continue;

    const marker = `Quarantined: scope mismatch (${scope.primaryCategory ?? "unknown"}, ${scope.confidence} confidence) for ${row.businessType}; review before restoring.`;
    const notes = row.notes?.includes(marker)
      ? row.notes
      : [row.notes, marker].filter(Boolean).join("\\n");

    const updated = await db
      .update(bidOpportunitiesTable)
      .set({ status: "quarantined", stage: "no_bid", notes })
      .where(and(
        eq(bidOpportunitiesTable.id, row.id),
        inArray(bidOpportunitiesTable.stage, ["new", "no_bid"]),
      ))
      .returning({ id: bidOpportunitiesTable.id });
    quarantined += updated.length;
  }

  return quarantined;
}
