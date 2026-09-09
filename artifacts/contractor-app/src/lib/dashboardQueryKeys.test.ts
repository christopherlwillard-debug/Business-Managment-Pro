import { describe, expect, it } from "vitest";
import { getGetDashboardStatsQueryKey } from "@workspace/api-client-react";

describe("dashboard period query scope", () => {
  it("keeps each selected period in a separate cache key", () => {
    const businessLine = "general_contracting";
    const weekKey = getGetDashboardStatsQueryKey({ period: "week", businessLine });
    const monthKey = getGetDashboardStatsQueryKey({ period: "month", businessLine });
    const quarterKey = getGetDashboardStatsQueryKey({ period: "quarter", businessLine });
    const yearKey = getGetDashboardStatsQueryKey({ period: "year", businessLine });

    expect(new Set([weekKey, monthKey, quarterKey, yearKey].map(key => JSON.stringify(key))).size).toBe(4);
  });

  it("keeps business-line dashboard results separate within one period", () => {
    const generalContractingKey = getGetDashboardStatsQueryKey({
      period: "month",
      businessLine: "general_contracting",
    });
    const asphaltKey = getGetDashboardStatsQueryKey({
      period: "month",
      businessLine: "asphalt_sealing",
    });

    expect(generalContractingKey).not.toEqual(asphaltKey);
  });
});