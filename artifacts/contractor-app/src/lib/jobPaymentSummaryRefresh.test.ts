import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JobMarginCard } from "../components/JobMarginCard";
import { formatJobFinancialAmount } from "./jobFinancials";
import { calculateJobMargin } from "./jobMargin";
import {
  compareProfitSummaryValuesDescending,
  hasCompleteProfitSummaries,
  hasPartialProfitSummaries,
  initialJobPaymentSummaryRefreshState,
  jobProfitSummaryRequestKey,
  jobPaymentSummaryRefreshReducer,
  type JobPaymentSummaryRefreshAction,
} from "./jobPaymentSummaryRefresh";

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
});