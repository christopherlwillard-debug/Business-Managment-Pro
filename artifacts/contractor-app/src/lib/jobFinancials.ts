export type JobFinancialWaterfallInput = {
  revenue: number;
  jobExpenses: number;
  mileageReimbursementCost: number;
  subLaborCost: number;
  hourlyFixedCost?: number;
  allocationPcts: number[];
  ownerSplitPct: number;
  taxReservePct: number;
};

export function calculateJobFinancialWaterfall(input: JobFinancialWaterfallInput) {
  const splitEligibleExpenses = Math.max(0, input.jobExpenses - input.mileageReimbursementCost);
  const jobIncome = Math.max(0, input.revenue - splitEligibleExpenses);
  const hourlyWorkers = Math.max(input.subLaborCost, input.hourlyFixedCost ?? 0);
  const afterWorkers = Math.max(0, jobIncome - hourlyWorkers);
  const growthReserve = afterWorkers * 0.05;
  const toSplit = Math.max(0, afterWorkers - growthReserve);
  const totalAllocPct = input.allocationPcts.reduce((sum, pct) => sum + pct, 0);
  const hasAllocations = input.allocationPcts.length > 0;
  const ownerPct = hasAllocations ? Math.max(0, 100 - totalAllocPct) : input.ownerSplitPct;
  const ownerShare = toSplit * (ownerPct / 100);
  const subShare = toSplit * ((100 - ownerPct) / 100);
  const taxReserve = ownerShare * (input.taxReservePct / 100);

  return {
    splitEligibleExpenses,
    jobIncome,
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