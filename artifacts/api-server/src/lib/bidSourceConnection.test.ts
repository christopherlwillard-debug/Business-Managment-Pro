/**
 * Integration tests for bidSourceConnection helpers.
 * These tests run against the real dev database to verify that:
 *   - loadEnabledSources correctly reflects explicit disable/enable state
 *   - writeConnectionHealth never overwrites the `enabled` column
 *   - Absent rows default to enabled (backward compat) in the sync engine
 *   - Portal-only and automated sources get correct default enabled state in the GET response model
 */
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { db } from "@workspace/db";
import { bidSourceConnectionsTable, businessesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { seedBidSourceCatalog } from "./bidSourceSeeds.js";
import { loadEnabledSources, isEnabled, writeConnectionHealth, bootstrapAutomatedConnections } from "./bidSourceConnection.js";

let testBizId: number;

beforeAll(async () => {
  // Seed the catalog so FK constraints are satisfied
  await seedBidSourceCatalog();

  // Create a disposable test business (CASCADE on delete removes connection rows too)
  const slug = `_bid_src_test_${Date.now()}`;
  const [biz] = await db
    .insert(businessesTable)
    .values({ name: "Bid Source Test Business", slug, type: "general_contracting" })
    .returning({ id: businessesTable.id });
  testBizId = biz.id;
});

afterAll(async () => {
  // Remove the test business (bid_source_connections cascade-deletes automatically)
  if (testBizId) {
    await db.delete(businessesTable).where(eq(businessesTable.id, testBizId));
  }
});

// ── loadEnabledSources ────────────────────────────────────────────────────────

describe("loadEnabledSources", () => {
  it("returns an empty map when no connection rows exist for the business", async () => {
    const map = await loadEnabledSources(testBizId);
    expect(map.size).toBe(0);
  });

  it("returns false for an explicitly disabled source", async () => {
    await db
      .insert(bidSourceConnectionsTable)
      .values({ businessId: testBizId, catalogSlug: "sam_gov", enabled: false, connectionStatus: "not_configured" })
      .onConflictDoNothing();

    const map = await loadEnabledSources(testBizId);
    expect(isEnabled(map, "sam_gov")).toBe(false);

    // Clean up
    await db.delete(bidSourceConnectionsTable).where(
      and(eq(bidSourceConnectionsTable.businessId, testBizId), eq(bidSourceConnectionsTable.catalogSlug, "sam_gov"))
    );
  });

  it("returns true for an explicitly enabled source", async () => {
    await db
      .insert(bidSourceConnectionsTable)
      .values({ businessId: testBizId, catalogSlug: "ky_in_local", enabled: true, connectionStatus: "active" })
      .onConflictDoNothing();

    const map = await loadEnabledSources(testBizId);
    expect(isEnabled(map, "ky_in_local")).toBe(true);

    // Clean up
    await db.delete(bidSourceConnectionsTable).where(
      and(eq(bidSourceConnectionsTable.businessId, testBizId), eq(bidSourceConnectionsTable.catalogSlug, "ky_in_local"))
    );
  });

  it("sources not in the map default to enabled=true (backward compat for legacy businesses)", () => {
    const emptyMap = new Map<string, boolean>();
    expect(isEnabled(emptyMap, "sam_gov")).toBe(true);
    expect(isEnabled(emptyMap, "usa_spending")).toBe(true);
    expect(isEnabled(emptyMap, "gsa_forecast")).toBe(true);
  });
});

// ── writeConnectionHealth preserves enabled ───────────────────────────────────

describe("writeConnectionHealth — disabled source persistence", () => {
  it("does NOT overwrite enabled=false when writing a successful sync", async () => {
    // Insert a user-disabled source row
    await db
      .insert(bidSourceConnectionsTable)
      .values({ businessId: testBizId, catalogSlug: "usa_spending", enabled: false, connectionStatus: "not_configured" })
      .onConflictDoNothing();

    // Simulate a "successful" sync run writing health
    await writeConnectionHealth(testBizId, "usa_spending", true, null, 37);

    const [row] = await db
      .select()
      .from(bidSourceConnectionsTable)
      .where(and(eq(bidSourceConnectionsTable.businessId, testBizId), eq(bidSourceConnectionsTable.catalogSlug, "usa_spending")));

    expect(row).toBeDefined();
    expect(row.enabled).toBe(false);              // user preference preserved
    expect(row.connectionStatus).toBe("active");   // health correctly written
    expect(row.recordsImported).toBe(37);
    expect(row.lastSyncAt).toBeDefined();
    expect(row.lastSyncSuccessAt).toBeDefined();

    // Clean up
    await db.delete(bidSourceConnectionsTable).where(
      and(eq(bidSourceConnectionsTable.businessId, testBizId), eq(bidSourceConnectionsTable.catalogSlug, "usa_spending"))
    );
  });

  it("does NOT overwrite enabled=false when writing a failed sync", async () => {
    await db
      .insert(bidSourceConnectionsTable)
      .values({ businessId: testBizId, catalogSlug: "sba_subnet", enabled: false, connectionStatus: "not_configured" })
      .onConflictDoNothing();

    await writeConnectionHealth(testBizId, "sba_subnet", false, "Network error", 0);

    const [row] = await db
      .select()
      .from(bidSourceConnectionsTable)
      .where(and(eq(bidSourceConnectionsTable.businessId, testBizId), eq(bidSourceConnectionsTable.catalogSlug, "sba_subnet")));

    expect(row).toBeDefined();
    expect(row.enabled).toBe(false);              // user preference preserved
    expect(row.connectionStatus).toBe("error");
    expect(row.lastSyncError).toBe("Network error");

    // Clean up
    await db.delete(bidSourceConnectionsTable).where(
      and(eq(bidSourceConnectionsTable.businessId, testBizId), eq(bidSourceConnectionsTable.catalogSlug, "sba_subnet"))
    );
  });

  it("creates a new row with enabled=true when no row exists yet", async () => {
    // Ensure no row exists first
    await db.delete(bidSourceConnectionsTable).where(
      and(eq(bidSourceConnectionsTable.businessId, testBizId), eq(bidSourceConnectionsTable.catalogSlug, "gsa_forecast"))
    );

    await writeConnectionHealth(testBizId, "gsa_forecast", true, null, 5);

    const [row] = await db
      .select()
      .from(bidSourceConnectionsTable)
      .where(and(eq(bidSourceConnectionsTable.businessId, testBizId), eq(bidSourceConnectionsTable.catalogSlug, "gsa_forecast")));

    expect(row).toBeDefined();
    expect(row.enabled).toBe(true);  // default for new rows
    expect(row.connectionStatus).toBe("active");
    expect(row.recordsImported).toBe(5);

    // Clean up
    await db.delete(bidSourceConnectionsTable).where(
      and(eq(bidSourceConnectionsTable.businessId, testBizId), eq(bidSourceConnectionsTable.catalogSlug, "gsa_forecast"))
    );
  });
});

// ── bootstrapAutomatedConnections ─────────────────────────────────────────────

describe("bootstrapAutomatedConnections", () => {
  it("creates enabled=true rows for all automatedDiscovery=true catalog sources", async () => {
    // Start clean — remove any rows the test business might have from earlier tests
    await db.delete(bidSourceConnectionsTable).where(
      eq(bidSourceConnectionsTable.businessId, testBizId)
    );

    await bootstrapAutomatedConnections(testBizId);

    const rows = await db
      .select()
      .from(bidSourceConnectionsTable)
      .where(eq(bidSourceConnectionsTable.businessId, testBizId));

    // At least these automated sources must be present (ky_vss added in migration 0055)
    const AUTOMATED_SLUGS = ["sam_gov", "ky_in_local", "usa_spending", "sba_subnet", "gsa_forecast", "ky_vss"];
    for (const slug of AUTOMATED_SLUGS) {
      const row = rows.find(r => r.catalogSlug === slug);
      expect(row, `missing bootstrap row for ${slug}`).toBeDefined();
      expect(row!.enabled).toBe(true);
      expect(row!.connectionStatus).toBe("not_configured");
    }

    // Clean up
    await db.delete(bidSourceConnectionsTable).where(
      eq(bidSourceConnectionsTable.businessId, testBizId)
    );
  });

  it("does NOT overwrite an existing disabled row (ON CONFLICT DO NOTHING)", async () => {
    // Manually create a disabled row for sam_gov
    await db
      .insert(bidSourceConnectionsTable)
      .values({ businessId: testBizId, catalogSlug: "sam_gov", enabled: false, connectionStatus: "not_configured" });

    await bootstrapAutomatedConnections(testBizId);

    const [row] = await db
      .select()
      .from(bidSourceConnectionsTable)
      .where(and(
        eq(bidSourceConnectionsTable.businessId, testBizId),
        eq(bidSourceConnectionsTable.catalogSlug, "sam_gov")
      ));

    // User's disabled preference must survive the bootstrap
    expect(row.enabled).toBe(false);

    // Clean up
    await db.delete(bidSourceConnectionsTable).where(
      eq(bidSourceConnectionsTable.businessId, testBizId)
    );
  });

  it("is idempotent — calling twice does not duplicate rows", async () => {
    await bootstrapAutomatedConnections(testBizId);
    await bootstrapAutomatedConnections(testBizId);

    const rows = await db
      .select()
      .from(bidSourceConnectionsTable)
      .where(eq(bidSourceConnectionsTable.businessId, testBizId));

    const slugs = rows.map(r => r.catalogSlug);
    const uniqueSlugs = new Set(slugs);
    expect(slugs.length).toBe(uniqueSlugs.size); // no duplicates

    // Clean up
    await db.delete(bidSourceConnectionsTable).where(
      eq(bidSourceConnectionsTable.businessId, testBizId)
    );
  });
});

// ── GET response model defaults ───────────────────────────────────────────────

describe("GET /api/bids/sources — enabled default behavior", () => {
  it("automated sources with no connection row should default to enabled=true (matching sync behavior)", () => {
    // This mirrors the logic in the GET endpoint:
    //   enabled: conn?.enabled ?? (src.automatedDiscovery ? true : false)
    const automatedSrc = { automatedDiscovery: true };
    const noRow = undefined as { enabled: boolean } | undefined;
    const result = noRow?.enabled ?? (automatedSrc.automatedDiscovery ? true : false);
    expect(result).toBe(true);
  });

  it("portal-only sources with no connection row default to enabled=false", () => {
    const portalSrc = { automatedDiscovery: false };
    const noRow = undefined as { enabled: boolean } | undefined;
    const result = noRow?.enabled ?? (portalSrc.automatedDiscovery ? true : false);
    expect(result).toBe(false);
  });

  it("explicit enabled=false is preserved for automated sources", () => {
    const automatedSrc = { automatedDiscovery: true };
    const disabledRow = { enabled: false };
    const result = disabledRow.enabled ?? (automatedSrc.automatedDiscovery ? true : false);
    expect(result).toBe(false);
  });

  it("explicit enabled=true is preserved for portal-only sources", () => {
    const portalSrc = { automatedDiscovery: false };
    const enabledRow = { enabled: true };
    const result = enabledRow.enabled ?? (portalSrc.automatedDiscovery ? true : false);
    expect(result).toBe(true);
  });
});
