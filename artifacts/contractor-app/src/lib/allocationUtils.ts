/**
 * Frontend mirror of server-side computeSubOwed (lib/allocation.ts).
 *
 * Determines the owed amount for a single sub row given the job's split pool.
 *
 * Rules (same as server):
 * - Manual amountOwed override wins for all types.
 * - fixed      → fixedAmount
 * - allocation → splitPool × (allocationPct / 100); null when allocationPct missing
 * - hourly     → computedOwed (pre-fetched hours × rate from server)
 *
 * Returns null when the amount is genuinely unknowable (e.g. allocation sub with
 * no allocationPct, or hourly sub with no hours logged yet).
 */
export function computeSubOwed(
  sub: {
    compensationType: string | null;
    amountOwed: number | null;
    fixedAmount?: number | null;
    allocationPct: number | null;
    computedOwed?: number | null;
  },
  splitPool: number,
): number | null {
  if (sub.amountOwed != null) return sub.amountOwed;
  const compType = sub.compensationType ?? "hourly";
  if (compType === "fixed") return sub.fixedAmount ?? 0;
  if (compType === "allocation") {
    if (sub.allocationPct == null) return null;
    return splitPool * (sub.allocationPct / 100);
  }
  // hourly — server pre-fetches hours × rate into computedOwed
  if (sub.computedOwed != null) return sub.computedOwed;
  return null;
}
