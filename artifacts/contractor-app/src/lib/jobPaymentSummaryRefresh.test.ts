import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JobMarginCard } from "../components/JobMarginCard";
import type { JobProfitResponse } from "@workspace/api-client-react";
import { formatJobFinancialAmount } from "./jobFinancials";
import { calculateJobMargin } from "./jobMargin";
import {
  canSortProfitSummaries,
  compareProfitSummaryValuesDescending,
  hasCompleteProfitSummaries,
  hasPartialProfitSummaries,
  initialJobPaymentSummaryRefreshState,
  jobProfitSummaryRequestKey,
  jobPaymentSummaryRefreshReducer,
  missingProfitSummaryJobIds,
  nextJobPaymentSummaryRefreshGeneration,
  type JobPaymentSummaryRefreshAction,
} from "./jobPaymentSummaryRefresh";
import {
  applyJobProfitRefresh,
  startJobProfitRefresh,
} from "./jobProfitRequests";

type PayrollProfitSnapshot = Pick<
  JobProfitResponse,
  "subLaborCost" | "estimatedFuelCost" | "growthReservePct" | "netProfit"
>;

describe("Jobs payment summary refresh", () => {
  it.each<JobPaymentSummaryRefreshAction>([
    { type: "invoice-saved" },
    { type: "invoice-accepted" },
    { type: "payment-link-synced" },
    { type: "production-pricing-applied" },
  ])("refreshes invoice and financial requests after $type", action => {
    const snapshots = new Map([
      [0, { customerDue: 500, ownerPayRemaining: 350 }],
      [1, { customerDue: 250, ownerPayRemaining: 425 }],
    ]);
    const initialSnapshot = snapshots.get(initialJobPaymentSummaryRefreshState.financialKey);
    const next = jobPaymentSummaryRefreshReducer(initialJobPaymentSummaryRefreshState, action);
    const refreshedSnapshot = snapshots.get(next.financialKey);

    expect(initialSnapshot).toEqual({ customerDue: 500, ownerPayRemaining: 350 });
    expect(next.invoiceKey).toBe(1);
    expect(next.financialKey).toBe(1);
    expect(refreshedSnapshot).toEqual({ customerDue: 250, ownerPayRemaining: 425 });
  });

  it("refreshes worker/subcontractor and Owner Pay values after recording a worker payment", () => {
    const snapshots = new Map([
      [0, {
        workers: { totalOwed: 300 },
        subcontractors: { totalOwed: 150 },
        ownerPay: { remaining: 500 },
      }],
      [1, {
        workers: { totalOwed: 0 },
        subcontractors: { totalOwed: null },
        ownerPay: { remaining: 425 },
      }],
    ]);

    const next = jobPaymentSummaryRefreshReducer(
      initialJobPaymentSummaryRefreshState,
      { type: "worker-payment-recorded" },
    );
    const refreshedSnapshot = snapshots.get(next.financialKey);

    expect(next.invoiceKey).toBe(0);
    expect(next.financialKey).toBe(1);
    expect(refreshedSnapshot).toEqual({
      workers: { totalOwed: 0 },
      subcontractors: { totalOwed: null },
      ownerPay: { remaining: 425 },
    });
    expect(formatJobFinancialAmount(
      refreshedSnapshot?.subcontractors.totalOwed,
      amount => `$${amount.toFixed(2)}`,
    ))
      .toBe("Unavailable");
  });

  it("refreshes the visible margin after collected revenue changes", () => {
    const profitSnapshots = new Map([
      [0, { netProfit: 250, collected: 0 }],
      [1, { netProfit: 250, collected: 500 }],
    ]);
    const initialProfit = profitSnapshots.get(initialJobPaymentSummaryRefreshState.financialKey)!;
    const initialRequestKey = jobProfitSummaryRequestKey(
      [42],
      initialJobPaymentSummaryRefreshState.financialKey,
    );

    expect(calculateJobMargin(initialProfit.netProfit, initialProfit.collected)).toBeNull();

    const next = jobPaymentSummaryRefreshReducer(
      initialJobPaymentSummaryRefreshState,
      { type: "payment-link-synced" },
    );
    const refreshedProfit = profitSnapshots.get(next.financialKey)!;
    const refreshedRequestKey = jobProfitSummaryRequestKey([42], next.financialKey);
    const refreshedMargin = calculateJobMargin(refreshedProfit.netProfit, refreshedProfit.collected);
    const markup = renderToStaticMarkup(createElement(JobMarginCard, { margin: refreshedMargin }));

    expect(next.financialKey).toBe(1);
    expect(refreshedRequestKey).not.toBe(initialRequestKey);
    expect(refreshedMargin).toBe(50);
    expect(markup).toContain("50%");
    expect(markup).toContain("emerald");
  });

  it("applies the complete payroll profit response after a successful refresh", () => {
    const refreshedProfit: PayrollProfitSnapshot = {
      subLaborCost: 412.5,
      estimatedFuelCost: 63.25,
      growthReservePct: 5,
      netProfit: 1710.75,
    };

    const next = applyJobProfitRefresh<PayrollProfitSnapshot>(
      startJobProfitRefresh<PayrollProfitSnapshot>(),
      {
        requestKey: 8,
        currentRequestKey: 8,
        requestedJobId: 42,
        currentJobId: 42,
        response: { status: "fulfilled", value: refreshedProfit },
      },
    );

    expect(next).toEqual({
      loading: false,
      profit: refreshedProfit,
      profitError: false,
    });
    expect(next.profit).toMatchObject({
      subLaborCost: 412.5,
      estimatedFuelCost: 63.25,
      growthReservePct: 5,
      netProfit: 1710.75,
    });
  });

  it("clears an old payroll profit and exposes the actionable error state after failure", () => {
    const previousProfit: PayrollProfitSnapshot = {
      subLaborCost: 300,
      estimatedFuelCost: 40,
      growthReservePct: 5,
      netProfit: 1200,
    };

    const next = applyJobProfitRefresh<PayrollProfitSnapshot>(
      startJobProfitRefresh<PayrollProfitSnapshot>(),
      {
        requestKey: 9,
        currentRequestKey: 9,
        requestedJobId: 42,
        currentJobId: 42,
        response: { status: "rejected" },
      },
    );

    expect(next).toEqual({
      loading: false,
      profit: null,
      profitError: true,
    });
  });

  it("gives same-job refreshes distinct generations and keeps the newer success", () => {
    const firstRequestKey = nextJobPaymentSummaryRefreshGeneration(0);
    const secondRequestKey = nextJobPaymentSummaryRefreshGeneration(firstRequestKey);
    const newerProfit: PayrollProfitSnapshot = {
      subLaborCost: 425,
      estimatedFuelCost: 64,
      growthReservePct: 6,
      netProfit: 1725,
    };
    const olderProfit: PayrollProfitSnapshot = {
      subLaborCost: 300,
      estimatedFuelCost: 40,
      growthReservePct: 5,
      netProfit: 1200,
    };

    expect(secondRequestKey).not.toBe(firstRequestKey);

    const afterNewerResponse = applyJobProfitRefresh(
      startJobProfitRefresh<PayrollProfitSnapshot>(),
      {
        requestKey: secondRequestKey,
        currentRequestKey: secondRequestKey,
        requestedJobId: 42,
        currentJobId: 42,
        response: { status: "fulfilled", value: newerProfit },
      },
    );
    const afterOlderResponse = applyJobProfitRefresh(
      afterNewerResponse,
      {
        requestKey: firstRequestKey,
        currentRequestKey: secondRequestKey,
        requestedJobId: 42,
        currentJobId: 42,
        response: { status: "fulfilled", value: olderProfit },
      },
    );

    expect(afterOlderResponse).toBe(afterNewerResponse);
    expect(afterOlderResponse).toEqual({
      loading: false,
      profit: newerProfit,
      profitError: false,
    });
  });

  it("keeps a newer success when an older same-job refresh fails later", () => {
    const firstRequestKey = nextJobPaymentSummaryRefreshGeneration(10);
    const secondRequestKey = nextJobPaymentSummaryRefreshGeneration(firstRequestKey);
    const newerProfit: PayrollProfitSnapshot = {
      subLaborCost: 450,
      estimatedFuelCost: 70,
      growthReservePct: 7,
      netProfit: 1800,
    };

    const afterNewerResponse = applyJobProfitRefresh(
      startJobProfitRefresh<PayrollProfitSnapshot>(),
      {
        requestKey: secondRequestKey,
        currentRequestKey: secondRequestKey,
        requestedJobId: 42,
        currentJobId: 42,
        response: { status: "fulfilled", value: newerProfit },
      },
    );
    const afterOlderResponse = applyJobProfitRefresh(
      afterNewerResponse,
      {
        requestKey: firstRequestKey,
        currentRequestKey: secondRequestKey,
        requestedJobId: 42,
        currentJobId: 42,
        response: { status: "rejected" },
      },
    );

    expect(afterOlderResponse).toBe(afterNewerResponse);
    expect(afterOlderResponse.profit).toEqual(newerProfit);
    expect(afterOlderResponse.profitError).toBe(false);
  });

  it("ignores a refreshed response for a job that is no longer selected", () => {
    const selectedProfit: PayrollProfitSnapshot = {
      subLaborCost: 275,
      estimatedFuelCost: 35,
      growthReservePct: 5,
      netProfit: 980,
    };
    const staleProfit: PayrollProfitSnapshot = {
      subLaborCost: 999,
      estimatedFuelCost: 88,
      growthReservePct: 10,
      netProfit: -250,
    };
    const state = {
      loading: true,
      profit: selectedProfit,
      profitError: false,
    };

    const next = applyJobProfitRefresh(
      state,
      {
        requestKey: 10,
        currentRequestKey: 11,
        requestedJobId: 42,
        currentJobId: 43,
        response: { status: "fulfilled", value: staleProfit },
      },
    );

    expect(next).toBe(state);
    expect(next.profit).toEqual(selectedProfit);
    expect(next.profitError).toBe(false);
  });

  it("sorts unavailable profit summaries after available values", () => {
    expect(compareProfitSummaryValuesDescending(250, 100)).toBe(-150);
    expect(compareProfitSummaryValuesDescending(null, 100)).toBe(1);
    expect(compareProfitSummaryValuesDescending(250, undefined)).toBe(-1);
    expect(compareProfitSummaryValuesDescending(null, undefined)).toBe(0);
  });

  it("only treats a batch as complete when every requested job has a summary", () => {
    const complete = new Map<number, { netProfit: number }>([
      [1, { netProfit: 100 }],
      [2, { netProfit: 0 }],
    ]);
    const incomplete = new Map<number, { netProfit: number } | null>([
      [1, { netProfit: 100 }],
      [2, null],
    ]);

    expect(hasCompleteProfitSummaries([1, 2], complete)).toBe(true);
    expect(hasCompleteProfitSummaries([1, 2], incomplete)).toBe(false);
    expect(hasPartialProfitSummaries([1, 2], complete)).toBe(false);
    expect(hasPartialProfitSummaries([1, 2], incomplete)).toBe(true);
  });

  it("identifies exactly which requested jobs are missing profit summaries", () => {
    const profitMap = new Map<number, { netProfit: number } | null>([
      [1, { netProfit: 100 }],
      [2, null],
      [3, { netProfit: 0 }],
      [4, null],
    ]);

    expect(missingProfitSummaryJobIds([1, 2, 3, 4], profitMap)).toEqual([2, 4]);
  });

  it("only enables profit sorting after a complete ready response", () => {
    const complete = new Map<number, { netProfit: number }>([
      [1, { netProfit: 100 }],
      [2, { netProfit: 0 }],
    ]);
    const incomplete = new Map<number, { netProfit: number } | null>([
      [1, { netProfit: 100 }],
      [2, null],
    ]);

    expect(canSortProfitSummaries([1, 2], "loading", complete)).toBe(false);
    expect(canSortProfitSummaries([1, 2], "error", complete)).toBe(false);
    expect(canSortProfitSummaries([1, 2], "partial", incomplete)).toBe(false);
    expect(canSortProfitSummaries([1, 2], "ready", incomplete)).toBe(false);
    expect(canSortProfitSummaries([1, 2], "ready", complete)).toBe(true);
  });
});