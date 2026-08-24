import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, bidOpportunitiesTable, businessesTable } from "@workspace/db";
import { rescoreExistingBids } from "./bidSync.js";

let testBusinessId: number;
let bidIds: number[] = [];

const profile: Parameters<typeof rescoreExistingBids>[1] = {
  naicsCodes: [],
  keywords: [],
  pscCodes: [],
  localKeywords: [],
  negativeKeywords: [],
  description: "",
  capabilities: [],
  searchGroups: [],
  profileStatus: "active",
  isSdvosb: false,
  isVosb: false,
  isSmallBusiness: true,
  label: "General Contracting",
  businessType: "general_contracting",
};

beforeAll(async () => {
  const [business] = await db
    .insert(businessesTable)
    .values({
      name: "Bid Sync Rescore Test Business",
      slug: `_bid_sync_rescore_test_${Date.now()}`,
      type: "general_contracting",
    })
    .returning({ id: businessesTable.id });
  testBusinessId = business.id;

  const inserted = await db
    .insert(bidOpportunitiesTable)
    .values([
      {
        businessId: testBusinessId,
        noticeId: `rescore-suppressed-${Date.now()}`,
        title: "Gym Equipment Supply Contract",
        source: "federal",
        stage: "new",
        status: "new",
        url: "https://example.com/suppressed",
      },
      {
        businessId: testBusinessId,
        noticeId: `rescore-reviewed-${Date.now()}`,
        title: "Gym Equipment Supply Contract — Reviewed",
        source: "federal",
        stage: "reviewing",
        status: "new",
        url: "https://example.com/reviewed",
      },
    ])
    .returning({ id: bidOpportunitiesTable.id });
  bidIds = inserted.map(({ id }) => id);
});

afterAll(async () => {
  if (bidIds.length > 0) {
    await db.delete(bidOpportunitiesTable).where(
      and(...bidIds.map((id) => eq(bidOpportunitiesTable.id, id))),
    );
  }
  if (testBusinessId) {
    await db.delete(businessesTable).where(eq(businessesTable.id, testBusinessId));
  }
});

describe("rescoreExistingBids hard-suppressed cleanup", () => {
  it("dismisses new suppressed bids but protects reviewed bids", async () => {
    await rescoreExistingBids(testBusinessId, profile);

    const rows = await db
      .select({
        id: bidOpportunitiesTable.id,
        stage: bidOpportunitiesTable.stage,
        opportunityScore: bidOpportunitiesTable.opportunityScore,
      })
      .from(bidOpportunitiesTable)
      .where(eq(bidOpportunitiesTable.businessId, testBusinessId));

    const suppressed = rows.find((row) => row.id === bidIds[0]);
    const reviewed = rows.find((row) => row.id === bidIds[1]);
    expect(suppressed).toMatchObject({ stage: "no_bid", opportunityScore: 0 });
    expect(reviewed).toMatchObject({ stage: "reviewing", opportunityScore: 0 });
  });
});