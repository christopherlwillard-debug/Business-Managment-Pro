export type JobFinancialWaterfallInput = {
  revenue: number;
  jobExpenses: number;
  mileageReimbursementCost: number;
  subLaborCost: number;
  hourlyFixedCost?: number;
  allocationPcts: number[];
  growthReservePct: number;
  ownerSplitPct: number;
  taxReservePct: number;
  /**
   * The server's job-scoped allocation pool. When present, it is authoritative
   * for the normal (gross revenue) waterfall; the local calculation remains a
   * fallback for collected-revenue preview mode and older responses.
   */
  authoritativeSplitPool?: number;
};

export function formatJobFinancialAmount(
  value: number | null | undefined,
  formatter: (amount: number) => string,
): string {
  return value == null ? "Unavailable" : formatter(value);
}

export function jobFinancialSummaryDetail(
  value: number | null | undefined,
  unavailableReason: string | null | undefined,
  availableDetail: string,
): string | null {
  return value == null ? unavailableReason ?? null : availableDetail;
}

export type OwnerReimbursementInput = {
  ownerTakeHome: number;
  includeMileageInJobCosts: boolean;
  mileageReimbursementApplied?: boolean;
  savedReimbursement?: {
    amount: number;
    recipientType: "owner" | "subcontractor" | "other";
    status: "owed" | "paid";
  } | null;
  estimatedFuelCost?: number | null;
};

export function calculateOwnerReimbursement(input: OwnerReimbursementInput) {
  const eligible = input.includeMileageInJobCosts && input.mileageReimbursementApplied !== false;
  const saved = input.savedReimbursement;
  const isSavedOwnerReimbursement = saved?.recipientType === "owner";
  const isAutomaticOwnerReimbursement = saved == null;
  const amount = !eligible
    ? 0
    : isSavedOwnerReimbursement
      ? Math.max(0, saved.amount)
      : isAutomaticOwnerReimbursement
        ? Math.max(0, input.estimatedFuelCost ?? 0)
        : 0;
  const isPaid = isSavedOwnerReimbursement && saved.status === "paid";
  const outstanding = isPaid ? 0 : amount;

  return {
    amount,
    outstanding,
    totalOwnerSettlement: input.ownerTakeHome + outstanding,
    isAutomatic: isAutomaticOwnerReimbursement && amount > 0,
    isPaid,
  };
}

export type CanonicalJobProfitRow = {
  grossInvoiced: number;
  collected: number;
  includedCostTotal: number;
  netProfit: number;
};

export function aggregateCanonicalJobProfit(rows: readonly CanonicalJobProfitRow[]) {
  return rows.reduce(
    (totals, row) => ({
      totalInvoiced: totals.totalInvoiced + row.grossInvoiced,
      totalCollected: totals.totalCollected + row.collected,
      totalIncludedCosts: totals.totalIncludedCosts + row.includedCostTotal,
      totalNetProfit: totals.totalNetProfit + row.netProfit,
      jobsWithInvoice: totals.jobsWithInvoice + (row.grossInvoiced > 0 ? 1 : 0),
    }),
    {
      totalInvoiced: 0,
      totalCollected: 0,
      totalIncludedCosts: 0,
      totalNetProfit: 0,
      jobsWithInvoice: 0,
    },
  );
}

export function calculateJobFinancialWaterfall(input: JobFinancialWaterfallInput) {
  // Every amount shown under Job Costs reduces the percentage split pool.
  // mileageReimbursementCost remains in the input contract for callers that
  // display its breakdown, but it is already included in jobExpenses.
  const splitEligibleExpenses = Math.max(0, input.jobExpenses);
  const splitIncome = Math.max(0, input.revenue - splitEligibleExpenses);
  const reportedJobIncome = Math.max(0, input.revenue - input.jobExpenses);
  // When payment rows are loaded, hourlyFixedCost is the authoritative agreed
  // amount (including fixed workers). Do not let a historical hours×rate total
  // override a saved job-level payout.
  const hourlyWorkers = Math.max(0, input.hourlyFixedCost ?? input.subLaborCost);
  // Agreed waterfall: revenue → all job costs → growth reserve → hourly labor → split.
  const growthReserve = splitIncome * (Math.max(0, input.growthReservePct) / 100);
  const afterGrowth = Math.max(0, splitIncome - growthReserve);
  const afterWorkers = Math.max(0, afterGrowth - hourlyWorkers);
  const toSplit = input.authoritativeSplitPool == null
    ? afterWorkers
    : Math.max(0, input.authoritativeSplitPool);
  const totalAllocPct = input.allocationPcts.reduce((sum, pct) => sum + pct, 0);
  const hasAllocations = input.allocationPcts.length > 0;
  const ownerPct = hasAllocations ? Math.max(0, 100 - totalAllocPct) : input.ownerSplitPct;
  const ownerShare = toSplit * (ownerPct / 100);
  const subShare = toSplit * ((100 - ownerPct) / 100);
  const taxReserve = ownerShare * (input.taxReservePct / 100);

  return {
    splitEligibleExpenses,
    jobIncome: reportedJobIncome,
    splitIncome,
    afterGrowth,
    hourlyWorkers,
    afterWorkers,
    growthReserve,
    toSplit,
    totalAllocPct,
    ownerPct,
    ownerShare,
    subShare,
    taxReserve,
    ownerTakeHome: ownerShare - taxReserve,
    allocationWarning: hasAllocations && totalAllocPct > 100.5,
  };
}