export type JobFuelReconciliation =
  | "estimate_only"
  | "reimbursement_matches_estimate"
  | "reimbursement_differs_from_estimate"
  | "reimbursement_without_estimate"
  | "actual_fuel_expense"
  | "actual_fuel_expense_replaces_reimbursement"
  | "excluded_from_job_costs"
  | "estimate_unavailable";

type JobFuelReconciliationInput = {
  includeMileageInJobCosts: boolean;
  hasActualFuelExpense: boolean;
  reimbursementAmount: number | null;
  estimatedFuelCost: number | null;
};

export function resolveJobFuelReconciliation({
  includeMileageInJobCosts,
  hasActualFuelExpense,
  reimbursementAmount,
  estimatedFuelCost,
}: JobFuelReconciliationInput): JobFuelReconciliation {
  if (!includeMileageInJobCosts) return "excluded_from_job_costs";
  if (hasActualFuelExpense) {
    return reimbursementAmount != null
      ? "actual_fuel_expense_replaces_reimbursement"
      : "actual_fuel_expense";
  }
  if (reimbursementAmount != null) {
    if (estimatedFuelCost == null) return "reimbursement_without_estimate";
    return Math.abs(reimbursementAmount - estimatedFuelCost) < 0.005
      ? "reimbursement_matches_estimate"
      : "reimbursement_differs_from_estimate";
  }
  return estimatedFuelCost != null ? "estimate_only" : "estimate_unavailable";
}