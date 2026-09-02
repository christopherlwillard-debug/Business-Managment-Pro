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