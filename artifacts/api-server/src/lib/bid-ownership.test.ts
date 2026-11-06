import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, bidOpportunitiesTable, businessesTable } from "@workspace/db";
import { quarantineMisclassifiedBidOpportunities, quarantineOrphanBidOpportunities } from "./bid-ownership.js";

let orphanId: number;
let orphanNoticeId: string;
let scopedBidId: number;
let scopedBusinessId: number;

beforeAll(async () => {
  orphanNoticeId = `orphan-ownership-test-${Date.now()}`;
  const [row] = await db
    .insert(bidOpportunitiesTable)
    .values({
      businessId: null,
      noticeId: orphanNoticeId,
      title: "Unassigned legacy opportunity",
      notes: "Original review note",
      source: "federal",
    })
    .returning({ id: bidOpportunitiesTable.id });
  orphanId = row.id;

  const [business] = await db
    .insert(businessesTable)
    .values({
      name: "Bid Scope Quarantine Test",
      slug: `bid-scope-quarantine-test-${Date.now()}`,
      type: "general_contracting",
    })
    .returning({ id: businessesTable.id });
  scopedBusinessId = business.id;

  const [scopedBid] = await db
    .insert(bidOpportunitiesTable)
    .values({
      businessId: scopedBusinessId,
      noticeId: `scope-mismatch-test-${Date.now()}`,
      title: "Parking lot asphalt paving project",
      source: "federal",
      stage: "new",
      status: "new",
      notes: "Original opportunity evidence",
    })
    .returning({ id: bidOpportunitiesTable.id });
  scopedBidId = scopedBid.id;
});

afterAll(async () => {
  await db.delete(bidOpportunitiesTable).where(eq(bidOpportunitiesTable.id, orphanId));
  await db.delete(bidOpportunitiesTable).where(eq(bidOpportunitiesTable.id, scopedBidId));
  await db.delete(businessesTable).where(eq(businessesTable.id, scopedBusinessId));
});

describe("bid ownership quarantine", () => {
  it("marks orphan rows without assigning or deleting them", async () => {
    expect(await quarantineOrphanBidOpportunities()).toBeGreaterThanOrEqual(1);

    const [row] = await db
      .select({
        businessId: bidOpportunitiesTable.businessId,
        status: bidOpportunitiesTable.status,
        stage: bidOpportunitiesTable.stage,
        notes: bidOpportunitiesTable.notes,
      })
      .from(bidOpportunitiesTable)
      .where(eq(bidOpportunitiesTable.id, orphanId));

    // The row must remain recoverable even though it has no valid owner.
    expect(row).toMatchObject({
      businessId: null,
      status: "quarantined",
      stage: "no_bid",
    });
    expect(row.notes).toContain("Original review note");
    expect(row.notes).toContain("missing business ownership");
  });
});

describe("bid scope quarantine", () => {
  it("preserves incompatible opportunities with a recoverable quarantine reason", async () => {
    expect(await quarantineMisclassifiedBidOpportunities()).toBeGreaterThanOrEqual(1);

    const [row] = await db
      .select({
        businessId: bidOpportunitiesTable.businessId,
        status: bidOpportunitiesTable.status,
        stage: bidOpportunitiesTable.stage,
        notes: bidOpportunitiesTable.notes,
      })
      .from(bidOpportunitiesTable)
      .where(eq(bidOpportunitiesTable.id, scopedBidId));

    expect(row).toMatchObject({
      businessId: scopedBusinessId,
      status: "quarantined",
      stage: "no_bid",
    });
    expect(row.notes).toContain("Original opportunity evidence");
    expect(row.notes).toContain("scope mismatch");
    expect(row.notes).toContain("asphalt");
  });
});
