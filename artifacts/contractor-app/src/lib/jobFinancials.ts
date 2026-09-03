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
  const toSplit = afterWorkers;
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