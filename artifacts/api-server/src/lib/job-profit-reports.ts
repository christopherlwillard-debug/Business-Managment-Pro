import type { LoadedJobProfit } from "./job-profit-loader.js";
import { calculateAllocationSplitPool } from "./allocation.js";

export type ClosedJobExportSource = {
  dateOpened: string | null;
  dateClosed: string | null;
  jobNumber: number | null;
  businessLine: string | null;
  jobName: string;
  customer: string;
  location: string;
  invoiceStatus: string;
  subStatus: string;
};

export function buildClosedJobExportRow(
  job: ClosedJobExportSource,
  loaded: LoadedJobProfit,
) {
  const allocationExpenseIds = new Set(
    loaded.allocations
      .map((row) => row.expenseId)
      .filter((id): id is number => id != null),
  );
  const materials = loaded.expenses
    .filter((expense) =>
      expense.category?.toLowerCase() === "materials"
      && expense.id != null
      && !allocationExpenseIds.has(expense.id)
      && expense.subcontractorId == null
      && expense.countsTowardJobProfit !== false,
    )
    .reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0)
    + loaded.allocations
      .filter((allocation) => allocation.category?.toLowerCase() === "materials")
      .reduce((sum, allocation) => sum + Number(allocation.amount ?? 0), 0);
  const directLabor = loaded.expenses
    .filter((expense) =>
      expense.category?.toLowerCase() === "labor"
      && expense.id != null
      && !allocationExpenseIds.has(expense.id)
      && expense.subcontractorId == null
      && expense.countsTowardJobProfit !== false,
    )
    .reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0);
  const labor = directLabor + loaded.calculation.subLaborCost + loaded.calculation.allocPaid;
  const dateOpened = job.dateOpened ?? "";
  const dateClosed = job.dateClosed ?? "";
  const daysOpen = dateOpened && dateClosed
    ? Math.max(0, Math.round(
      (new Date(dateClosed).getTime() - new Date(dateOpened).getTime()) / (1000 * 60 * 60 * 24),
    ))
    : 0;

  return {
    ...job,
    dateOpened,
    dateClosed,
    daysOpen,
    jobNumber: job.jobNumber ?? 0,
    businessLine: job.businessLine ?? "",
    revenue: loaded.calculation.grossInvoiced,
    materials,
    labor,
    netProfit: loaded.calculation.netProfit,
  };
}

export function calculateOwnerPayFromJobProfit(
  loaded: LoadedJobProfit,
  allocationPct: number,
  growthReservePct: number,
  taxReservePct: number,
) {
  const split = calculateAllocationSplitPool({
    revenue: loaded.calculation.grossInvoiced,
    directExpenses: loaded.calculation.jobExpenses,
    allocatedExpenses: 0,
    subLaborCost: loaded.calculation.subLaborCost,
    growthReservePct,
  });
  const ownerPct = allocationPct > 0 ? Math.max(0, 100 - allocationPct) : 100;
  const ownerShare = split.splitPool * ownerPct / 100;
  const taxReserve = ownerShare * Math.max(0, taxReservePct) / 100;

  return {
    revenue: loaded.calculation.grossInvoiced,
    splitPool: split.splitPool,
    ownerShare,
    taxReserve,
    takeHome: ownerShare - taxReserve,
  };
}