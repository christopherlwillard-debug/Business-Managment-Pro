import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, bidOpportunitiesTable } from "@workspace/db";
import { quarantineOrphanBidOpportunities } from "./bid-ownership.js";

let orphanId: number;
let orphanNoticeId: string;

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
  orphanId = row.id;});

afterAll(async () => {
  await db.delete(bidOpportunitiesTable).where(eq(bidOpportunitiesTable.id, orphanId));
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
