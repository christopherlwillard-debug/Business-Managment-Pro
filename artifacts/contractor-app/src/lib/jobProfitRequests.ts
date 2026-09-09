import type {
  JobProfitMileageReimbursement,
  JobProfitResponse,
} from "@workspace/api-client-react";

export function canApplyJobResponse(
  requestKey: number,
  currentKey: number,
  requestedJobId: number,
  currentJobId: number,
): boolean {
  return requestKey === currentKey && requestedJobId === currentJobId;
}

export function isAbortError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "name" in error
    && (error as { name?: unknown }).name === "AbortError";
}

export type JobProfitRefreshState<T> = {
  loading: boolean;
  profit: T | null;
  profitError: boolean;
};

export function startJobProfitRefresh<T>(): JobProfitRefreshState<T> {
  return {
    loading: true,
    profit: null,
    profitError: false,
  };
}

export type JobProfitRefreshInput<T> = {
  requestKey: number;
  currentRequestKey: number;
  requestedJobId: number;
  currentJobId: number;
  response:
    | { status: "fulfilled"; value: T | null | undefined }
    | { status: "rejected" };
};

export function applyJobProfitRefresh<T>(
  state: JobProfitRefreshState<T>,
  input: JobProfitRefreshInput<T>,
): JobProfitRefreshState<T> {
  if (!canApplyJobResponse(
    input.requestKey,
    input.currentRequestKey,
    input.requestedJobId,
    input.currentJobId,
  )) {
    return state;
  }

  if (input.response.status === "fulfilled" && input.response.value != null) {
    return {
      loading: false,
      profit: input.response.value,
      profitError: false,
    };
  }

  return {
    loading: false,
    profit: null,
    profitError: true,
  };
}

/**
 * The detail endpoint returns a saved reimbursement record, while the batch
 * endpoint keeps the historical numeric representation for compatibility.
 * Only the saved record can populate the reimbursement editor.
 */
export function getSavedMileageReimbursement(
  profit: JobProfitResponse | null | undefined,
): JobProfitMileageReimbursement | null {
  const reimbursement = profit?.mileageReimbursement;
  return reimbursement && typeof reimbursement === "object" ? reimbursement : null;
}