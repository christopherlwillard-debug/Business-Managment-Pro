import { Router } from "express";
import { db } from "@workspace/db";
import {
  invoicesTable, expensesTable, mileageLogsTable,
  paymentsTable, subcontractorsTable, clientsTable, otherIncomeTable
} from "@workspace/db/schema";
import { eq, and, gte, lte, sum, desc, count, ne } from "drizzle-orm";

const router = Router();

// IRS standard mileage rates — integer year keys, explicit fallback for unknown years
const IRS_MILEAGE_RATES: Record<number, number> = {
  2023: 0.655,
  2024: 0.670,
  2025: 0.700,
  2026: 0.700,
};
const FALLBACK_MILEAGE_RATE = 0.700; // most recent known rate

function getIrsMileageRate(year: number): number {
  return IRS_MILEAGE_RATES[year] !== undefined ? IRS_MILEAGE_RATES[year] : FALLBACK_MILEAGE_RATE;
}

const SCHEDULE_C_LINES = {
  cogs:            { line: 4,  description: "Cost of goods sold" },
  advertising:     { line: 8,  description: "Advertising" },
  carTruck:        { line: 9,  description: "Car and truck expenses" },
  contractLabor:   { line: 11, description: "Contract labor" },
  depreciation:    { line: 13, description: "Depreciation and section 179 deduction" },
  insurance:       { line: 15, description: "Insurance (other than health)" },
  professionalFees:{ line: 17, description: "Legal and professional services" },
  officeExpense:   { line: 18, description: "Office expense" },
  rent:            { line: 20, description: "Rent or lease" },
  repairs:         { line: 21, description: "Repairs and maintenance" },
  supplies:        { line: 22, description: "Supplies" },
  utilities:       { line: 25, description: "Utilities" },
  other:           { line: 27, description: "Other expenses" },
};

// Schedule C category mapping — exact-cased DB values first, then lowercase aliases for legacy data
const SCHEDULE_C_CATEGORY_MAP: Record<string, keyof typeof SCHEDULE_C_LINES> = {
  // ── Exact DB category values (what the expense dropdown stores) ──
  "Materials":             "cogs",
  "Advertising":           "advertising",
  "Fuel/Travel":           "carTruck",
  "Subcontractor":         "contractLabor",
  "Insurance":             "insurance",
  "Professional Services": "professionalFees",
  "Office/Admin":          "officeExpense",
  "Rent/Lease":            "rent",
  "Repairs/Maintenance":   "repairs",
  "Tools/Equipment":       "supplies",
  "Utilities":             "utilities",
  "Other":                 "other",
  // ── Legacy lowercase aliases (keep for any older records) ──
  "cogs":               "cogs",
  "materials":          "cogs",
  "advertising":        "advertising",
  "marketing":          "advertising",
  "fuel":               "carTruck",
  "labor":              "contractLabor",
  "subcontractor":      "contractLabor",
  "contract-labor":     "contractLabor",
  "insurance":          "insurance",
  "professional-services": "professionalFees",
  "accounting":         "professionalFees",
  "legal":              "professionalFees",
  "office-supplies":    "officeExpense",
  "office supplies":    "officeExpense",
  "rent":               "rent",
  "supplies":           "supplies",
  "tools":              "supplies",
  "repairs":            "repairs",
  "maintenance":        "repairs",
  "utilities":          "utilities",
  "electric":           "utilities",
  "water":              "utilities",
  "internet":           "utilities",
  "depreciation":       "depreciation",
};

interface ScheduleCLineItem {
  line: number;
  description: string;
  amount: number;
}

interface ScheduleCReport {
  year: number;
  grossReceipts: number;
  otherIncome: number;
  grossIncome: number;
  expenses: Record<string, number>;
  expensesByCategory: Record<string, { amount: number; count: number }>;
  scheduleLines: ScheduleCLineItem[];
  totalExpenses: number;
  grossProfit: number;
  mileageData: {
    totalBusinessMiles: number;
    ratePerMile: number;
    deduction: number;
    logCount: number;
  };
  dataQuality: {
    uncategorizedExpenses: number;
    invoicesDraft: number;
    mileageLogsWithoutClassification: number;
    warnings: string[];
  };
}

// GET /api/tax-reports/schedule-c?year=2025
router.get("/schedule-c", async (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    // 1. Gross Receipts (Line 1) - only paid/sent invoices
    const [grossResult] = await db
      .select({ total: sum(invoicesTable.total) })
      .from(invoicesTable)
      .where(
        and(
          // Include paid and sent status invoices
          gte(invoicesTable.issueDate, startDate),
          lte(invoicesTable.issueDate, endDate)
        )
      );

    const invoiceReceipts = grossResult?.total ? parseFloat(grossResult.total as any) : 0;

    // 1b. Prior/external revenue entered as "Other Income" - same business, goes into Line 1
    const [otherIncomeResult] = await db
      .select({ total: sum(otherIncomeTable.amount) })
      .from(otherIncomeTable)
      .where(
        and(
          gte(otherIncomeTable.date, startDate),
          lte(otherIncomeTable.date, endDate)
        )
      );

    const otherIncomeTotal = otherIncomeResult?.total ? parseFloat(otherIncomeResult.total as any) : 0;
    // All income is contracting work — combine into gross receipts (Line 1)
    const grossReceipts = invoiceReceipts + otherIncomeTotal;
    const grossIncome = grossReceipts;

    // 2. Expenses by category (exclude mileage — it's calculated separately)
    const expensesData = await db
      .select({
        category: expensesTable.category,
        amount: sum(expensesTable.amount),
        count: count(expensesTable.id),
      })
      .from(expensesTable)
      .where(
        and(
          gte(expensesTable.date, startDate),
          lte(expensesTable.date, endDate),
          ne(expensesTable.category, "mileage")
        )
      )
      .groupBy(expensesTable.category);

    const expensesByCategory: Record<string, { amount: number; count: number }> = {};
    const expenses: Record<string, number> = {};
    let uncategorizedCount = 0;

    for (const exp of expensesData) {
      const amount = parseFloat(exp.amount as any);
      const category = exp.category || "other";
      expensesByCategory[category] = {
        amount: (expensesByCategory[category]?.amount || 0) + amount,
        count: (expensesByCategory[category]?.count || 0) + 1,
      };

      const scheduleCategory = SCHEDULE_C_CATEGORY_MAP[category] || "other";
      expenses[scheduleCategory] = (expenses[scheduleCategory] || 0) + amount;

      if (!SCHEDULE_C_CATEGORY_MAP[category]) {
        uncategorizedCount++;
      }
    }

    // 3. Mileage Deduction (Line 9) — use stored deductionAmount as source of truth
    const mileageData = await db
      .select({
        totalMiles: sum(mileageLogsTable.miles),
        totalDeduction: sum(mileageLogsTable.deductionAmount),
      })
      .from(mileageLogsTable)
      .where(
        and(
          eq(mileageLogsTable.classification, "business"),
          gte(mileageLogsTable.date, startDate),
          lte(mileageLogsTable.date, endDate)
        )
      );

    const mileageLogCount = await db
      .select({ count: mileageLogsTable.id })
      .from(mileageLogsTable)
      .where(
        and(
          gte(mileageLogsTable.date, startDate),
          lte(mileageLogsTable.date, endDate)
        )
      );

    const totalBusinessMiles = mileageData[0]?.totalMiles ? parseFloat(mileageData[0].totalMiles as any) : 0;
    // Use stored deductionAmount (matches dashboard); irsMileageRate is for display only
    const mileageDeduction = mileageData[0]?.totalDeduction ? parseFloat(mileageData[0].totalDeduction as any) : 0;
    const irsMileageRate = getIrsMileageRate(year);

    // Separate Fuel/Travel expenses (carTruck) from mileage so Line 9 is handled explicitly
    const fuelTravelExpenses = expenses["carTruck"] || 0;
    delete expenses["carTruck"];

    // 4. Subcontractor payments (Line 11) - from payments table
    const paymentData = await db
      .select({ totalPayments: sum(paymentsTable.amount) })
      .from(paymentsTable)
      .where(
        and(
          eq(paymentsTable.year, year)
        )
      );

    const contractLaborAmount = paymentData[0]?.totalPayments ? parseFloat(paymentData[0].totalPayments as any) : 0;
    if (contractLaborAmount > 0) {
      expenses["contractLabor"] = (expenses["contractLabor"] || 0) + contractLaborAmount;
    }

    // Build Schedule C lines
    const scheduleLines: ScheduleCLineItem[] = [];
    let totalExpenses = 0;

    // Line 1 - Gross Receipts (app invoices + prior/external revenue combined)
    scheduleLines.push({
      line: 1,
      description: otherIncomeTotal > 0
        ? `Gross receipts or sales (invoices + $${otherIncomeTotal.toFixed(2)} prior revenue)`
        : "Gross receipts or sales",
      amount: grossReceipts,
    });

    // Expense lines
    for (const [categoryKey, expenseAmount] of Object.entries(expenses)) {
      const lineInfo = SCHEDULE_C_LINES[categoryKey as keyof typeof SCHEDULE_C_LINES];
      if (lineInfo && expenseAmount > 0) {
        scheduleLines.push({
          line: lineInfo.line,
          description: lineInfo.description,
          amount: expenseAmount,
        });
        totalExpenses += expenseAmount;
      }
    }

    // Line 9 — Car and truck expenses (ALWAYS included, even when $0, for explicit Schedule C accuracy)
    const totalCarTruck = fuelTravelExpenses + mileageDeduction;
    const line9Description = `Car and truck expenses (${totalBusinessMiles.toFixed(0)} mi \u00d7 $${irsMileageRate.toFixed(3)}/mi)`;
    scheduleLines.push({ line: 9, description: line9Description, amount: totalCarTruck });
    totalExpenses += totalCarTruck;

    // Line 28 - Total Expenses
    scheduleLines.push({
      line: 28,
      description: "Total expenses",
      amount: totalExpenses,
    });

    // Line 29 - Gross Profit (Gross Income minus total expenses)
    const grossProfit = grossIncome - totalExpenses;
    scheduleLines.push({
      line: 29,
      description: "Gross profit or loss",
      amount: grossProfit,
    });

    // Data quality checks
    const draftInvoices = await db
      .select({ count: invoicesTable.id })
      .from(invoicesTable)
      .where(
        and(
          eq(invoicesTable.status, "draft"),
          gte(invoicesTable.issueDate, startDate),
          lte(invoicesTable.issueDate, endDate)
        )
      );

    const mileageWithoutClassification = await db
      .select({ count: mileageLogsTable.id })
      .from(mileageLogsTable)
      .where(
        and(
          gte(mileageLogsTable.date, startDate),
          lte(mileageLogsTable.date, endDate)
        )
      )
      .then(rows => rows.length - mileageLogCount.length);

    const warnings: string[] = [];
    if (uncategorizedCount > 0) {
      warnings.push(`${uncategorizedCount} expenses have uncategorized types. Review and categorize them.`);
    }
    if (draftInvoices.length > 0) {
      warnings.push(`${draftInvoices.length} draft invoices found. Only 'sent' or 'paid' should count.`);
    }
    if (totalBusinessMiles < 5 && totalBusinessMiles > 0) {
      warnings.push("Very few business miles logged. Ensure you're tracking all business travel.");
    }

    const response: ScheduleCReport = {
      year,
      grossReceipts,
      otherIncome: otherIncomeTotal,
      grossIncome,
      expenses,
      expensesByCategory,
      scheduleLines: scheduleLines.sort((a, b) => a.line - b.line),
      totalExpenses,
      grossProfit,
      mileageData: {
        totalBusinessMiles,
        ratePerMile: irsMileageRate,
        deduction: mileageDeduction,
        logCount: mileageLogCount.length,
      },
      dataQuality: {
        uncategorizedExpenses: uncategorizedCount,
        invoicesDraft: draftInvoices.length,
        mileageLogsWithoutClassification: mileageWithoutClassification,
        warnings,
      },
    };

    res.json(response);
  } catch (err) {
    console.error("Error generating Schedule C report:", err);
    res.status(500).json({ error: "Failed to generate Schedule C report" });
  }
});

// GET /api/tax-reports/subcontractor/:id?year=2025 - Admin view all subs, or specific sub
router.get("/subcontractor/:id", async (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
    const subId = parseInt(req.params.id);

    const payments = await db
      .select()
      .from(paymentsTable)
      .where(
        and(
          eq(paymentsTable.subcontractorId, subId),
          eq(paymentsTable.year, year)
        )
      )
      .orderBy(desc(paymentsTable.paymentDate));

    const [totals] = await db
      .select({ total: sum(paymentsTable.amount) })
      .from(paymentsTable)
      .where(
        and(
          eq(paymentsTable.subcontractorId, subId),
          eq(paymentsTable.year, year)
        )
      );

    res.json({
      year,
      subcontractorId: subId,
      totalPayments: totals?.total ? parseFloat(totals.total as any) : 0,
      paymentCount: payments.length,
      payments: payments.map(p => ({
        id: p.id,
        amount: parseFloat(p.amount as any),
        paymentDate: p.paymentDate,
        description: p.description,
        invoiceNumber: p.invoiceNumber,
        notes: p.notes,
      })),
    });
  } catch (err) {
    console.error("Error fetching subcontractor payments:", err);
    res.status(500).json({ error: "Failed to fetch subcontractor payments" });
  }
});

// GET /api/tax-reports/admin/all-subcontractors?year=2025 - Admin view all subs with totals
router.get("/admin/all-subcontractors", async (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();

    const subcontractorsWithPayments = await db
      .select({
        id: subcontractorsTable.id,
        name: subcontractorsTable.name,
        totalPayments: sum(paymentsTable.amount),
        paymentCount: count(paymentsTable.id),
      })
      .from(subcontractorsTable)
      .leftJoin(
        paymentsTable,
        and(
          eq(subcontractorsTable.id, paymentsTable.subcontractorId),
          eq(paymentsTable.year, year)
        )
      )
      .groupBy(subcontractorsTable.id, subcontractorsTable.name);

    res.json({
      year,
      subcontractors: subcontractorsWithPayments.map(s => ({
        id: s.id,
        name: s.name,
        totalPayments: s.totalPayments ? parseFloat(s.totalPayments as any) : 0,
        paymentCount: s.paymentCount ? 1 : 0, // This is approximate; would need better count
      })),
    });
  } catch (err) {
    console.error("Error fetching all subcontractors with payments:", err);
    res.status(500).json({ error: "Failed to fetch subcontractor payments" });
  }
});

export default router;
