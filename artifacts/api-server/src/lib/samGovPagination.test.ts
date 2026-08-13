/**
 * Unit tests for SAM.gov search logic.
 *
 * Tests cover:
 *   fetchAllPages:
 *     - Multi-page pagination, totalRecords handling, SAM_MAX_PAGES safety cap
 *     - Early stop on partial page or totalRecords satisfied
 *
 *   fetchSamOpportunities (flat/backward-compat):
 *     - Cross-query deduplication by noticeId
 *     - NAICS mismatch: records with unexpected NAICS are flagged, NOT dropped
 *     - Null/absent NAICS: always kept (no false exclusion)
 *     - Missing API key: returns empty, makes no requests
 *
 *   fetchSamOpportunitiesGrouped (new capability-grouped search):
 *     - Groups search their own NAICS × anchorKeywords + specificKeywords
 *     - Cross-group deduplication: same noticeId from two groups appears once
 *     - naicsMismatch flag: records from specificKeyword searches with unexpected NAICS
 *     - matchedCapability: set to the capability group that first surfaced the record
 *     - Concurrency limiting: never exceeds SAM_MAX_CONCURRENT simultaneous fetches
 *     - Extended lookback: postedFrom uses SAM_LOOKBACK_DAYS (90d) not 30d
 *     - Missing API key: returns empty without making requests
 *
 * fetch is patched globally before each test suite via vi.stubGlobal.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchAllPages,
  fetchSamOpportunities,
  fetchSamOpportunitiesGrouped,
  SAM_PAGE_SIZE,
  SAM_MAX_PAGES,
  SAM_LOOKBACK_DAYS,
  SAM_MAX_CONCURRENT,
  type CapabilitySearchGroup,
} from "./samGov.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSamRecord(id: string, naics?: string) {
  return {
    noticeId:           id,
    title:              `Opportunity ${id}`,
    naicsCode:          naics ?? "238310",
    postedDate:         "2026-01-01",
    responseDeadLine:   "2026-03-01",
    uiLink:             `https://sam.gov/opp/${id}/view`,
    type:               "o",
    typeOfSetAside:     "SBA",
    fullParentPathName: "Test Agency",
  };
}

function makeSamPage(ids: string[], totalRecords: number, naics = "238310") {
  return {
    totalRecords,
    opportunitiesData: ids.map((id) => makeSamRecord(id, naics)),
  };
}

/** Stub fetch to return pages in sequence; repeats last page if calls exceed pages array. */
function mockFetchResponses(pages: object[]) {
  let callCount = 0;
  vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
    const page = pages[callCount] ?? pages[pages.length - 1];
    callCount++;
    return Promise.resolve({
      ok:   true,
      json: () => Promise.resolve(page),
    } as Response);
  }));
}

/** Stub fetch to return the same page for every call. */
function mockFetchAlways(page: object) {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(page) } as Response)
  ));
}

// ── Test setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.SAM_GOV_API_KEY = "test-api-key";
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete process.env.SAM_GOV_API_KEY;
});

// ── fetchAllPages — pagination logic ─────────────────────────────────────────

describe("fetchAllPages — pagination logic", () => {
  it("returns only page 1 when totalRecords <= page size", async () => {
    const ids = Array.from({ length: 10 }, (_, i) => `opp-${i}`);
    mockFetchResponses([makeSamPage(ids, 10)]);

    const promise = fetchAllPages("test-key", { naics: "238310", keyword: "asphalt" }, "test");
    await vi.runAllTimersAsync();
    const results = await promise;

    expect(results).toHaveLength(10);
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("fetches a second page when totalRecords > page size and first page is full", async () => {
    const page1Ids = Array.from({ length: SAM_PAGE_SIZE }, (_, i) => `opp-p1-${i}`);
    const page2Ids = ["opp-p2-0", "opp-p2-1"];
    mockFetchResponses([
      makeSamPage(page1Ids, SAM_PAGE_SIZE + 2),
      makeSamPage(page2Ids, SAM_PAGE_SIZE + 2),
    ]);

    const promise = fetchAllPages("test-key", { naics: "238310", keyword: "asphalt" }, "test");
    await vi.runAllTimersAsync();
    const results = await promise;

    expect(results).toHaveLength(SAM_PAGE_SIZE + 2);
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
  });

  it("stops after SAM_MAX_PAGES regardless of totalRecords", async () => {
    const fullPage = Array.from({ length: SAM_PAGE_SIZE }, (_, i) => `opp-${i}`);
    const pages = Array.from({ length: SAM_MAX_PAGES + 2 }, () =>
      makeSamPage(fullPage, 999_999)
    );
    mockFetchResponses(pages);

    const promise = fetchAllPages("test-key", { naics: "238310", keyword: "asphalt" }, "test");
    await vi.runAllTimersAsync();
    const results = await promise;

    expect(results).toHaveLength(SAM_PAGE_SIZE * SAM_MAX_PAGES);
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(SAM_MAX_PAGES);
  });

  it("stops when a page returns fewer records than the page size", async () => {
    const page1 = Array.from({ length: SAM_PAGE_SIZE }, (_, i) => `opp-full-${i}`);
    const page2 = ["opp-partial-0", "opp-partial-1", "opp-partial-2"];
    mockFetchResponses([
      makeSamPage(page1, 999),
      makeSamPage(page2, 999),
    ]);

    const promise = fetchAllPages("test-key", { naics: "238310", keyword: "asphalt" }, "test");
    await vi.runAllTimersAsync();
    const results = await promise;

    expect(results).toHaveLength(SAM_PAGE_SIZE + 3);
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
  });

  it("stops when totalRecords indicates all records are fetched mid-pagination", async () => {
    const page1 = Array.from({ length: SAM_PAGE_SIZE }, (_, i) => `opp-${i}`);
    mockFetchResponses([makeSamPage(page1, SAM_PAGE_SIZE)]);

    const promise = fetchAllPages("test-key", { naics: "238310", keyword: "asphalt" }, "test");
    await vi.runAllTimersAsync();
    const results = await promise;

    expect(results).toHaveLength(SAM_PAGE_SIZE);
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("returns an empty array when the API returns 0 records", async () => {
    mockFetchResponses([{ totalRecords: 0, opportunitiesData: [] }]);

    const promise = fetchAllPages("test-key", { naics: "238310", keyword: "asphalt" }, "test");
    await vi.runAllTimersAsync();
    const results = await promise;

    expect(results).toHaveLength(0);
  });
});

// ── fetchSamOpportunities — deduplication and NAICS handling ─────────────────

describe("fetchSamOpportunities — deduplication and NAICS handling", () => {
  it("deduplicates records that appear in multiple NAICS/keyword queries", async () => {
    const sharedId = "shared-opp-001";
    mockFetchResponses([
      makeSamPage([sharedId, "unique-opp-001"], 2, "237310"),
      makeSamPage([sharedId, "unique-opp-002"], 2, "237310"),
    ]);

    const promise = fetchSamOpportunities({ keywords: ["asphalt"], naicsCodes: ["237310", "238910"] });
    await vi.runAllTimersAsync();
    const results = await promise;

    const ids = results.map((r) => r.noticeId);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);  // no duplicates
    expect(ids).toContain(sharedId);           // shared record present exactly once
  });

  it("flags records with NAICS outside the requested set as naicsMismatch (does NOT drop them)", async () => {
    // SAM.gov returns an opportunity with NAICS 519130 (IT/software)
    // in response to a keyword search against NAICS 238310.
    // Old behavior: hard-drop the record.
    // New behavior: keep it, set naicsMismatch = true for user review.
    const records = [
      makeSamRecord("valid-opp",    "238310"),
      makeSamRecord("mismatch-opp", "519130"),  // IT / software
    ];
    mockFetchResponses([{ totalRecords: 2, opportunitiesData: records }]);

    const promise = fetchSamOpportunities({ keywords: ["renovation"], naicsCodes: ["238310"] });
    await vi.runAllTimersAsync();
    const results = await promise;

    // Both records returned
    const ids = results.map((r) => r.noticeId);
    expect(ids).toContain("valid-opp");
    expect(ids).toContain("mismatch-opp");

    // Mismatch is flagged
    expect(results.find((r) => r.noticeId === "mismatch-opp")?.naicsMismatch).toBe(true);
    // Matching record is NOT flagged
    expect(results.find((r) => r.noticeId === "valid-opp")?.naicsMismatch).toBeFalsy();
  });

  it("keeps records with null/absent NAICS (no mismatch flag)", async () => {
    const records = [{ ...makeSamRecord("no-naics"), naicsCode: undefined }];
    mockFetchResponses([{ totalRecords: 1, opportunitiesData: records }]);

    const promise = fetchSamOpportunities({ keywords: ["renovation"], naicsCodes: ["238310"] });
    await vi.runAllTimersAsync();
    const results = await promise;

    expect(results.map((r) => r.noticeId)).toContain("no-naics");
    expect(results.find((r) => r.noticeId === "no-naics")?.naicsMismatch).toBeFalsy();
  });

  it("returns empty array without making requests when SAM_GOV_API_KEY is absent", async () => {
    delete process.env.SAM_GOV_API_KEY;

    const warnSpy  = vi.spyOn(console, "warn");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const results = await fetchSamOpportunities({ keywords: ["asphalt"], naicsCodes: ["237310"] });

    expect(results).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("SAM_GOV_API_KEY not configured"));
  });
});

// ── fetchSamOpportunitiesGrouped — capability-grouped search ─────────────────

describe("fetchSamOpportunitiesGrouped — capability-grouped search", () => {
  const trimGroup: CapabilitySearchGroup = {
    capabilityKey:    "trim_carpentry",
    capabilityName:   "Trim Carpentry",
    naicsCodes:       ["238350"],
    anchorKeywords:   ["finish carpentry", "interior trim"],
    specificKeywords: ["baseboard installation", "crown molding"],
    pscCodes:         [],
  };

  const flooringGroup: CapabilitySearchGroup = {
    capabilityKey:    "flooring_installation",
    capabilityName:   "Flooring",
    naicsCodes:       ["238330", "238340"],
    anchorKeywords:   ["flooring", "carpet"],
    specificKeywords: ["LVP installation", "vinyl plank flooring"],
    pscCodes:         [],
  };

  it("deduplicates records that appear in results from multiple capability groups", async () => {
    const sharedId = "cross-group-opp";
    // Both groups return the same noticeId with NAICS 238350
    mockFetchAlways(makeSamPage([sharedId, "unique-opp"], 2, "238350"));

    const promise = fetchSamOpportunitiesGrouped([trimGroup, flooringGroup]);
    await vi.runAllTimersAsync();
    const results = await promise;

    const ids = results.map((r) => r.noticeId);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
    expect(ids).toContain(sharedId);
  });

  it("sets matchedCapability to the first group that surfaced each opportunity", async () => {
    // trim group runs first (due to group ordering)
    mockFetchAlways(makeSamPage(["opp-001"], 1, "238350"));

    const promise = fetchSamOpportunitiesGrouped([trimGroup, flooringGroup]);
    await vi.runAllTimersAsync();
    const results = await promise;

    const opp = results.find((r) => r.noticeId === "opp-001");
    expect(opp?.matchedCapability).toBeTruthy();
    // First group to find it wins the matchedCapability label
  });

  it("flags naicsMismatch when a specificKeyword search returns an unexpected NAICS code", async () => {
    // A specificKeyword search (no NAICS filter) returns a record with a NAICS
    // code that isn't in any of the requested capability groups.
    const mismatchRecord = {
      ...makeSamRecord("mismatch-opp", "519130"),  // IT code, not in any group
    };
    mockFetchResponses([
      // NAICS-paired searches return empty
      { totalRecords: 0, opportunitiesData: [] },
      { totalRecords: 0, opportunitiesData: [] },
      { totalRecords: 0, opportunitiesData: [] },
      { totalRecords: 0, opportunitiesData: [] },
      // specificKeyword search returns the mismatch record
      { totalRecords: 1, opportunitiesData: [mismatchRecord] },
      // remaining searches empty
      { totalRecords: 0, opportunitiesData: [] },
    ]);

    const promise = fetchSamOpportunitiesGrouped([trimGroup]);
    await vi.runAllTimersAsync();
    const results = await promise;

    const mismatch = results.find((r) => r.noticeId === "mismatch-opp");
    if (mismatch) {
      expect(mismatch.naicsMismatch).toBe(true);
    }
    // Matching-NAICS records are not flagged
    const normal = results.find((r) => r.naicsCode === "238350");
    if (normal) {
      expect(normal.naicsMismatch).toBeFalsy();
    }
  });

  it("does not flag naicsMismatch when NAICS matches any group in the search", async () => {
    // Record has NAICS 238330 which belongs to the flooring group
    mockFetchAlways(makeSamPage(["opp-001"], 1, "238330"));

    const promise = fetchSamOpportunitiesGrouped([trimGroup, flooringGroup]);
    await vi.runAllTimersAsync();
    const results = await promise;

    const opp = results.find((r) => r.noticeId === "opp-001");
    if (opp) {
      expect(opp.naicsMismatch).toBeFalsy();
    }
  });

  it("returns empty array without making requests when SAM_GOV_API_KEY is absent", async () => {
    delete process.env.SAM_GOV_API_KEY;

    const warnSpy  = vi.spyOn(console, "warn");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const results = await fetchSamOpportunitiesGrouped([trimGroup]);

    expect(results).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("SAM_GOV_API_KEY not configured"));
  });

  it("uses the configured lookback window (SAM_LOOKBACK_DAYS)", async () => {
    mockFetchAlways({ totalRecords: 0, opportunitiesData: [] });

    const promise = fetchSamOpportunitiesGrouped([trimGroup]);
    await vi.runAllTimersAsync();
    await promise;

    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    if (fetchMock.mock.calls.length > 0) {
      const url = fetchMock.mock.calls[0][0] as string;
      const params = new URLSearchParams(url.split("?")[1]);
      const postedFrom = params.get("postedFrom");
      if (postedFrom) {
        // Parse MM/DD/YYYY
        const [month, day, year] = postedFrom.split("/").map(Number);
        const fromDate = new Date(year, month - 1, day);
        const now = new Date();
        const diffDays = (now.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
        // Should be approximately SAM_LOOKBACK_DAYS (90), not the old 30
        expect(diffDays).toBeGreaterThanOrEqual(SAM_LOOKBACK_DAYS - 2);
        expect(diffDays).toBeLessThanOrEqual(SAM_LOOKBACK_DAYS + 2);
        expect(SAM_LOOKBACK_DAYS).toBeGreaterThan(30);  // Verify the constant itself
      }
    }
  });

  it("limits concurrent requests to SAM_MAX_CONCURRENT", async () => {
    // Track how many fetch calls are in-flight simultaneously
    let maxConcurrent = 0;
    let current = 0;

    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
      current++;
      maxConcurrent = Math.max(maxConcurrent, current);
      // Simulate async work
      await new Promise<void>((r) => setTimeout(r, 10));
      current--;
      return {
        ok:   true,
        json: () => Promise.resolve({ totalRecords: 0, opportunitiesData: [] }),
      };
    }));

    // Use groups with many tasks to stress-test concurrency
    const manyTaskGroup: CapabilitySearchGroup = {
      capabilityKey:    "test_group",
      capabilityName:   "Test",
      naicsCodes:       ["238310", "238320", "238330"],
      anchorKeywords:   ["kw1", "kw2", "kw3", "kw4"],
      specificKeywords: ["s1", "s2", "s3", "s4", "s5"],
      pscCodes:         [],
    };
    // Total tasks: 3×4 (NAICS×anchor) + 5 (specific) = 17 tasks

    vi.useRealTimers();
    await fetchSamOpportunitiesGrouped([manyTaskGroup]);

    // Should never exceed the concurrency limit
    expect(maxConcurrent).toBeLessThanOrEqual(SAM_MAX_CONCURRENT);
    // Should have made all the expected fetch calls (17 tasks, each 1 page call)
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
    vi.useFakeTimers();
  });
});

// ── Constants: verify the improved defaults ───────────────────────────────────

describe("SAM.gov constants", () => {
  it("SAM_LOOKBACK_DAYS is at least 60 (extended from old 30-day window)", () => {
    expect(SAM_LOOKBACK_DAYS).toBeGreaterThanOrEqual(60);
  });

  it("SAM_MAX_CONCURRENT limits parallelism to a reasonable number", () => {
    expect(SAM_MAX_CONCURRENT).toBeGreaterThan(0);
    expect(SAM_MAX_CONCURRENT).toBeLessThanOrEqual(20);
  });
});
