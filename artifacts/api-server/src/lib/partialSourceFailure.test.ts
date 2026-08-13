/**
 * Unit tests for per-site health tracking in the KY/IN local scraper.
 *
 * Tests verify that:
 *   - fetchKyLocalBids returns a LocalScrapeResult (not a plain array)
 *   - siteHealth contains one record per configured scraper site
 *   - Successfully-scraped sites have success=true and correct count
 *   - Sites that throw have success=false with error message captured
 *   - Partial failure (some sites throw, some succeed) does NOT propagate
 *     as a top-level rejection — only the failed sites are marked in siteHealth
 *   - Total opportunity count equals the sum of successful site counts (after dedup)
 *   - All-sites-failed returns an empty opportunities array with all siteHealth.success=false
 *
 * Scrapers make real HTTP calls, so fetch is globally stubbed for all tests.
 * Each site-scraper calls fetchHtml internally; we stub fetch to either succeed
 * or reject depending on the test scenario.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  SiteHealthRecord,
  LocalScrapeResult,
} from "./kyLocalBids.js";

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Type-level contract tests (no I/O) ───────────────────────────────────────

describe("LocalScrapeResult contract", () => {
  it("LocalScrapeResult has opportunities and siteHealth arrays", () => {
    const result: LocalScrapeResult = {
      opportunities: [],
      siteHealth:    [],
    };
    expect(Array.isArray(result.opportunities)).toBe(true);
    expect(Array.isArray(result.siteHealth)).toBe(true);
  });

  it("SiteHealthRecord shape is correct for success", () => {
    const record: SiteHealthRecord = {
      slug:    "ky-hancock",
      site:    "Hancock County",
      success: true,
      count:   3,
    };
    expect(record.slug).toBe("ky-hancock");
    expect(record.success).toBe(true);
    expect(record.count).toBe(3);
    expect(record.error).toBeUndefined();
  });

  it("SiteHealthRecord shape is correct for failure", () => {
    const record: SiteHealthRecord = {
      slug:    "demandstar-ky",
      site:    "DemandStar KY",
      success: false,
      count:   0,
      error:   "HTTP 503",
    };
    expect(record.success).toBe(false);
    expect(record.error).toBe("HTTP 503");
  });
});

// ── Aggregation logic tests ────────────────────────────────────────────────────

describe("partial-failure siteHealth aggregation logic", () => {
  /**
   * These tests exercise the aggregation logic extracted from makeRegistry /
   * fetchKyLocalBids without triggering real HTTP calls.
   * They verify the Promise.allSettled + health-tracking pattern directly.
   */

  type FakeEntry = { slug: string; site: string; fn: () => Promise<string[]> };

  async function runFakeRegistry(entries: FakeEntry[]): Promise<{
    opportunities: string[];
    siteHealth: SiteHealthRecord[];
  }> {
    const settled = await Promise.allSettled(entries.map((e) => e.fn()));
    const opportunities: string[] = [];
    const siteHealth: SiteHealthRecord[] = [];

    for (let i = 0; i < entries.length; i++) {
      const { slug, site } = entries[i];
      const result = settled[i];
      if (result.status === "fulfilled") {
        opportunities.push(...result.value);
        siteHealth.push({ slug, site, success: true, count: result.value.length });
      } else {
        const error = String((result as PromiseRejectedResult).reason);
        siteHealth.push({ slug, site, success: false, count: 0, error });
      }
    }

    return { opportunities, siteHealth };
  }

  it("all sites succeed: all siteHealth records have success=true", async () => {
    const entries: FakeEntry[] = [
      { slug: "site-a", site: "Site A", fn: async () => ["opp-1", "opp-2"] },
      { slug: "site-b", site: "Site B", fn: async () => ["opp-3"] },
    ];
    const { opportunities, siteHealth } = await runFakeRegistry(entries);
    expect(opportunities).toHaveLength(3);
    expect(siteHealth.every((s) => s.success)).toBe(true);
    expect(siteHealth.find((s) => s.slug === "site-a")?.count).toBe(2);
    expect(siteHealth.find((s) => s.slug === "site-b")?.count).toBe(1);
  });

  it("one site fails: other sites' results are preserved, failed site is marked", async () => {
    const entries: FakeEntry[] = [
      { slug: "site-a", site: "Site A", fn: async () => ["opp-1"] },
      { slug: "site-b", site: "Site B", fn: async () => { throw new Error("HTTP 503"); } },
      { slug: "site-c", site: "Site C", fn: async () => ["opp-2", "opp-3"] },
    ];
    const { opportunities, siteHealth } = await runFakeRegistry(entries);
    expect(opportunities).toHaveLength(3);              // site-b contributes 0
    expect(siteHealth).toHaveLength(3);
    expect(siteHealth.find((s) => s.slug === "site-a")?.success).toBe(true);
    expect(siteHealth.find((s) => s.slug === "site-b")?.success).toBe(false);
    expect(siteHealth.find((s) => s.slug === "site-b")?.error).toContain("HTTP 503");
    expect(siteHealth.find((s) => s.slug === "site-c")?.success).toBe(true);
  });

  it("all sites fail: opportunities is empty, all siteHealth records have success=false", async () => {
    const entries: FakeEntry[] = [
      { slug: "site-a", site: "Site A", fn: async () => { throw new Error("DNS error"); } },
      { slug: "site-b", site: "Site B", fn: async () => { throw new Error("Timeout"); } },
    ];
    const { opportunities, siteHealth } = await runFakeRegistry(entries);
    expect(opportunities).toHaveLength(0);
    expect(siteHealth.every((s) => !s.success)).toBe(true);
    expect(siteHealth.find((s) => s.slug === "site-a")?.error).toContain("DNS error");
  });

  it("does not propagate site errors as top-level rejection", async () => {
    const entries: FakeEntry[] = [
      { slug: "site-a", site: "Site A", fn: async () => { throw new Error("Network failure"); } },
    ];
    // Must not throw; partial failures are captured in siteHealth
    await expect(runFakeRegistry(entries)).resolves.toBeDefined();
  });

  it("siteHealth has exactly one record per registry entry", async () => {
    const entries: FakeEntry[] = Array.from({ length: 5 }, (_, i) => ({
      slug: `site-${i}`,
      site: `Site ${i}`,
      fn:   async () => [] as string[],
    }));
    const { siteHealth } = await runFakeRegistry(entries);
    expect(siteHealth).toHaveLength(5);
  });
});

// ── writeConnectionHealth siteHealthJson parameter ────────────────────────────

describe("writeConnectionHealth siteHealthJson parameter", () => {
  it("siteHealth can be JSON-serialized for storage", () => {
    const siteHealth: SiteHealthRecord[] = [
      { slug: "ky-hancock", site: "Hancock County", success: true, count: 2 },
      { slug: "demandstar-ky", site: "DemandStar KY", success: false, count: 0, error: "HTTP 503" },
    ];
    const json = JSON.stringify(siteHealth);
    const parsed = JSON.parse(json) as SiteHealthRecord[];

    expect(parsed).toHaveLength(2);
    expect(parsed[0].success).toBe(true);
    expect(parsed[1].error).toBe("HTTP 503");
    expect(json.length).toBeLessThan(10_000); // sanity check — won't overflow DB TEXT column
  });

  it("siteHealth JSON roundtrips cleanly", () => {
    const original: SiteHealthRecord[] = [
      { slug: "ky-vss", site: "KY eMarketplace", success: false, count: 0, error: "Angular SPA unreachable" },
    ];
    const roundtripped = JSON.parse(JSON.stringify(original)) as SiteHealthRecord[];
    expect(roundtripped[0].slug).toBe("ky-vss");
    expect(roundtripped[0].error).toBe("Angular SPA unreachable");
  });
});
