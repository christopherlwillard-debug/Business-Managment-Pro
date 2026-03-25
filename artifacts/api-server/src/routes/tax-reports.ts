import { Router } from "express";
import { db } from "@workspace/db";
import {
  invoicesTable, expensesTable, mileageLogsTable,
  paymentsTable, subcontractorsTable, clientsTable
} from "@workspace/db/schema";
import { eq, and, gte, lte, sum, desc, count } from "drizzle-orm";

const router = Router();

// Schedule C category mapping
const SCHEDULE_C_CATEGORY_MAP: Record<string, keyof typeof SCHEDULE_C_LINES> = {
  "cogs": "cogs",
  "supplies": "officeSupplies",
  "materials": "cogs",
  "tools": "cogs",
  "fuel": "carTruck",
  "repairs": "repairs",
  "maintenance": "repairs",
  "electric": "utilities",
  "water": "utilities",
  "internet": "utilities",
  "utilities": "utilities",
  "insurance": "insurance",
  "professional-services": "professionalFees",
  "accounting": "professionalFees",
  "legal": "professionalFees",
  "advertising": "advertising",
  "marketing": "advertising",
  "labor": "contractLabor",
  "subcontractor": "contractLabor",
  "contract-labor": "contractLabor",
  "rent": "rent",
  "depreciation": "depreciation",
  "office-supplies": "officeSupplies",
  "office supplies": "officeSupplies",
};

const SCHEDULE_C_LINES = {
  cogs: { line: 4, description: "Cost of goods sold" },
  carTruck: { line: 9, description: "Car and truck expenses" },
  contractLabor: { line: 11, description: "Contract labor" },
  officeSupplies: { line: 18, description: "Office supplies" },
  utilities: { line: 24, description: "Utilities (heat, light, telephone, etc.)" },
  insurance: { line: 20, description: "Insurance (other than health)" },
  professionalFees: { line: 17, description: "Professional services (legal, accounting)" },
  repairs: { line: 21, description: "Repairs and maintenance" },
  advertising: { line: 8, description: "Advertising" },
  rent: { line: 16, description: "Rent or lease" },
  depreciation: { line: 13, description: "Depreciation and section 179 deduction" },
  other: { line: 27, description: "Other expenses" },
};

interface ScheduleCLineItem {
  line: number;
  description: string;
  amount: number;
}

interface ScheduleCReport {
  year: number;
  grossReceipts: number;
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

    const grossReceipts = grossResult?.total ? parseFloat(grossResult.total as any) : 0;

    // 2. Expenses by category
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
          lte(expensesTable.date, endDate)
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

    // 3. Mileage Deduction (Line 9)
    const mileageData = await db
      .select({ totalMiles: sum(mileageLogsTable.miles) })
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
    const ratePerMile = 0.725; // 2025 IRS rate
    const mileageDeduction = totalBusinessMiles * ratePerMile;

    if (mileageDeduction > 0) {
      expenses["carTruck"] = (expenses["carTruck"] || 0) + mileageDeduction;
    }

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

    // Line 1 - Gross Receipts
    scheduleLines.push({
      line: 1,
      description: "Gross receipts or sales",
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

    // Line 28 - Total Expenses
    scheduleLines.push({
      line: 28,
      description: "Total expenses",
      amount: totalExpenses,
    });

    // Line 29 - Gross Profit
    const grossProfit = grossReceipts - totalExpenses;
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
      expenses,
      expensesByCategory,
      scheduleLines: scheduleLines.sort((a, b) => a.line - b.line),
      totalExpenses,
      grossProfit,
      mileageData: {
        totalBusinessMiles,
        ratePerMile,
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
