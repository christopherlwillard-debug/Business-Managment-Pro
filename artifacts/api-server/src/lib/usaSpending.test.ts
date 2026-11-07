import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchUsaSpendingAwards } from "./usaSpending.js";

describe("USAspending source health", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retains successful batches and reports failed batches", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: [{
            generated_internal_id: "AWARD-1",
            "Recipient Name": "Small Contractor LLC",
            "Awarding Agency": "Department of Defense",
            "NAICS Code": "238330",
            "Date Signed": "2026-01-01",
            "Award Amount": 125000,
            "Place of Performance State Code": "KY",
          }],
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: () => Promise.resolve("service unavailable"),
      } as unknown as Response));

    const result = await fetchUsaSpendingAwards({
      naicsCodes: ["238330", "238310", "238320", "238390", "238990", "561730"],
      state: "KY",
    });

    expect(result.awards).toHaveLength(1);
    expect(result.awards[0].noticeId).toBe("AWARD-1");
    expect(result.requestsAttempted).toBe(2);
    expect(result.requestsSucceeded).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("HTTP 503");
  });

  it("reports network failures instead of treating them as empty successful syncs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket timeout")));

    const result = await fetchUsaSpendingAwards({ naicsCodes: ["238330"] });

    expect(result.awards).toEqual([]);
    expect(result.requestsAttempted).toBe(1);
    expect(result.requestsSucceeded).toBe(0);
    expect(result.errors[0]).toContain("Network/timeout");
  });
});
