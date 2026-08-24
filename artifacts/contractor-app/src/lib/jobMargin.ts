export function calculateJobMargin(netProfit: number, collected: number): number | null {
  return collected > 0 ? Math.round((netProfit / collected) * 100) : null;
}