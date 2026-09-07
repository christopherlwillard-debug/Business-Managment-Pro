export type JobPaymentSummaryRefreshState = {
  invoiceKey: number;
  financialKey: number;
};

export type JobPaymentSummaryRefreshAction =
  | { type: "invoice-saved" }
  | { type: "invoice-accepted" }
  | { type: "payment-link-synced" }
  | { type: "production-pricing-applied" }
  | { type: "worker-payment-recorded" };

export const initialJobPaymentSummaryRefreshState: JobPaymentSummaryRefreshState = {
  invoiceKey: 0,
  financialKey: 0,
};

export type JobProfitSummaryStatus = "loading" | "ready" | "partial" | "error";

export function compareProfitSummaryValuesDescending(
  a: number | null | undefined,
  b: number | null | undefined,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}

export function hasCompleteProfitSummaries<T>(
  jobIds: number[],
  profitMap: Map<number, T | null>,
): boolean {
  return jobIds.every(jobId => profitMap.get(jobId) != null);
}

export function hasPartialProfitSummaries<T>(
  jobIds: number[],
  profitMap: Map<number, T | null>,
): boolean {
  return !hasCompleteProfitSummaries(jobIds, profitMap);
}

export function jobProfitSummaryRequestKey(jobIds: number[], financialKey: number): string {
  return `${jobIds.join(",")}:${financialKey}`;
}

export function jobPaymentSummaryRefreshReducer(
  state: JobPaymentSummaryRefreshState,
  action: JobPaymentSummaryRefreshAction,
): JobPaymentSummaryRefreshState {
  if (action.type === "worker-payment-recorded") {
    return { ...state, financialKey: state.financialKey + 1 };
  }

  return {
    invoiceKey: state.invoiceKey + 1,
    financialKey: state.financialKey + 1,
  };
}