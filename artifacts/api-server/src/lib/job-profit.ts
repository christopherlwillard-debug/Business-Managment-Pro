import { isOwnerWithdrawalExpenseCategory } from "./owner-withdrawals.js";
import type {
  JobProfitResponse,
} from "@workspace/api-zod";

export type JobProfitExpenseRow = {
  id?: number | null;
  amount: string | number | null;
  category?: string | null;
  description?: string | null;
  subcontractorId?: number | null;
  countsTowardJobProfit?: boolean | null;
  tripId?: number | null;
};

export type JobProfitAllocationRow = {
  id?: number | null;
  expenseId?: number | null;
  amount: string | number | null;
};

export type JobProfitCalculation = {
  grossInvoiced: number;
  collected: number;
  otherIncomeRevenue: number;
  jobExpenses: number;
  directExpenseTotal: number;
  allocatedExpenseTotal: number;
  mileageReimbursement: number;
  estimatedFuelCost: number;
  actualFuelCost: number;
  auditTrailTotal: number;
  tripTravelTotal: number;
  tripMealsDeductible: number;
  ownerDrawTaken: number;
  payrollLinkedExcluded: number;
  legacySubcontractorExpense: number;
  subLaborCost: number;
  allocPaid: number;
  totalSubHours: number;
  netProfit: number;
  includedCostTotal: number;
  profitBreakdown: {
    revenue: {
      invoices: number;
      otherIncome: number;
      total: number;
    };
    includedCosts: {
      directExpenses: number;
      allocatedExpenses: number;
      subLabor: number;
      splitPayouts: number;
      mileageReimbursement: number;
      estimatedFuel: number;
      total: number;
    };
    excludedFromProfit: {
      ownerWithdrawals: number;
      auditTrail: number;
      payrollLinkedExpenses: number;
      legacySubcontractorExpense: number;
      reversedFixedPayouts: number;
      reversedAllocationPayouts: number;
    };
  };
};

export type JobProfitResponseExtras = Pick<JobProfitResponse, "splitPool"> & Partial<
  Pick<
    JobProfitResponse,
    | "mileageReimbursement"
    | "estimatedFuelCost"
    | "actualFuelCost"
    | "manHours"
    | "includeMileageInJobCosts"
    | "mileageReimbursementApplied"
    | "fuelStatus"
    | "fuelReconciliation"
    | "operationalProfit"
    | "fuelBreakdown"
    | "growthReservePct"
    | "ownerSplitPct"
    | "taxReservePct"
  >
>;

/**
 * Builds the shared wire response without allowing a route to omit newly
 * added calculation fields. Route-specific presentation fields can override
 * the internal numeric representations where the existing API requires it
 * (for example, the detailed mileage reimbursement object on the individual
 * endpoint).
 */
export function buildJobProfitResponse(
  calculation: JobProfitCalculation,
  extras: JobProfitResponseExtras,
): JobProfitResponse {
  const {
    mileageReimbursement,
    estimatedFuelCost,
    actualFuelCost,
    ...calculationFields
  } = calculation;

  return {
    ...calculationFields,
    mileageReimbursement,
    estimatedFuelCost,
    actualFuelCost,
    ...extras,
  };
}

type InvoiceRow = {
  total: string | number | null;
  status?: string | null;
};

type OtherIncomeRow = {
  amount: string | number | null;
};

function money(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

export function calculateJobProfit(input: {
  invoices?: InvoiceRow[];
  otherIncome?: OtherIncomeRow[];
  expenses?: JobProfitExpenseRow[];
  allocations?: JobProfitAllocationRow[];
  mileageReimbursement?: number | null;
  hasMileageReimbursement?: boolean;
  estimatedFuelCost?: number | null;
  includeMileageInJobCosts?: boolean;
  hasActualFuelExpense?: boolean;
  hourlyLaborCost?: number;
  totalSubHours?: number;
  fixedSubCost?: number;
  accruedBonus?: number;
  allocPaid?: number;
  reversedFixedPayout?: number;
  reversedAllocationPayout?: number;
}): JobProfitCalculation {
  const invoices = input.invoices ?? [];
  const otherIncome = input.otherIncome ?? [];
  const expenses = input.expenses ?? [];
  const allocations = input.allocations ?? [];
  const allocationExpenseIds = new Set(
    allocations
      .map(row => row.expenseId)
      .filter((id): id is number => id != null),
  );

  const invoiceRevenue = invoices.reduce((sum, row) => sum + money(row.total), 0);
  const otherIncomeRevenue = otherIncome.reduce((sum, row) => sum + money(row.amount), 0);
  const grossInvoiced = invoiceRevenue + otherIncomeRevenue;
  const collected = invoices
    .filter(row => row.status === "paid")
    .reduce((sum, row) => sum + money(row.total), 0) + otherIncomeRevenue;

  let directExpenseTotal = 0;
  let allocatedExpenseTotal = allocations.reduce((sum, row) => sum + money(row.amount), 0);
  let auditTrailTotal = 0;
  let tripTravelTotal = 0;
  let tripMealsDeductible = 0;
  let ownerDrawTaken = 0;
  let payrollLinkedExcluded = 0;
  let legacySubcontractorExpense = 0;
  let actualFuelCost = 0;

  for (const expense of expenses) {
    const amount = money(expense.amount);
    if (expense.id != null && allocationExpenseIds.has(expense.id)) {
      continue;
    }
    if (isOwnerWithdrawalExpenseCategory(expense.category)) {
      ownerDrawTaken += amount;
      continue;
    }
    if (expense.subcontractorId != null) {
      payrollLinkedExcluded += amount;
      continue;
    }
    if (expense.category === "Subcontractor") {
      legacySubcontractorExpense += amount;
      continue;
    }
    if (expense.countsTowardJobProfit === false) {
      auditTrailTotal += amount;
      if (expense.tripId != null) {
        tripTravelTotal += amount;
        if (expense.category === "Meals") tripMealsDeductible += amount * 0.5;
      }
      continue;
    }
    directExpenseTotal += amount;
    if (expense.category === "Fuel/Travel") actualFuelCost += amount;
  }

  const mileageReimbursement =
    input.includeMileageInJobCosts !== false &&
    !input.hasActualFuelExpense &&
    input.mileageReimbursement != null
      ? money(input.mileageReimbursement)
      : 0;
  const estimatedFuelCost =
    input.includeMileageInJobCosts !== false &&
    !input.hasActualFuelExpense &&
    !input.hasMileageReimbursement &&
    input.estimatedFuelCost != null
      ? money(input.estimatedFuelCost)
      : 0;

  const hourlyLaborCost = money(input.hourlyLaborCost);
  const fixedSubCost = money(input.fixedSubCost);
  const accruedBonus = money(input.accruedBonus);
  const reversedFixedPayouts = money(input.reversedFixedPayout);
  const reversedAllocationPayouts = money(input.reversedAllocationPayout);
  const nonHoursSubCost = fixedSubCost > 0
    ? fixedSubCost
    : hourlyLaborCost > 0
      ? 0
      : legacySubcontractorExpense;
  const subLaborCost = hourlyLaborCost + nonHoursSubCost + accruedBonus;
  const allocPaid = money(input.allocPaid);
  const jobExpenses = directExpenseTotal + allocatedExpenseTotal + mileageReimbursement + estimatedFuelCost;
  const includedCostTotal = jobExpenses + subLaborCost + allocPaid;
  const netProfit = grossInvoiced - includedCostTotal;

  return {
    grossInvoiced,
    collected,
    otherIncomeRevenue,
    jobExpenses,
    directExpenseTotal,
    allocatedExpenseTotal,
    mileageReimbursement,
    estimatedFuelCost,
    actualFuelCost,
    auditTrailTotal,
    tripTravelTotal,
    tripMealsDeductible,
    ownerDrawTaken,
    payrollLinkedExcluded,
    legacySubcontractorExpense,
    subLaborCost,
    allocPaid,
    totalSubHours: money(input.totalSubHours),
    netProfit,
    includedCostTotal,
    profitBreakdown: {
      revenue: {
        invoices: invoiceRevenue,
        otherIncome: otherIncomeRevenue,
        total: grossInvoiced,
      },
      includedCosts: {
        directExpenses: directExpenseTotal,
        allocatedExpenses: allocatedExpenseTotal,
        subLabor: subLaborCost,
        splitPayouts: allocPaid,
        mileageReimbursement,
        estimatedFuel: estimatedFuelCost,
        total: includedCostTotal,
      },
      excludedFromProfit: {
        ownerWithdrawals: ownerDrawTaken,
        auditTrail: auditTrailTotal,
        payrollLinkedExpenses: payrollLinkedExcluded,
        legacySubcontractorExpense,
        reversedFixedPayouts,
        reversedAllocationPayouts,
      },
    },
  };
}