import { and, eq, isNull } from "drizzle-orm";
import { db, bidOpportunitiesTable, businessesTable } from "@workspace/db";

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
