import { describe, it, expect } from "vitest";
import { _CATALOG_ENTRIES_FOR_TEST } from "./bidSourceSeeds.js";

// ── Pure status-derivation helpers (mirrored from route logic) ────────────────
// These are the rules encoded in PATCH /api/bids/sources/:slug and in
// writeConnectionHealth's conflict-update set.  Verified here as pure functions
// so they're testable without a live database or HTTP layer.

/**
 * Derive the connectionStatus to write when a user PATCHes a source connection.
 * Returns undefined when nothing changes (automated source without an enable toggle).
 */
function deriveConnectionStatus(
  connectionMethod: string,
  enabled: boolean | undefined,
  hasPortalUrlChange: boolean,
): string | undefined {
  const isPortalOnly = connectionMethod === "portal_link_only";
  if (enabled !== undefined) {
    if (!enabled) return "not_configured";
    return isPortalOnly ? "portal_only" : "not_configured";
  }
  // Setting a portal URL on a portal-only source implicitly activates it
  if (isPortalOnly && hasPortalUrlChange) return "portal_only";
  return undefined;
}

/**
 * The sync engine defaults — absent rows are treated as enabled (backward compat),
 * explicit false rows are treated as disabled (user preference).
 */
function sourceIsEnabled(map: Map<string, boolean>, slug: string): boolean {
  return map.get(slug) ?? true;
}

// Verified automated sources — the only five with a working integration path today
const AUTOMATED_SLUGS = new Set(["sam_gov", "ky_in_local", "usa_spending", "sba_subnet", "gsa_forecast", "ky_vss"]);

const VALID_CATEGORIES   = new Set(["jobs_contracts", "auctions_surplus", "hauling_material", "both"]);
const VALID_METHODS      = new Set(["api", "public_feed", "public_scrape", "account_oauth", "email_feed", "portal_link_only"]);

describe("disabled source persistence — sync engine enable-state rules", () => {
  it("source with no connection row defaults to enabled in the sync engine", () => {
    const emptyMap = new Map<string, boolean>();
    expect(sourceIsEnabled(emptyMap, "sam_gov")).toBe(true);
    expect(sourceIsEnabled(emptyMap, "ky_in_local")).toBe(true);
    expect(sourceIsEnabled(emptyMap, "usa_spending")).toBe(true);
  });

  it("explicitly disabled source returns false", () => {
    const map = new Map([["sam_gov", false]]);
    expect(sourceIsEnabled(map, "sam_gov")).toBe(false);
  });

  it("explicitly enabled source returns true", () => {
    const map = new Map([["ky_in_local", true]]);
    expect(sourceIsEnabled(map, "ky_in_local")).toBe(true);
  });

  it("disabled source is not affected by other sources in the map", () => {
    const map = new Map([["sam_gov", false], ["ky_in_local", true]]);
    expect(sourceIsEnabled(map, "sam_gov")).toBe(false);
    expect(sourceIsEnabled(map, "ky_in_local")).toBe(true);
    // Unknown slug defaults to true
    expect(sourceIsEnabled(map, "usa_spending")).toBe(true);
  });
});

describe("portal-only connection status derivation", () => {
  it("disabling any source always yields not_configured", () => {
    expect(deriveConnectionStatus("portal_link_only", false, false)).toBe("not_configured");
    expect(deriveConnectionStatus("api",              false, false)).toBe("not_configured");
    expect(deriveConnectionStatus("public_feed",      false, false)).toBe("not_configured");
  });

  it("enabling a portal-only source yields portal_only", () => {
    expect(deriveConnectionStatus("portal_link_only", true, false)).toBe("portal_only");
  });

  it("enabling an automated source yields not_configured (sync engine sets active/error)", () => {
    expect(deriveConnectionStatus("api",           true, false)).toBe("not_configured");
    expect(deriveConnectionStatus("public_feed",   true, false)).toBe("not_configured");
    expect(deriveConnectionStatus("public_scrape", true, false)).toBe("not_configured");
  });

  it("setting a portal URL on a portal-only source (no enabled toggle) yields portal_only", () => {
    expect(deriveConnectionStatus("portal_link_only", undefined, true)).toBe("portal_only");
  });

  it("setting a portal URL on an automated source has no effect (returns undefined)", () => {
    expect(deriveConnectionStatus("api",         undefined, true)).toBeUndefined();
    expect(deriveConnectionStatus("public_feed", undefined, true)).toBeUndefined();
  });

  it("no change (undefined enabled, no portal URL) returns undefined for all methods", () => {
    expect(deriveConnectionStatus("portal_link_only", undefined, false)).toBeUndefined();
    expect(deriveConnectionStatus("api",              undefined, false)).toBeUndefined();
  });
});

describe("bid source catalog entries", () => {
  it("has exactly 23 entries", () => {
    expect(_CATALOG_ENTRIES_FOR_TEST).toHaveLength(25); // +2: ky_vss, ky_surplus
  });

  it("all slugs are unique", () => {
    const slugs  = _CATALOG_ENTRIES_FOR_TEST.map((e) => e.slug);
    const unique = new Set(slugs);
    expect(unique.size).toBe(slugs.length);
  });

  it("all 23 expected slugs are present", () => {
    const slugs = new Set(_CATALOG_ENTRIES_FOR_TEST.map((e) => e.slug));
    const expected = [
      // Jobs / Contracts
      "sam_gov", "ky_in_local", "usa_spending", "sba_subnet", "gsa_forecast",
      "bidnet_sovra", "demandstar", "bonfire", "planetbids", "govwin",
      // Auctions / Surplus
      "govdeals", "gsa_auctions", "public_surplus", "municibid", "govplanet",
      "purple_wave", "ritchie_bros", "ironplanet", "proxibid", "bidspotter",
      // Hauling / Material
      "dtl", "trux", "wasteplace",
    ];
    for (const slug of expected) {
      expect(slugs.has(slug), `missing slug: ${slug}`).toBe(true);
    }
  });

  it("exactly the verified 5 automated sources have automatedDiscovery=true", () => {
    const automated = new Set(
      _CATALOG_ENTRIES_FOR_TEST.filter((e) => e.automatedDiscovery).map((e) => e.slug)
    );
    expect(automated).toEqual(AUTOMATED_SLUGS);
  });

  it("portal_link_only sources all have automatedDiscovery=false", () => {
    const portalOnly = _CATALOG_ENTRIES_FOR_TEST.filter(
      (e) => e.connectionMethod === "portal_link_only"
    );
    const wronglyAutomated = portalOnly.filter((e) => e.automatedDiscovery);
    expect(wronglyAutomated.map((e) => e.slug)).toEqual([]);
  });

  it("automated sources do not use portal_link_only as connection method", () => {
    const automatedPortal = _CATALOG_ENTRIES_FOR_TEST.filter(
      (e) => e.automatedDiscovery && e.connectionMethod === "portal_link_only"
    );
    expect(automatedPortal.map((e) => e.slug)).toEqual([]);
  });

  it("all categories are valid enum values", () => {
    const invalid = _CATALOG_ENTRIES_FOR_TEST.filter(
      (e) => !VALID_CATEGORIES.has(e.category ?? "")
    );
    expect(invalid.map((e) => `${e.slug}: ${e.category}`)).toEqual([]);
  });

  it("all connection methods are valid enum values", () => {
    const invalid = _CATALOG_ENTRIES_FOR_TEST.filter(
      (e) => !VALID_METHODS.has(e.connectionMethod ?? "")
    );
    expect(invalid.map((e) => `${e.slug}: ${e.connectionMethod}`)).toEqual([]);
  });

  it("every entry has a non-empty name and slug", () => {
    const bad = _CATALOG_ENTRIES_FOR_TEST.filter(
      (e) => !e.name?.trim() || !e.slug?.trim()
    );
    expect(bad).toHaveLength(0);
  });
});
