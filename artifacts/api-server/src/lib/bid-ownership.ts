import { and, eq, isNull, sql } from "drizzle-orm";
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
  const marker = "Quarantined: missing business ownership; requires manual review.";
  const rows = await db
    .update(bidOpportunitiesTable)
    .set({
      status: "quarantined",
      stage: "no_bid",
      notes: sql<string>`CASE
        WHEN COALESCE(${bidOpportunitiesTable.notes}, '') LIKE ${`%${marker}%`}
          THEN ${bidOpportunitiesTable.notes}
        WHEN ${bidOpportunitiesTable.notes} IS NULL OR ${bidOpportunitiesTable.notes} = ''
          THEN ${marker}
        ELSE ${bidOpportunitiesTable.notes} || E'\\n' || ${marker}
      END`,
    })
    .where(isNull(bidOpportunitiesTable.businessId))
    .returning({ id: bidOpportunitiesTable.id });

  return rows.length;
}
