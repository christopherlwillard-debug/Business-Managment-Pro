import { describe, expect, it } from "vitest";
import {
  canApplyJobResponse,
  getJobProfitDisplayState,
  getSavedMileageReimbursement,
  isAbortError,
  startJobProfitRefresh,
} from "./jobProfitRequests";
import type {
  JobProfitResponse,
  JobProfitSummaryResponse,
} from "@workspace/api-client-react";
import {
  approvedProfitClientConsumers,
  findProfitClientViolations,
  listProfitClientSourceFiles,
} from "../../scripts/check-job-profit-client-usage.mjs";

function violationsFor(relativePath: string, source: string) {
  return findProfitClientViolations(relativePath, source);
}

describe("canApplyJobResponse", () => {
  it("rejects a response from an earlier job after navigation", () => {
    expect(canApplyJobResponse(1, 2, 101, 202)).toBe(false);
    expect(canApplyJobResponse(1, 2, 202, 202)).toBe(false);
  });

  it("accepts the latest response for the current job", () => {
    expect(canApplyJobResponse(4, 4, 202, 202)).toBe(true);
  });
});

describe("getJobProfitDisplayState", () => {
  it("keeps a pending request in the loading state", () => {
    expect(getJobProfitDisplayState(startJobProfitRefresh())).toBe("loading");
  });

  it("shows an unavailable state after an error instead of treating it as zero", () => {
    expect(getJobProfitDisplayState({
      loading: false,
      profit: null,
      profitError: true,
    })).toBe("unavailable");
  });

  it("accepts a legitimate zero-valued profit response as ready data", () => {
    expect(getJobProfitDisplayState({
      loading: false,
      profit: { netProfit: 0 },
      profitError: false,
    })).toBe("ready");
  });
});

describe("getSavedMileageReimbursement", () => {
  it("normalizes a saved detail response object", () => {
    const reimbursement = {
      id: 7,
      amount: 125,
      estimatedAmount: 120,
      recipientType: "owner" as const,
      recipientName: "Business owner",
      recipientSubcontractorId: null,
      status: "owed" as const,
      paidAt: null,
      notes: "Drive reimbursement",
    };

    expect(getSavedMileageReimbursement({
      mileageReimbursement: reimbursement,
    } as JobProfitResponse)).toEqual(reimbursement);
  });

  it("does not treat the batch numeric compatibility value as an editable record", () => {
    expect(getSavedMileageReimbursement({
      mileageReimbursement: 125,
    } as JobProfitSummaryResponse)).toBeNull();
    expect(getSavedMileageReimbursement({
      mileageReimbursement: null,
    } as JobProfitSummaryResponse)).toBeNull();
  });
});

describe("isAbortError", () => {
  it("recognizes browser-style abort errors", () => {
    expect(isAbortError(Object.assign(new Error("The operation was aborted"), { name: "AbortError" }))).toBe(true);
    expect(isAbortError({ name: "AbortError" })).toBe(true);
  });

  it("does not classify ordinary errors as aborts", () => {
    expect(isAbortError(new Error("Network unavailable"))).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError({ name: "TypeError" })).toBe(false);
  });
});

describe("job profit client usage guard", () => {
  it("keeps the known profit consumers on generated client calls", () => {
    expect(approvedProfitClientConsumers).toEqual([
      "src/pages/Jobs.tsx",
      "src/pages/JobPayroll.tsx",
      "src/pages/RoutePlanner.tsx",
    ]);

    for (const relativePath of approvedProfitClientConsumers) {
      expect(violationsFor(relativePath, `
      const detail = await getJobProfit(job.id);
      const summary = await getJobsProfitSummary({ businessId });
      `)).toEqual([]);
    }
  });

  it("discovers all frontend source files instead of relying on a page list", () => {
    const sourceFiles = listProfitClientSourceFiles();

    expect(sourceFiles).toContain("src/pages/Jobs.tsx");
    expect(sourceFiles).toContain("src/pages/JobPayroll.tsx");
    expect(sourceFiles).toContain("src/pages/RoutePlanner.tsx");
    expect(sourceFiles).not.toContain("src/lib/jobProfitRequests.test.ts");
  });

  it("rejects direct individual profit URLs with the owning file and line", () => {
    const violations = violationsFor(
      "src/pages/NewJobFinancials.tsx",
      [
        "function loadProfit(jobId: number) {",
        "  return fetch(`/api/jobs/${jobId}/profit`);",
        "}",
      ].join("\n"),
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("src/pages/NewJobFinancials.tsx:2:");
  });

  it("rejects direct batch profit URLs with the owning file and line", () => {
    const violations = violationsFor(
      "src/pages/NewJobFinancials.tsx",
      [
        "function loadProfitSummary() {",
        "  return fetch('/api/jobs/profit-summary?businessId=1');",
        "}",
      ].join("\n"),
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("src/pages/NewJobFinancials.tsx:2:");
  });

  it("rejects local JSON response casts with the owning file and line", () => {
    const violations = violationsFor(
      "src/pages/Jobs.tsx",
      [
        "async function loadProfit(jobId: number) {",
        "  const response = await fetch(`/api/jobs/${jobId}/profit`);",
        "  return response.json() as JobProfitResponse;",
        "}",
      ].join("\n"),
    );

    expect(violations).toHaveLength(2);
    expect(violations.every((violation) => violation.includes("src/pages/Jobs.tsx:2:"))).toBe(true);
    expect(violations.some((violation) =>
      violation.includes("do not parse and cast a profit response locally"),
    )).toBe(true);
  });
});