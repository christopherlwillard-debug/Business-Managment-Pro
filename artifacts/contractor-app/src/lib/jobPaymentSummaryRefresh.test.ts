import { describe, expect, it } from "vitest";
import { formatJobFinancialAmount } from "./jobFinancials";
import {
  initialJobPaymentSummaryRefreshState,
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
});