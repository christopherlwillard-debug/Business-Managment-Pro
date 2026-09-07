import { db } from "@workspace/db";
import {
  expensesTable,
  invoicesTable,
  jobExpenseAllocationsTable,
  jobMileageReimbursementsTable,
  jobSubcontractorsTable,
  jobSubHoursTable,
  jobsTable,
  otherIncomeTable,
  subPaymentRecordsTable,
} from "@workspace/db/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { calculateJobProfit, type JobProfitAllocationRow, type JobProfitCalculation, type JobProfitExpenseRow } from "./job-profit.js";

export type LoadedJobProfit = {
  calculation: JobProfitCalculation;
  expenses: JobProfitExpenseRow[];
  allocations: (JobProfitAllocationRow & { category?: string | null })[];
  invoiceStatus: string;
  includeMileageInJobCosts: boolean;
  totalSubHours: number;
  manHours: number | null;
};

/**
 * Loads every source used by the canonical per-job profit calculation and
 * keeps each source keyed by job before calculating. This is intentionally
 * shared by report/export consumers so a route cannot accidentally apply a
 * global payroll or expense aggregate to every job.
 */
export async function loadJobProfitByJob(jobIds: number[]): Promise<Map<number, LoadedJobProfit>> {
  if (jobIds.length === 0) return new Map();

  const [
    invoiceRows,
    otherIncomeRows,
    expenseRows,
    allocationRows,
    reimbursementRows,
    hourlyRows,
    hoursCountRows,
    jobRows,
    paymentRows,
    accruedBonusRows,
  ] = await Promise.all([
    db.select({
      jobId: invoicesTable.jobId,
      total: invoicesTable.total,
      status: invoicesTable.status,
    })
      .from(invoicesTable)
      .where(and(inArray(invoicesTable.jobId, jobIds), isNull(invoicesTable.voidedAt))),
    db.select({
      jobId: otherIncomeTable.jobId,
      amount: otherIncomeTable.amount,
    })
      .from(otherIncomeTable)
      .where(and(inArray(otherIncomeTable.jobId, jobIds), isNull(otherIncomeTable.voidedAt))),
    db.select({
      jobId: expensesTable.jobId,
      id: expensesTable.id,
      amount: expensesTable.amount,
      category: expensesTable.category,
      subcontractorId: expensesTable.subcontractorId,
      countsTowardJobProfit: expensesTable.countsTowardJobProfit,
      tripId: expensesTable.tripId,
    })
      .from(expensesTable)
      .where(and(
        inArray(expensesTable.jobId, jobIds),
        isNull(expensesTable.jobSubHoursId),
        isNull(expensesTable.voidedAt),
      )),
    db.select({
      jobId: jobExpenseAllocationsTable.jobId,
      expenseId: jobExpenseAllocationsTable.expenseId,
      amount: jobExpenseAllocationsTable.amount,
      category: expensesTable.category,
    })
      .from(jobExpenseAllocationsTable)
      .innerJoin(expensesTable, eq(jobExpenseAllocationsTable.expenseId, expensesTable.id))
      .where(and(
        inArray(jobExpenseAllocationsTable.jobId, jobIds),
        isNull(expensesTable.voidedAt),
      )),
    db.select({
      jobId: jobMileageReimbursementsTable.jobId,
      amount: jobMileageReimbursementsTable.amount,
    })
      .from(jobMileageReimbursementsTable)
      .where(inArray(jobMileageReimbursementsTable.jobId, jobIds)),
    db.select({
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
    db.select({
      jobId: jobSubHoursTable.jobId,
      totalHours: sql<string>`COALESCE(SUM(${jobSubHoursTable.hours}), 0)`,
    })
      .from(jobSubHoursTable)
      .where(inArray(jobSubHoursTable.jobId, jobIds))
      .groupBy(jobSubHoursTable.jobId),
    db.select({
      id: jobsTable.id,
      manHours: jobsTable.manHours,
      includeMileageInJobCosts: jobsTable.includeMileageInJobCosts,
    })
      .from(jobsTable)
      .where(inArray(jobsTable.id, jobIds)),
    db.select({
      jobId: subPaymentRecordsTable.jobId,
      compType: jobSubcontractorsTable.compensationType,
      total: sql<string>`COALESCE(SUM(
        ${subPaymentRecordsTable.amount} + COALESCE(${subPaymentRecordsTable.advanceAmount}, 0)
      ), 0)`,
    })
      .from(subPaymentRecordsTable)
      .innerJoin(jobSubcontractorsTable, and(
        eq(jobSubcontractorsTable.jobId, subPaymentRecordsTable.jobId),
        eq(jobSubcontractorsTable.subcontractorId, subPaymentRecordsTable.subcontractorId),
      ))
      .where(and(
        inArray(subPaymentRecordsTable.jobId, jobIds),
        sql`${subPaymentRecordsTable.isReversal} IS NOT TRUE`,
        sql`${jobSubcontractorsTable.compensationType} IN ('fixed', 'allocation')`,
      ))
      .groupBy(subPaymentRecordsTable.jobId, jobSubcontractorsTable.compensationType),
    db.select({
      jobId: jobSubcontractorsTable.jobId,
      total: sql<string>`COALESCE(SUM(${jobSubcontractorsTable.accruedBonus}), 0)`,
    })
      .from(jobSubcontractorsTable)
      .where(inArray(jobSubcontractorsTable.jobId, jobIds))
      .groupBy(jobSubcontractorsTable.jobId),
  ]);

  const byJob = new Map<number, LoadedJobProfit>();
  const invoiceStatusRank: Record<string, number> = { paid: 4, overdue: 3, sent: 2, draft: 1 };
  const hoursMap = new Map(hourlyRows.map((row) => [row.jobId, Number(row.total ?? 0)]));
  const hoursCountMap = new Map(hoursCountRows.map((row) => [row.jobId, Number(row.totalHours ?? 0)]));
  const accruedBonusMap = new Map(accruedBonusRows.map((row) => [row.jobId, Number(row.total ?? 0)]));
  const fixedPaymentMap = new Map<number, number>();
  const allocationPaymentMap = new Map<number, number>();
  for (const row of paymentRows) {
    const total = Number(row.total ?? 0);
    if (row.compType === "fixed") {
      fixedPaymentMap.set(row.jobId, (fixedPaymentMap.get(row.jobId) ?? 0) + total);
    } else if (row.compType === "allocation") {
      allocationPaymentMap.set(row.jobId, (allocationPaymentMap.get(row.jobId) ?? 0) + total);
    }
  }
  const jobSettings = new Map(jobRows.map((row) => [
    row.id,
    {
      includeMileageInJobCosts: row.includeMileageInJobCosts !== false,
      manHours: row.manHours == null ? null : Number(row.manHours),
    },
  ]));

  for (const jobId of jobIds) {
    const expenses = expenseRows
      .filter((row) => row.jobId === jobId)
      .map(({ jobId: _jobId, ...row }) => row);
    const allocations = allocationRows
      .filter((row) => row.jobId === jobId)
      .map(({ jobId: _jobId, ...row }) => row);
    const reimbursement = reimbursementRows.find((row) => row.jobId === jobId);
    const settings = jobSettings.get(jobId);
    const invoiceStatus = invoiceRows
      .filter((row) => row.jobId === jobId)
      .reduce((best, row) =>
        (invoiceStatusRank[row.status ?? "draft"] ?? 0) > (invoiceStatusRank[best] ?? 0)
          ? row.status ?? best
          : best, "draft");
    const calculation = calculateJobProfit({
      invoices: invoiceRows.filter((row) => row.jobId === jobId),
      otherIncome: otherIncomeRows.filter((row) => row.jobId === jobId),
      expenses,
      allocations,
      mileageReimbursement: reimbursement?.amount == null ? null : Number(reimbursement.amount),
      hasMileageReimbursement: reimbursement != null,
      includeMileageInJobCosts: settings?.includeMileageInJobCosts ?? true,
      hasActualFuelExpense: expenses.some(
        (row) => row.category === "Fuel/Travel" && row.countsTowardJobProfit !== false,
      ),
      hourlyLaborCost: hoursMap.get(jobId) ?? 0,
      totalSubHours: hoursCountMap.get(jobId) ?? 0,
      fixedSubCost: fixedPaymentMap.get(jobId) ?? 0,
      accruedBonus: accruedBonusMap.get(jobId) ?? 0,
      allocPaid: allocationPaymentMap.get(jobId) ?? 0,
    });
    byJob.set(jobId, {
      calculation,
      expenses,
      allocations,
      invoiceStatus,
      includeMileageInJobCosts: settings?.includeMileageInJobCosts ?? true,
      totalSubHours: hoursCountMap.get(jobId) ?? 0,
      manHours: settings?.manHours ?? null,
    });
  }

  return byJob;
}