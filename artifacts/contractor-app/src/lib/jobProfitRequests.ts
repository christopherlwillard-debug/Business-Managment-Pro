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