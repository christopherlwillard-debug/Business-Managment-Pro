export type JobPaymentSummaryRefreshState = {
  invoiceKey: number;
  financialKey: number;
};

export type JobPaymentSummaryRefreshAction =
  | { type: "invoice-saved" }
  | { type: "invoice-accepted" }
  | { type: "payment-link-synced" }
  | { type: "production-pricing-applied" }
  | { type: "worker-payment-recorded" }
  | { type: "profit-source-changed" };

export const initialJobPaymentSummaryRefreshState: JobPaymentSummaryRefreshState = {
  invoiceKey: 0,
  financialKey: 0,
};

export function nextJobPaymentSummaryRefreshGeneration(currentGeneration: number): number {
  return currentGeneration + 1;
}

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

export function canSortProfitSummaries<T>(
  jobIds: number[],
  status: JobProfitSummaryStatus,
  profitMap: Map<number, T | null>,
): boolean {
  return status === "ready" && hasCompleteProfitSummaries(jobIds, profitMap);
}

export function hasPartialProfitSummaries<T>(
  jobIds: number[],
  profitMap: Map<number, T | null>,
): boolean {
  return !hasCompleteProfitSummaries(jobIds, profitMap);
}

export function missingProfitSummaryJobIds<T>(
  jobIds: number[],
  profitMap: Map<number, T | null>,
): number[] {
  return jobIds.filter(jobId => profitMap.get(jobId) == null);
}

export function jobProfitSummaryRequestKey(jobIds: number[], financialKey: number): string {
  return `${jobIds.join(",")}:${financialKey}`;
}

export function jobPaymentSummaryRefreshReducer(
  state: JobPaymentSummaryRefreshState,
  action: JobPaymentSummaryRefreshAction,
): JobPaymentSummaryRefreshState {
  if (action.type === "worker-payment-recorded" || action.type === "profit-source-changed") {
    return { ...state, financialKey: state.financialKey + 1 };
  }

  return {
    invoiceKey: state.invoiceKey + 1,
    financialKey: state.financialKey + 1,
  };
}