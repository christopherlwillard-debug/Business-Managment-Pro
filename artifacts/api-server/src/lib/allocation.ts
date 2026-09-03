import { db } from "@workspace/db";
import { isOwnerWithdrawalExpenseCategory } from "./owner-withdrawals.js";
import {
  invoicesTable,
  otherIncomeTable,
  expensesTable,
  jobExpenseAllocationsTable,
  jobMileageReimbursementsTable,
  jobSubcontractorsTable,
  jobsTable,
  subPaymentRecordsTable,
  settingsTable,
} from "@workspace/db/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

export interface AllocationSplitPool {
  revenue: number;
  expenses: number;
  subLaborCost: number;
  growthReservePct: number;
  growthReserve: number;
  splitPool: number;
}

export function calculateAllocationSplitPool(input: {
  revenue: number;
  directExpenses: number;
  allocatedExpenses: number;
  subLaborCost: number;
  growthReservePct: number;
}): AllocationSplitPool {
  const expenses = input.directExpenses + input.allocatedExpenses;
  const income = Math.max(0, input.revenue - expenses);
  const growthReserve = income * (Math.max(0, input.growthReservePct) / 100);
  const afterGrowth = Math.max(0, income - growthReserve);
  const splitPool = Math.max(0, afterGrowth - input.subLaborCost);

  return {
    revenue: input.revenue,
    expenses,
    subLaborCost: input.subLaborCost,
    growthReservePct: Math.max(0, input.growthReservePct),
    growthReserve,
    splitPool,
  };
}

/**
 * Batch variant — primary implementation, avoids N+1 queries.
 * Computes the allocation split pool for each jobId using the same formula as
 * GET /:id/profit:
 *   grossInvoiced (ALL invoices, not just paid) + job-linked other income
 *   - jobExpenses  (non-Owner-Draw, non-Subcontractor category)
 *   - subLaborCost (hourly labor + fixed payroll ledger payments + accrued bonuses;
 *     legacy Subcontractor-category expenses are used only when no tracked labor or
 *     fixed payroll exists)
 *   - configured percentage of income after all job costs (growth reserve)
 *
 * Callers must filter to `isNull(expensesTable.jobSubHoursId)` already handled
 * internally so auto-linked sub-hour expenses are never double-counted.
 */
export async function computeAllocationSplitPools(
  jobIds: number[],
): Promise<Map<number, AllocationSplitPool>> {
  if (jobIds.length === 0) return new Map();

  const [poolInvs, poolOtherIncome, poolExps, poolAllocatedExps, poolReimbursements, poolJobs, poolHours, poolFixedPayments, poolAccruedBonuses, settingsRows] = await Promise.all([
    db
      .select({ jobId: invoicesTable.jobId, total: invoicesTable.total })
      .from(invoicesTable)
      .where(inArray(invoicesTable.jobId, jobIds)),
    db
      .select({ jobId: otherIncomeTable.jobId, amount: otherIncomeTable.amount })
      .from(otherIncomeTable)
      .where(and(inArray(otherIncomeTable.jobId, jobIds), isNull(otherIncomeTable.voidedAt))),
    db
      .select({
        jobId: expensesTable.jobId,
        amount: expensesTable.amount,
        category: expensesTable.category,
        subcontractorId: expensesTable.subcontractorId,
        countsTowardJobProfit: expensesTable.countsTowardJobProfit,
        voidedAt: expensesTable.voidedAt,
      })
      .from(expensesTable)
      .where(
        and(
          inArray(expensesTable.jobId, jobIds),
          isNull(expensesTable.jobSubHoursId),
          isNull(expensesTable.voidedAt),
        ),
      ),
    db
      .select({
        jobId: jobExpenseAllocationsTable.jobId,
        amount: jobExpenseAllocationsTable.amount,
      })
      .from(jobExpenseAllocationsTable)
      .innerJoin(expensesTable, eq(jobExpenseAllocationsTable.expenseId, expensesTable.id))
      .where(
        and(
          inArray(jobExpenseAllocationsTable.jobId, jobIds),
          isNull(expensesTable.voidedAt),
        ),
      ),
    db
      .select({
        jobId: jobMileageReimbursementsTable.jobId,
        amount: jobMileageReimbursementsTable.amount,
      })
      .from(jobMileageReimbursementsTable)
      .where(inArray(jobMileageReimbursementsTable.jobId, jobIds)),
    db
      .select({
        id: jobsTable.id,
        includeMileageInJobCosts: jobsTable.includeMileageInJobCosts,
      })
      .from(jobsTable)
      .where(inArray(jobsTable.id, jobIds)),
    db
      .select({
        jobId: jobSubcontractorsTable.jobId,
        total: sql<string>`COALESCE(SUM(
          CASE
            WHEN ${jobSubcontractorsTable.compensationType} = 'hourly'
              AND ${jobSubcontractorsTable.amountOwed} IS NOT NULL
            THEN ${jobSubcontractorsTable.amountOwed}
            WHEN ${jobSubcontractorsTable.compensationType} = 'hourly'
            THEN COALESCE((
              SELECT SUM(h.hours * COALESCE(h.rate_snapshot, 0))
              FROM job_sub_hours h
              WHERE h.job_id = ${jobSubcontractorsTable.jobId}
                AND h.subcontractor_id = ${jobSubcontractorsTable.subcontractorId}
            ), 0)
            ELSE 0
          END
        ), 0)`,
      })
      .from(jobSubcontractorsTable)
      .where(inArray(jobSubcontractorsTable.jobId, jobIds))
      .groupBy(jobSubcontractorsTable.jobId),
    db
      .select({
        jobId: subPaymentRecordsTable.jobId,
        total: sql<string>`COALESCE(SUM(${subPaymentRecordsTable.amount}), 0)`,
      })
      .from(subPaymentRecordsTable)
      .innerJoin(jobSubcontractorsTable, and(
        eq(subPaymentRecordsTable.jobId, jobSubcontractorsTable.jobId),
        eq(subPaymentRecordsTable.subcontractorId, jobSubcontractorsTable.subcontractorId),
        eq(jobSubcontractorsTable.compensationType, "fixed"),
      ))
      .where(and(
        inArray(subPaymentRecordsTable.jobId, jobIds),
        sql`${subPaymentRecordsTable.isReversal} IS NOT TRUE`,
      ))
      .groupBy(subPaymentRecordsTable.jobId),
    db
      .select({
        jobId: jobSubcontractorsTable.jobId,
        total: sql<string>`COALESCE(SUM(${jobSubcontractorsTable.accruedBonus}), 0)`,
      })
      .from(jobSubcontractorsTable)
      .where(inArray(jobSubcontractorsTable.jobId, jobIds))
      .groupBy(jobSubcontractorsTable.jobId),
    db.select({ growthReservePct: settingsTable.growthReservePct }).from(settingsTable).limit(1),
  ]);
  const growthReservePct = settingsRows[0]?.growthReservePct != null
    ? parseFloat(String(settingsRows[0].growthReservePct))
    : 5;

  const hoursMap = new Map(
    poolHours.map((r) => [r.jobId, parseFloat(r.total ?? "0")]),
  );
  const fixedPaymentMap = new Map(
    poolFixedPayments.map((r) => [r.jobId, parseFloat(r.total ?? "0")]),
  );
  const accruedBonusMap = new Map(
    poolAccruedBonuses.map((r) => [r.jobId, parseFloat(r.total ?? "0")]),
  );
  const allocatedExpenseMap = new Map<number, number>();
  for (const row of poolAllocatedExps) {
    allocatedExpenseMap.set(
      row.jobId,
      (allocatedExpenseMap.get(row.jobId) ?? 0) + parseFloat(row.amount ?? "0"),
    );
  }
  const reimbursementMap = new Map(
    poolReimbursements.map((row) => [row.jobId, parseFloat(row.amount ?? "0")]),
  );
  const includeMileageMap = new Map(
    poolJobs.map((row) => [row.id, row.includeMileageInJobCosts !== false]),
  );

  const result = new Map<number, AllocationSplitPool>();
  for (const jobId of jobIds) {
    const invoiceRevenue = poolInvs
      .filter((i) => i.jobId === jobId)
      .reduce((s, i) => s + parseFloat(i.total ?? "0"), 0);
    const otherIncome = poolOtherIncome
      .filter((income) => income.jobId === jobId)
      .reduce((s, income) => s + parseFloat(income.amount ?? "0"), 0);
    const revenue = invoiceRevenue + otherIncome;

    let expenses = 0;
    let flatSubCost = 0;
    for (const exp of poolExps.filter((e) => e.jobId === jobId)) {
      // Payroll-linked expense rows are legacy duplicates, not operating costs.
      if (exp.subcontractorId != null) continue;
       if (isOwnerWithdrawalExpenseCategory(exp.category)) continue;
      if (exp.countsTowardJobProfit === false) continue;
      if (exp.category === "Subcontractor") {
        flatSubCost += parseFloat(exp.amount ?? "0");
      } else {
        expenses += parseFloat(exp.amount ?? "0");
      }
    }
    const hasActualFuelExpense = poolExps.some((expense) =>
      expense.jobId === jobId
      && expense.category === "Fuel/Travel"
      && expense.countsTowardJobProfit !== false
    );
    if (
      includeMileageMap.get(jobId) !== false
      && !hasActualFuelExpense
      && reimbursementMap.has(jobId)
    ) {
      expenses += reimbursementMap.get(jobId) ?? 0;
    }

    const hoursLaborCost = hoursMap.get(jobId) ?? 0;
    const fixedPaymentCost = fixedPaymentMap.get(jobId) ?? 0;
    const accruedBonusCost = accruedBonusMap.get(jobId) ?? 0;
    const nonHoursCost = fixedPaymentCost > 0
      ? fixedPaymentCost
      : (hoursLaborCost > 0 ? 0 : flatSubCost);
    const subLaborCost = hoursLaborCost + nonHoursCost + accruedBonusCost;
    result.set(jobId, calculateAllocationSplitPool({
      revenue,
      directExpenses: expenses,
      allocatedExpenses: allocatedExpenseMap.get(jobId) ?? 0,
      subLaborCost,
      growthReservePct,
    }));
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
      growthReservePct: 5,
      growthReserve: 0,
      splitPool: 0,
    }
  );
}

// ── Sub-owed helper ────────────────────────────────────────────────────────────

export interface SubOwedInput {
  compensationType: string | null;
  amountOwed: string | null;       // manual override — authoritative when set
  fixedAmount: string | null;
  allocationPct: string | null;
  computedOwed?: string | null;    // pre-fetched hours×rate total for hourly subs
}

/**
 * Returns the owed amount for a single sub row.
 *
 * - Manual amountOwed override wins for all types.
 * - fixed  → fixedAmount
 * - allocation → splitPool × (allocationPct / 100); null when allocationPct missing
 * - hourly → computedOwed (caller must pre-fetch hours×rate and pass it here)
 *
 * Epsilon for "paid enough": callers should use `paid >= owed - 0.01`.
 */
export function computeSubOwed(sub: SubOwedInput, splitPool: number): number | null {
  if (sub.amountOwed != null) return parseFloat(sub.amountOwed);
  const compType = sub.compensationType ?? "hourly";
  if (compType === "fixed") return parseFloat(sub.fixedAmount ?? "0");
  if (compType === "allocation") {
    if (sub.allocationPct == null) return null;
    return splitPool * (parseFloat(sub.allocationPct) / 100);
  }
  // hourly — pre-fetched hours total
  if (sub.computedOwed != null) return parseFloat(sub.computedOwed);
  return null;
}
