export type JobProfitMileageReimbursement = {
  id: number;
  amount: number;
  estimatedAmount: number | null;
  recipientType: "owner" | "subcontractor" | "other";
  recipientName: string;
  recipientSubcontractorId?: number | null;
  status: "owed" | "paid";
  paidAt?: string | null;
  notes?: string | null;
};

export type JobProfitFuelBreakdown = {
  onewayMiles: number;
  roundTripMiles: number;
  daysOnJob: number;
  totalMiles: number;
  fuelGallons: number;
  mpg: number;
  fuelPrice: number;
  routeProvider?: "osrm" | "haversine";
};

export type JobProfitBreakdown = {
  revenue: {
    invoices: number;
    otherIncome: number;
    total: number;
  };
  includedCosts: {
    directExpenses: number;
    allocatedExpenses: number;
    subLabor: number;
    splitPayouts: number;
    mileageReimbursement: number;
    estimatedFuel: number;
    total: number;
  };
  excludedFromProfit: {
    ownerWithdrawals: number;
    auditTrail: number;
    payrollLinkedExpenses: number;
    legacySubcontractorExpense: number;
  };
};

/**
 * Shared wire contract for the per-job and batch profit endpoints.
 *
 * The batch endpoint returns the numeric mileage reimbursement value while the
 * detailed endpoint returns the saved reimbursement record. Both forms are
 * retained here for backwards compatibility with those existing routes.
 */
export type JobProfitResponse = {
  grossInvoiced: number;
  collected: number;
  otherIncomeRevenue: number;
  jobExpenses: number;
  directExpenseTotal: number;
  allocatedExpenseTotal: number;
  mileageReimbursement: number | JobProfitMileageReimbursement | null;
  estimatedFuelCost: number | null;
  actualFuelCost: number | null;
  auditTrailTotal: number;
  tripTravelTotal: number;
  tripMealsDeductible: number;
  ownerDrawTaken: number;
  payrollLinkedExcluded: number;
  legacySubcontractorExpense: number;
  subLaborCost: number;
  allocPaid: number;
  totalSubHours: number;
  netProfit: number;
  includedCostTotal: number;
  profitBreakdown: JobProfitBreakdown;
  splitPool: number;
  manHours?: number | null;
  includeMileageInJobCosts?: boolean;
  mileageReimbursementApplied?: boolean;
  fuelStatus?: "ok" | "missing_address" | "geocoding_failed" | "workdays_missing" | "error";
  fuelReconciliation?:
    | "estimate_only"
    | "reimbursement_matches_estimate"
    | "reimbursement_differs_from_estimate"
    | "reimbursement_without_estimate"
    | "actual_fuel_expense"
    | "actual_fuel_expense_replaces_reimbursement"
    | "excluded_from_job_costs"
    | "estimate_unavailable";
  operationalProfit?: number | null;
  fuelBreakdown?: JobProfitFuelBreakdown | null;
  growthReservePct?: number;
  ownerSplitPct?: number;
  taxReservePct?: number;
};