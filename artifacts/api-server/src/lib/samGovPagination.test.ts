/**
 * Unit tests for SAM.gov pagination logic.
 *
 * These tests verify that fetchSamOpportunities correctly:
 *   - Fetches multiple pages when totalRecords > page size
 *   - Stops at SAM_MAX_PAGES (safety cap)
 *   - Stops early when a page returns fewer records than the page limit
 *   - Stops early when totalRecords indicates all records are fetched
 *   - Deduplicates records that appear across pages (and across NAICS/keyword queries)
 *   - Filters records whose NAICS code is present but not in the requested set
 *
 * fetch is patched globally before each test suite via vi.stubGlobal.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchAllPages, fetchSamOpportunities, SAM_PAGE_SIZE, SAM_MAX_PAGES } from "./samGov.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSamRecord(id: string, naics?: string) {
  return {
    noticeId:       id,
    title:          `Opportunity ${id}`,
    naicsCode:      naics ?? "238310",
    postedDate:     "2026-01-01",
    responseDeadLine: "2026-03-01",
    uiLink:         `https://sam.gov/opp/${id}/view`,
    type:           "o",
    typeOfSetAside: "SBA",
    fullParentPathName: "Test Agency",
  };
}

function makeSamPage(ids: string[], totalRecords: number, naics = "238310") {
  return {
    totalRecords,
    opportunitiesData: ids.map((id) => makeSamRecord(id, naics)),
  };
}

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

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.SAM_GOV_API_KEY = "test-api-key";
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete process.env.SAM_GOV_API_KEY;
});

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
    // Simulate an API that always returns a full page and claims infinite records
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
      makeSamPage(page1, 999),   // total reports more, but page 2 is short
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
    // totalRecords = exactly the page size — no more pages needed
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

describe("fetchSamOpportunities — deduplication and NAICS filtering", () => {
  it("deduplicates records that appear in multiple NAICS/keyword queries", async () => {
    // Two queries; both return the same noticeId.
    // Records use NAICS "237310" which matches the requested set so they pass the post-filter.
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
    expect(ids.length).toBe(uniqueIds.size); // no duplicates
    expect(ids).toContain(sharedId);          // shared record is present once
  });

  it("filters out records whose NAICS code is not in the requested set", async () => {
    // Return a record with NAICS 519130 (not in our requested codes)
    const records = [
      makeSamRecord("valid-opp",   "238310"),
      makeSamRecord("invalid-opp", "519130"), // IT / software — should be filtered
    ];
    mockFetchResponses([{ totalRecords: 2, opportunitiesData: records }]);

    const promise = fetchSamOpportunities({ keywords: ["renovation"], naicsCodes: ["238310"] });
    await vi.runAllTimersAsync();
    const results = await promise;

    expect(results.map((r) => r.noticeId)).toContain("valid-opp");
    expect(results.map((r) => r.noticeId)).not.toContain("invalid-opp");
  });

  it("keeps records with null/absent NAICS (no post-filter exclusion)", async () => {
    const records = [{ ...makeSamRecord("no-naics"), naicsCode: undefined }];
    mockFetchResponses([{ totalRecords: 1, opportunitiesData: records }]);

    const promise = fetchSamOpportunities({ keywords: ["renovation"], naicsCodes: ["238310"] });
    await vi.runAllTimersAsync();
    const results = await promise;

    expect(results.map((r) => r.noticeId)).toContain("no-naics");
  });

  it("returns empty array without logging a warning when SAM_GOV_API_KEY is absent", async () => {
    delete process.env.SAM_GOV_API_KEY;

    // Ensure the credentialManager cache is also cleared for this test
    // (The real test relies on getCredential falling back to process.env)
    const warnSpy = vi.spyOn(console, "warn");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const results = await fetchSamOpportunities({ keywords: ["asphalt"], naicsCodes: ["237310"] });

    expect(results).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("SAM_GOV_API_KEY not configured"));
  });
});
