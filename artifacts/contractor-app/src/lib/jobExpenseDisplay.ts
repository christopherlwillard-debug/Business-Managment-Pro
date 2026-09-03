type JobCostDetail = {
  amount: number | string;
  informational?: boolean;
  includedInJobCosts?: boolean;
};

export function sumIncludedJobCostDetails(items: JobCostDetail[]): number {
  return items.reduce((sum, item) => {
    if (item.includedInJobCosts === false) return sum;
    const amount = Number(item.amount);
    return Number.isFinite(amount) ? sum + amount : sum;
  }, 0);
}