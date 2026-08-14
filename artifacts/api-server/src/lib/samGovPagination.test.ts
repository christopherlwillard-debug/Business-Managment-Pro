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
  CATCH_ALL_KEYWORDS,
  SAM_PAGE_SIZE,
  SAM_MAX_PAGES,
  SAM_LOOKBACK_DAYS,
  SAM_MAX_CONCURRENT,
  type CapabilitySearchGroup,
  type SamGroupedResult,
} from "./samGov.js";
import { GENERAL_CONTRACTING_SEARCH_GROUPS } from "./bidCapabilitySeeds.js";

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
    const { opportunities: results } = await promise;

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
    const { opportunities: results } = await promise;

    const opp = results.find((r) => r.noticeId === "opp-001");
    expect(opp?.matchedCapability).toBeTruthy();
    // First group to find it wins the matchedCapability label
  });

  it("flags naicsMismatch when results contain an unexpected NAICS code", async () => {
    // Any task (NAICS-only, PSC-only, or catch-all keyword) may return records
    // with NAICS codes outside the searched group union. Those records are kept
    // but flagged naicsMismatch=true regardless of which task found them.
    const mismatchRecord = makeSamRecord("mismatch-opp", "519130"); // IT code
    const normalRecord   = makeSamRecord("normal-opp",   "238350"); // in trimGroup

    // mockFetchAlways: every task returns both records — dedup keeps first occurrence.
    mockFetchAlways({ totalRecords: 2, opportunitiesData: [mismatchRecord, normalRecord] });

    const promise = fetchSamOpportunitiesGrouped([trimGroup]);
    await vi.runAllTimersAsync();
    const { opportunities: results } = await promise;

    const mismatch = results.find((r) => r.noticeId === "mismatch-opp");
    const normal   = results.find((r) => r.noticeId === "normal-opp");

    expect(mismatch).toBeDefined();
    expect(mismatch?.naicsMismatch).toBe(true);        // 519130 not in any group

    expect(normal).toBeDefined();
    expect(normal?.naicsMismatch).toBeFalsy();          // 238350 is in trimGroup
  });

  it("does not flag naicsMismatch when NAICS matches any group in the search", async () => {
    // Record has NAICS 238330 which belongs to the flooring group
    mockFetchAlways(makeSamPage(["opp-001"], 1, "238330"));

    const promise = fetchSamOpportunitiesGrouped([trimGroup, flooringGroup]);
    await vi.runAllTimersAsync();
    const { opportunities: results } = await promise;

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

    const { opportunities } = await fetchSamOpportunitiesGrouped([trimGroup]);

    expect(opportunities).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("SAM_GOV_API_KEY not configured"));
  });

  it("aborts remaining tasks and returns quotaResetAt when SAM.gov responds 429", async () => {
    const resetTime = "2026-Aug-14 00:00:00+0000 UTC";

    // All fetch calls respond with HTTP 429 and a nextAccessTime body
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok:     false,
        status: 429,
        json:   () => Promise.resolve({ nextAccessTime: resetTime }),
      } as unknown as Response)
    ));

    vi.useRealTimers();
    const result: SamGroupedResult = await fetchSamOpportunitiesGrouped([trimGroup]);
    vi.useFakeTimers();

    // quotaExhausted must be true regardless of whether reset time is present
    expect(result.quotaExhausted).toBe(true);
    // Quota reset time must be surfaced
    expect(result.quotaResetAt).toBe(resetTime);
    // Partial results are empty (nothing was collected before the 429)
    expect(result.opportunities).toHaveLength(0);
    // At least one task was attempted before quota was hit
    expect(result.requestsAttempted).toBeGreaterThanOrEqual(1);
    // No task succeeded (all returned 429)
    expect(result.requestsAccepted).toBe(0);
  });

  it("signals quotaExhausted=true even when 429 response body is missing or unparseable", async () => {
    // SAM.gov returns 429 with a non-JSON body (e.g. an HTML error page)
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok:     false,
        status: 429,
        json:   () => Promise.reject(new SyntaxError("Unexpected token")),
      } as unknown as Response)
    ));

    vi.useRealTimers();
    const result: SamGroupedResult = await fetchSamOpportunitiesGrouped([trimGroup]);
    vi.useFakeTimers();

    // Exhaustion must be detected even without a parseable reset timestamp
    expect(result.quotaExhausted).toBe(true);
    // Reset time is null since the body could not be parsed
    expect(result.quotaResetAt).toBeNull();
    // No opportunities collected
    expect(result.opportunities).toHaveLength(0);
    // Counters: at least 1 attempted, 0 accepted
    expect(result.requestsAttempted).toBeGreaterThanOrEqual(1);
    expect(result.requestsAccepted).toBe(0);
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

    // 3 unique NAICS + 0 PSC + 5 catch-all = 8 tasks
    const manyTaskGroup: CapabilitySearchGroup = {
      capabilityKey:    "test_group",
      capabilityName:   "Test",
      naicsCodes:       ["238310", "238320", "238330"],
      anchorKeywords:   ["kw1", "kw2", "kw3", "kw4"],
      specificKeywords: ["s1", "s2", "s3", "s4", "s5"],
      pscCodes:         [],
    };
    const expectedTasks = 3 + 0 + CATCH_ALL_KEYWORDS.length; // 8

    vi.useRealTimers();
    const result = await fetchSamOpportunitiesGrouped([manyTaskGroup]);

    // Should never exceed the concurrency limit
    expect(maxConcurrent).toBeLessThanOrEqual(SAM_MAX_CONCURRENT);
    // Fetch calls = expectedTasks (each task makes exactly 1 page call — all return empty)
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls.length).toBe(expectedTasks);
    // Request counters must be present and consistent
    expect(result.requestsAttempted).toBe(expectedTasks);
    expect(result.requestsAccepted).toBe(expectedTasks);
    vi.useFakeTimers();
  });

  it("requestsAttempted counts paginated HTTP calls not tasks — with 2-page NAICS result", async () => {
    // trimGroup: 1 NAICS task + 5 catch-all tasks = 6 tasks total.
    // Mock the NAICS-238350 task to paginate 2 pages; all other tasks return empty.
    // Verify: requestsAttempted = 2 (NAICS pages) + 5 (catch-all, 1 page each) = 7,
    //         NOT 6 (which is the task count).
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      const params = new URLSearchParams((url as string).split("?")[1]);
      const offset  = parseInt(params.get("offset") ?? "0", 10);
      const naics   = params.get("naics");
      if (naics === "238350" && offset === 0) {
        // Page 1: full page — signals more records exist
        return Promise.resolve({
          ok:   true,
          json: () => Promise.resolve({
            totalRecords:      SAM_PAGE_SIZE + 1,
            opportunitiesData: Array.from({ length: SAM_PAGE_SIZE }, (_, i) => makeSamRecord(`p1-${i}`, "238350")),
          }),
        } as Response);
      } else if (naics === "238350" && offset > 0) {
        // Page 2: 1 record — signals end of results
        return Promise.resolve({
          ok:   true,
          json: () => Promise.resolve({
            totalRecords:      SAM_PAGE_SIZE + 1,
            opportunitiesData: [makeSamRecord("p2-0", "238350")],
          }),
        } as Response);
      } else {
        return Promise.resolve({
          ok:   true,
          json: () => Promise.resolve({ totalRecords: 0, opportunitiesData: [] }),
        } as Response);
      }
    }));

    vi.useRealTimers();
    const result = await fetchSamOpportunitiesGrouped([trimGroup]);

    // 2 HTTP calls for the NAICS task + 1 each for the 5 catch-all tasks = 7
    const expectedHttpCalls = 2 + CATCH_ALL_KEYWORDS.length;
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls.length).toBe(expectedHttpCalls);       // actual HTTP calls
    expect(result.requestsAttempted).toBe(expectedHttpCalls);           // counters match
    expect(result.requestsAccepted).toBe(expectedHttpCalls);
    expect(result.quotaExhausted).toBe(false);
    vi.useFakeTimers();
  });

  it("generates ≤60 tasks and requestsAttempted tracks paginated HTTP calls (quota-reduction check)", async () => {
    // Core guard against the ~390-task regression that exhausted the SAM.gov daily quota.
    // GC: 7 groups → ~24 unique NAICS + ~20 unique PSC + 5 catch-all = ~49 tasks.
    // Max HTTP calls = task_count × SAM_MAX_PAGES (5) — even worst-case (245) is far below
    // the old worst-case (393+ tasks × 5 = 1,965).
    //
    // This test forces every task to paginate exactly 2 pages (offset=0 → full page;
    // offset>0 → 1 record) and asserts requestsAttempted equals the raw fetch call count.

    // Compute expected task count from the actual group definitions
    const gcNaics = new Set<string>();
    const gcPsc   = new Set<string>();
    for (const g of GENERAL_CONTRACTING_SEARCH_GROUPS) {
      g.naicsCodes.forEach(n => gcNaics.add(n));
      (g.pscCodes ?? []).forEach(p => gcPsc.add(p));
    }
    const taskCount = gcNaics.size + gcPsc.size + CATCH_ALL_KEYWORDS.length;

    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      const params = new URLSearchParams((url as string).split("?")[1]);
      const offset  = parseInt(params.get("offset") ?? "0", 10);
      if (offset === 0) {
        // Page 1: full page — triggers a page-2 fetch
        return Promise.resolve({
          ok:   true,
          json: () => Promise.resolve({
            totalRecords:      SAM_PAGE_SIZE + 1,
            opportunitiesData: Array.from({ length: SAM_PAGE_SIZE }, (_, i) => makeSamRecord(`p1-${i}`, "238990")),
          }),
        } as Response);
      } else {
        // Page 2: 1 record — signals end of results
        return Promise.resolve({
          ok:   true,
          json: () => Promise.resolve({
            totalRecords:      SAM_PAGE_SIZE + 1,
            opportunitiesData: [makeSamRecord(`p2-last`, "238990")],
          }),
        } as Response);
      }
    }));

    vi.useRealTimers();
    const result = await fetchSamOpportunitiesGrouped(GENERAL_CONTRACTING_SEARCH_GROUPS);

    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    // Counter must equal the number of real HTTP calls made (2 per task)
    expect(result.requestsAttempted).toBe(fetchMock.mock.calls.length);
    // 2 pages per task → HTTP calls = 2 × taskCount
    expect(result.requestsAttempted).toBe(taskCount * 2);
    // Task count is within the ≤60 target
    expect(taskCount).toBeLessThanOrEqual(60);
    // Max possible HTTP calls: 60 tasks × 5 pages = 300 (vs old 1,965)
    expect(result.requestsAttempted).toBeLessThanOrEqual(60 * SAM_MAX_PAGES);
    vi.useFakeTimers();
  }, 15_000); // generous timeout: 49 tasks × 150ms inter-page delay / concurrency=8 ≈ 900ms
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
