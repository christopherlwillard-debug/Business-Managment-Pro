import { describe, expect, it, vi } from "vitest";
import { getSummaryDetailRefresh } from "./JobStatusPage";

type SummaryResponse = {
  token: string;
  overallPercent: number;
};

type DetailResponse = {
  token: string;
  completedItems: number;
};

describe("public checklist summary/detail refresh", () => {
  it("refetches detail once for changed progress, ignores unchanged polling, and resets for a new token", () => {
    const summaryResponses: SummaryResponse[] = [
      { token: "first-share", overallPercent: 20 },
      { token: "first-share", overallPercent: 20 },
      { token: "first-share", overallPercent: 40 },
      { token: "second-share", overallPercent: 40 },
      { token: "second-share", overallPercent: 60 },
    ];
    const detailResponses: DetailResponse[] = [
      { token: "first-share", completedItems: 2 },
      { token: "first-share", completedItems: 4 },
      { token: "second-share", completedItems: 6 },
    ];
    const requestDetail = vi.fn(() => detailResponses.shift());
    const refetchDetail = vi.fn(() => requestDetail());
    let previous: Parameters<typeof getSummaryDetailRefresh>[0] = null;

    expect(requestDetail()).toEqual({ token: "first-share", completedItems: 2 });
    const pollSummary = () => {
      const summary = summaryResponses.shift();
      if (!summary) throw new Error("summary response queue exhausted");

      const refresh = getSummaryDetailRefresh(previous, summary);
      previous = refresh.next;
      if (refresh.shouldRefetch) refetchDetail();
      return summary;
    };

    expect(detailResponses).toHaveLength(2);
    expect(pollSummary()).toEqual({ token: "first-share", overallPercent: 20 });
    expect(refetchDetail).not.toHaveBeenCalled();

    pollSummary();
    expect(refetchDetail).not.toHaveBeenCalled();
    expect(detailResponses).toHaveLength(2);

    pollSummary();
    expect(refetchDetail).toHaveBeenCalledTimes(1);
    expect(refetchDetail).toHaveReturnedWith({ token: "first-share", completedItems: 4 });

    pollSummary();
    expect(refetchDetail).toHaveBeenCalledTimes(1);
    expect(detailResponses).toHaveLength(1);

    pollSummary();
    expect(refetchDetail).toHaveBeenCalledTimes(2);
    expect(refetchDetail).toHaveLastReturnedWith({ token: "second-share", completedItems: 6 });
    expect(detailResponses).toHaveLength(0);
  });
});
