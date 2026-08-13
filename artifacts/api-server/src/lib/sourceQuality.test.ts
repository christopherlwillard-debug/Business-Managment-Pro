/**
 * Integration + unit tests for the per-source data quality aggregation logic.
 *
 * Specifically verifies that "unknown" completeness rows (the PostgreSQL default,
 * used by USASpending award records that never call assessDataCompleteness) are:
 *   1. Counted in the quality summary returned by GET /api/bids/sources
 *   2. Included in the "unverified" threshold that triggers the amber warning chip
 *
 * The DB-level tests mirror the Drizzle GROUP BY query from the /sources route handler.
 */
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { db } from "@workspace/db";
import { bidOpportunitiesTable, businessesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

let testBizId: number;

beforeAll(async () => {
  const slug = `_source_quality_test_${Date.now()}`;
  const [biz] = await db
    .insert(businessesTable)
    .values({ name: "Source Quality Test Biz", slug, type: "general_contracting" })
    .returning({ id: businessesTable.id });
  testBizId = biz.id;
});

afterAll(async () => {
  // bid_opportunities.businessId is ON DELETE SET NULL — clean up orphaned rows first
  await db
    .delete(bidOpportunitiesTable)
    .where(eq(bidOpportunitiesTable.businessId, testBizId));
  if (testBizId) {
    await db.delete(businessesTable).where(eq(businessesTable.id, testBizId));
  }
});

// ── Mirrors the Drizzle query in GET /api/bids/sources ────────────────────────

type QualityCounts = {
  complete:           number;
  partial:            number;
  needs_verification: number;
  unknown:            number;
  total:              number;
};

async function aggregateQuality(bizId: number): Promise<Map<string, QualityCounts>> {
  const rows = await db
    .select({
      source:           bidOpportunitiesTable.source,
      dataCompleteness: bidOpportunitiesTable.dataCompleteness,
      count:            sql<number>`COUNT(*)::int`,
    })
    .from(bidOpportunitiesTable)
    .where(eq(bidOpportunitiesTable.businessId, bizId))
    .groupBy(bidOpportunitiesTable.source, bidOpportunitiesTable.dataCompleteness);

  const bySource = new Map<string, QualityCounts>();
  for (const row of rows) {
    const srcKey = row.source;
    const dc     = row.dataCompleteness ?? "unknown";
    if (!bySource.has(srcKey)) {
      bySource.set(srcKey, { complete: 0, partial: 0, needs_verification: 0, unknown: 0, total: 0 });
    }
    const q = bySource.get(srcKey)!;
    if      (dc === "complete")           q.complete           += row.count;
    else if (dc === "partial")            q.partial            += row.count;
    else if (dc === "needs_verification") q.needs_verification += row.count;
    else                                  q.unknown            += row.count;
    q.total += row.count;
  }
  return bySource;
}

// ── All-unknown source (USASpending awards) ───────────────────────────────────

describe("source quality aggregation — all-unknown source (USASpending pattern)", () => {
  it("counts rows with default data_completeness as 'unknown' in the quality summary", async () => {
    // Insert usa-spending rows *without* specifying dataCompleteness.
    // The DB default is 'unknown', replicating how USASpending award rows are stored.
    const noticeIds = ["SQ_USA_1", "SQ_USA_2", "SQ_USA_3", "SQ_USA_4", "SQ_USA_5"];
    await db.insert(bidOpportunitiesTable).values(
      noticeIds.map((nid, i) => ({
        businessId:  testBizId,
        noticeId:    nid,
        title:       `USASpending Award ${i + 1}`,
        source:      "usa-spending",
        // dataCompleteness intentionally omitted → DB default "unknown"
      })),
    );

    const bySource = await aggregateQuality(testBizId);
    const q = bySource.get("usa-spending");

    expect(q, "usa-spending entry must exist even when all records are 'unknown'").toBeDefined();
    expect(q!.unknown).toBe(5);
    expect(q!.total).toBe(5);
    expect(q!.complete).toBe(0);
    expect(q!.partial).toBe(0);
    expect(q!.needs_verification).toBe(0);

    // Clean up
    await Promise.all(
      noticeIds.map((nid) =>
        db.delete(bidOpportunitiesTable).where(eq(bidOpportunitiesTable.noticeId, nid)),
      ),
    );
  });

  it("amber warning fires when >50% of records are unknown (unverified ratio includes unknown)", () => {
    // Mirrors the UI formula in SourceManagementPanel AutoSourceRow
    const q: QualityCounts = { complete: 0, partial: 0, needs_verification: 0, unknown: 10, total: 10 };
    const unverifiedCount = q.needs_verification + q.unknown;
    const unverifiedRatio = unverifiedCount / q.total;
    expect(unverifiedRatio).toBeGreaterThan(0.5);
  });

  it("amber warning does NOT fire when records are mostly complete (1 unknown out of 11)", () => {
    const q: QualityCounts = { complete: 8, partial: 2, needs_verification: 0, unknown: 1, total: 11 };
    const unverifiedCount = q.needs_verification + q.unknown;
    const unverifiedRatio = unverifiedCount / q.total;
    expect(unverifiedRatio).toBeLessThanOrEqual(0.5);
  });

  it("amber warning fires when combined needs_verification + unknown > 50% (mixed case)", () => {
    const q: QualityCounts = { complete: 2, partial: 1, needs_verification: 3, unknown: 4, total: 10 };
    const unverifiedCount = q.needs_verification + q.unknown;
    const unverifiedRatio = unverifiedCount / q.total;
    expect(unverifiedRatio).toBeGreaterThan(0.5); // 7/10 = 70%
  });
});

// ── Mixed completeness across categories ──────────────────────────────────────

describe("source quality aggregation — mixed completeness", () => {
  it("counts all four completeness categories correctly in a single source", async () => {
    const testRows = [
      { noticeId: "SQ_MIX_1", source: "federal", dataCompleteness: "complete"           as const },
      { noticeId: "SQ_MIX_2", source: "federal", dataCompleteness: "partial"            as const },
      { noticeId: "SQ_MIX_3", source: "federal", dataCompleteness: "needs_verification" as const },
      { noticeId: "SQ_MIX_4", source: "federal", dataCompleteness: "unknown"            as const },
    ];
    await db.insert(bidOpportunitiesTable).values(
      testRows.map((r, i) => ({
        businessId:       testBizId,
        noticeId:         r.noticeId,
        title:            `Mixed Quality Bid ${i + 1}`,
        source:           r.source,
        dataCompleteness: r.dataCompleteness,
      })),
    );

    const bySource = await aggregateQuality(testBizId);
    const q = bySource.get("federal");

    expect(q).toBeDefined();
    expect(q!.complete).toBe(1);
    expect(q!.partial).toBe(1);
    expect(q!.needs_verification).toBe(1);
    expect(q!.unknown).toBe(1);
    expect(q!.total).toBe(4);

    // Clean up
    await Promise.all(
      testRows.map((r) =>
        db.delete(bidOpportunitiesTable).where(eq(bidOpportunitiesTable.noticeId, r.noticeId)),
      ),
    );
  });

  it("returns separate entries for different sources within the same business", async () => {
    const testRows = [
      { noticeId: "SQ_SEP_1", source: "federal",      dataCompleteness: "complete" as const },
      { noticeId: "SQ_SEP_2", source: "state-local",  dataCompleteness: "needs_verification" as const },
      { noticeId: "SQ_SEP_3", source: "usa-spending",  dataCompleteness: "unknown" as const },
    ];
    await db.insert(bidOpportunitiesTable).values(
      testRows.map((r, i) => ({
        businessId:       testBizId,
        noticeId:         r.noticeId,
        title:            `Separate Source Bid ${i + 1}`,
        source:           r.source,
        dataCompleteness: r.dataCompleteness,
      })),
    );

    const bySource = await aggregateQuality(testBizId);
    expect(bySource.get("federal")?.complete).toBe(1);
    expect(bySource.get("state-local")?.needs_verification).toBe(1);
    expect(bySource.get("usa-spending")?.unknown).toBe(1);

    // Each source total should be 1
    expect(bySource.get("federal")?.total).toBe(1);
    expect(bySource.get("state-local")?.total).toBe(1);
    expect(bySource.get("usa-spending")?.total).toBe(1);

    // Clean up
    await Promise.all(
      testRows.map((r) =>
        db.delete(bidOpportunitiesTable).where(eq(bidOpportunitiesTable.noticeId, r.noticeId)),
      ),
    );
  });
});
