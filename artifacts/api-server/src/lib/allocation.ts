import { db } from "@workspace/db";
import { invoicesTable, expensesTable, jobSubHoursTable } from "@workspace/db/schema";
import { and, inArray, isNull, sql } from "drizzle-orm";

export interface AllocationSplitPool {
  revenue: number;
  expenses: number;
  subLaborCost: number;
  growthReserve: number;
  splitPool: number;
}

const GROWTH_RESERVE_PCT = 0.05;

/**
 * Batch variant — primary implementation, avoids N+1 queries.
 * Computes the allocation split pool for each jobId using the same formula as
 * GET /:id/profit:
 *   grossInvoiced (ALL invoices, not just paid)
 *   - jobExpenses  (non-Owner-Draw, non-Subcontractor category)
 *   - subLaborCost (hours×rate if any hours exist, else Subcontractor-category expenses)
 *   → afterWorkers × 0.95  (5% growth reserve withheld)
 *
 * Callers must filter to `isNull(expensesTable.jobSubHoursId)` already handled
 * internally so auto-linked sub-hour expenses are never double-counted.
 */
export async function computeAllocationSplitPools(
  jobIds: number[],
): Promise<Map<number, AllocationSplitPool>> {
  if (jobIds.length === 0) return new Map();

  const [poolInvs, poolExps, poolHours] = await Promise.all([
    db
      .select({ jobId: invoicesTable.jobId, total: invoicesTable.total })
      .from(invoicesTable)
      .where(inArray(invoicesTable.jobId, jobIds)),
    db
      .select({
        jobId: expensesTable.jobId,
        amount: expensesTable.amount,
        category: expensesTable.category,
      })
      .from(expensesTable)
      .where(
        and(
          inArray(expensesTable.jobId, jobIds),
          isNull(expensesTable.jobSubHoursId),
        ),
      ),
    db
      .select({
        jobId: jobSubHoursTable.jobId,
        total: sql<string>`COALESCE(SUM(${jobSubHoursTable.hours} * COALESCE(${jobSubHoursTable.rateSnapshot}, 0)), 0)`,
      })
      .from(jobSubHoursTable)
      .where(inArray(jobSubHoursTable.jobId, jobIds))
      .groupBy(jobSubHoursTable.jobId),
  ]);

  const hoursMap = new Map(
    poolHours.map((r) => [r.jobId, parseFloat(r.total ?? "0")]),
  );

  const result = new Map<number, AllocationSplitPool>();
  for (const jobId of jobIds) {
    const revenue = poolInvs
      .filter((i) => i.jobId === jobId)
      .reduce((s, i) => s + parseFloat(i.total ?? "0"), 0);

    let expenses = 0;
    let flatSubCost = 0;
    for (const exp of poolExps.filter((e) => e.jobId === jobId)) {
      if (exp.category === "Owner Draw") continue;
      if (exp.category === "Subcontractor") {
        flatSubCost += parseFloat(exp.amount ?? "0");
      } else {
        expenses += parseFloat(exp.amount ?? "0");
      }
    }

    const hoursLaborCost = hoursMap.get(jobId) ?? 0;
    const subLaborCost = hoursLaborCost > 0 ? hoursLaborCost : flatSubCost;
    const income = Math.max(0, revenue - expenses);
    const afterWorkers = Math.max(0, income - subLaborCost);
    const growthReserve = afterWorkers * GROWTH_RESERVE_PCT;
    const splitPool = Math.max(0, afterWorkers - growthReserve);

    result.set(jobId, { revenue, expenses, subLaborCost, growthReserve, splitPool });
  }

  return result;
}

/**
 * Single-job wrapper — delegates to the batch implementation.
 */
export async function computeAllocationSplitPool(
  jobId: number,
): Promise<AllocationSplitPool> {
  const map = await computeAllocationSplitPools([jobId]);
  return (
    map.get(jobId) ?? {
      revenue: 0,
      expenses: 0,
      subLaborCost: 0,
      growthReserve: 0,
      splitPool: 0,
    }
  );
}
