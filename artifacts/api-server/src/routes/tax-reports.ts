import { Router } from "express";
import { db } from "@workspace/db";
import {
  invoicesTable, expensesTable, mileageLogsTable,
  otherIncomeTable, businessesTable,
  settingsTable, subPaymentRecordsTable, jobSubcontractorsTable,
} from "@workspace/db/schema";
import { eq, and, gte, lte, sum, count, ne, or, isNull, sql, inArray } from "drizzle-orm";

const router = Router();

import { getIrsMileageRate } from "../lib/irs-rates.js";

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
  travelLodging:   { line: 24, description: "Travel — lodging & transportation (Line 24a)" },
  mealsDeductible: { line: 24, description: "Meals — 50% deductible (Line 24b)" },
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
  "Travel/Lodging":        "travelLodging",
  "Meals":                 "mealsDeductible",
  "Parking/Tolls":         "carTruck",
  "Other":                 "other",
  // ── Legacy lowercase aliases (keep for any older records) ──
  "travel/lodging":        "travelLodging",
  "meals":                 "mealsDeductible",
  "parking/tolls":         "carTruck",
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
  mealsBreakdown: {
    receiptCount: number;
    totalSpend: number;
    deductibleAmount: number;
    explicitOverrideCount: number;
  };
  dataQuality: {
    uncategorizedExpenses: number;
    invoicesDraft: number;
    mileageLogsWithoutClassification: number;
    warnings: string[];
  };
}

/**
 * Compute the Schedule C Line 24b tax amount for a single category row.
 *
 * For meals: use the pre-summed deductibleSum (COALESCE(deductible_amount, amount*0.5))
 * that the SQL query computes. This honours any explicitly stored deductible_amount
 * (e.g. set by trip receipt logic) rather than blindly re-applying 50% to the raw total.
 *
 * Exported for unit testing.
 */
export function scheduleCMealsTaxAmount(
  scheduleCategory: string,
  rawAmount: number,
  deductibleSum: number | null
): number {
  if (scheduleCategory === "mealsDeductible") {
    // Use stored deductible sum when available; fall back to 50% of raw amount
    return deductibleSum !== null && deductibleSum !== undefined
      ? deductibleSum
      : rawAmount * 0.5;
  }
  return rawAmount;
}

// GET /api/tax-reports/schedule-c?year=2025&businessLine=general_contracting
router.get("/schedule-c", async (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
    const blFilter = (req.query.businessLine as string | undefined) || null;
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const blWhere = (col: Parameters<typeof eq>[0]) =>
      blFilter ? or(eq(col, blFilter), isNull(col)) : undefined;

    // Resolve businessId from slug for mileage isolation
    let mileageBusinessId: number | null = null;
    if (blFilter) {
      const [biz] = await db.select({ id: businessesTable.id }).from(businessesTable).where(eq(businessesTable.slug, blFilter));
      mileageBusinessId = biz?.id ?? null;
    }
    // When a business filter is active, only include mileage explicitly tagged to that business.
    // Logs with null businessId are unassigned and must NOT be pulled into a filtered total.
    // When there is no filter at all, include everything (null businessId logs belong to no specific business but count globally).
    const mileageWhere = mileageBusinessId ? eq(mileageLogsTable.businessId, mileageBusinessId) : undefined;

    // 1. Gross Receipts (Line 1) — cash basis: only paid invoices count as received income.
    // Draft, sent, overdue, and cancelled invoices are excluded because no cash has been received.
    const [grossResult] = await db
      .select({ total: sum(invoicesTable.total) })
      .from(invoicesTable)
      .where(
        and(
          gte(invoicesTable.issueDate, startDate),
          lte(invoicesTable.issueDate, endDate),
          eq(invoicesTable.status, "paid"),
          blWhere(invoicesTable.businessLine)
        )
      );

    const invoiceReceipts = grossResult?.total ? parseFloat(grossResult.total as any) : 0;

    // 1b. Prior/external revenue entered as "Other Income"
    const [otherIncomeResult] = await db
      .select({ total: sum(otherIncomeTable.amount) })
      .from(otherIncomeTable)
      .where(
        and(
          gte(otherIncomeTable.date, startDate),
          lte(otherIncomeTable.date, endDate),
          blWhere(otherIncomeTable.businessLine)
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
        // deductibleSum: use stored deductible_amount when present (e.g. trip meals),
        // otherwise fall back to 50% of the raw amount. This prevents double-applying
        // the 50% rule when deductible_amount is already set to amount * 0.5.
        deductibleSum: sql<string>`COALESCE(SUM(COALESCE(${expensesTable.deductibleAmount}::numeric, ${expensesTable.amount}::numeric * 0.5)), '0')`,
        // Count rows where an explicit deductible_amount override was stored
        explicitDeductibleCount: sql<string>`SUM(CASE WHEN ${expensesTable.deductibleAmount} IS NOT NULL THEN 1 ELSE 0 END)`,
        count: count(expensesTable.id),
      })
      .from(expensesTable)
      .where(
        and(
          gte(expensesTable.date, startDate),
          lte(expensesTable.date, endDate),
          ne(expensesTable.category, "mileage"),
          // Cash-basis: exclude outstanding cost-booking rows (description ending in "(outstanding)").
          // These are accrual-style bookings — the sub has not been paid. The actual cash payment
          // appears in sub_payment_records and is added to contractLabor below.
          sql`(${expensesTable.description} IS NULL OR ${expensesTable.description} NOT LIKE '%(outstanding)')`,
          blWhere(expensesTable.businessLine)
        )
      )
      .groupBy(expensesTable.category);

    const expensesByCategory: Record<string, { amount: number; count: number }> = {};
    const expenses: Record<string, number> = {};
    let uncategorizedCount = 0;

    // Meals breakdown — accumulated across all category rows that map to mealsDeductible
    let mealsReceiptCount = 0;
    let mealsTotalSpend = 0;
    let mealsExplicitOverrideCount = 0;

    for (const exp of expensesData) {
      const amount = parseFloat(exp.amount as any);
      const category = exp.category || "other";

      // Owner distributions are personal — never Schedule C deductions.
      // Covers all three variants so none appear in expensesByCategory or deductible totals.
      if (["Owner Draw", "Owner Compensation", "Owner Withdrawal"].includes(category)) continue;

      expensesByCategory[category] = {
        amount: (expensesByCategory[category]?.amount || 0) + amount,
        count: (expensesByCategory[category]?.count || 0) + 1,
      };

      const scheduleCategory = SCHEDULE_C_CATEGORY_MAP[category] || "other";
      // Meals: use the pre-computed deductibleSum (COALESCE(deductible_amount, amount * 0.5))
      // so that explicitly stored deductible_amount values (e.g. from trip receipts) are
      // honored rather than blindly re-applying 50% to the raw amount.
      const taxAmount = scheduleCategory === "mealsDeductible"
        ? parseFloat((exp as any).deductibleSum ?? "0")
        : amount;
      expenses[scheduleCategory] = (expenses[scheduleCategory] || 0) + taxAmount;

      if (scheduleCategory === "mealsDeductible") {
        mealsReceiptCount += exp.count ?? 0;
        mealsTotalSpend += amount;
        mealsExplicitOverrideCount += parseInt((exp as any).explicitDeductibleCount ?? "0", 10);
      }

      if (!SCHEDULE_C_CATEGORY_MAP[category]) {
        uncategorizedCount++;
      }
    }

    // 3. Mileage Deduction (Line 9) — use stored deductionAmount as source of truth.
    // subcontractorId IS NULL: owner vehicle mileage only — excludes sub-portal tracking
    // logs (James Willard, Dewayne Lamb, etc.) that are job-tracking data, not Schedule C
    // standard-mileage deductions. Sub records are preserved; only excluded from owner's deduction.
    const mileageData = await db
      .select({
        totalMiles: sum(mileageLogsTable.miles),
        totalDeduction: sum(mileageLogsTable.deductionAmount),
      })
      .from(mileageLogsTable)
      .where(
        and(
          eq(mileageLogsTable.classification, "business"),
          isNull(mileageLogsTable.subcontractorId),
          gte(mileageLogsTable.date, startDate),
          lte(mileageLogsTable.date, endDate),
          mileageWhere
        )
      );

    const mileageLogCount = await db
      .select({ count: mileageLogsTable.id })
      .from(mileageLogsTable)
      .where(
        and(
          gte(mileageLogsTable.date, startDate),
          lte(mileageLogsTable.date, endDate),
          mileageWhere
        )
      );

    const totalBusinessMiles = mileageData[0]?.totalMiles ? parseFloat(mileageData[0].totalMiles as any) : 0;
    // Use stored deductionAmount (matches dashboard); irsMileageRate is for display only
    const mileageDeduction = mileageData[0]?.totalDeduction ? parseFloat(mileageData[0].totalDeduction as any) : 0;
    // Derive blended rate from stored per-trip deductionAmounts — reflects 2026 H1/H2 split.
    const irsMileageRate = totalBusinessMiles > 0 ? mileageDeduction / totalBusinessMiles : getIrsMileageRate(year);

    // Separate Fuel/Travel + Parking/Tolls expenses (carTruck) from mileage so Line 9 is handled explicitly
    const fuelTravelExpenses = expenses["carTruck"] || 0;
    delete expenses["carTruck"];
    // Travel/Lodging (24a) and Meals (24b) get their own explicit lines below
    const travelLodgingAmount = expenses["travelLodging"] || 0;
    const mealsDeductibleAmount = expenses["mealsDeductible"] || 0;
    delete expenses["travelLodging"];
    delete expenses["mealsDeductible"];

    // 4. Subcontractor payments (Line 11) — from sub_payment_records (sole ledger after Task #892).
    // Hourly subs already appear in expensesTable (jobSubHoursId IS NOT NULL) so we only
    // add fixed/allocation payments here to avoid double-counting with the expense rows.
    const paymentData = await db
      .select({ totalPayments: sum(subPaymentRecordsTable.amount) })
      .from(subPaymentRecordsTable)
      .innerJoin(jobSubcontractorsTable, and(
        eq(jobSubcontractorsTable.jobId, subPaymentRecordsTable.jobId),
        eq(jobSubcontractorsTable.subcontractorId, subPaymentRecordsTable.subcontractorId),
      ))
      .where(and(
        gte(subPaymentRecordsTable.paymentDate, startDate),
        lte(subPaymentRecordsTable.paymentDate, endDate),
        sql`${subPaymentRecordsTable.isReversal} IS NOT TRUE`,
        inArray(jobSubcontractorsTable.compensationType, ["fixed", "allocation"]),
        blWhere(subPaymentRecordsTable.businessLine),
      ));

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

    // Line 2 — Returns and allowances (none for a contractor)
    scheduleLines.push({ line: 2, description: "Returns and allowances", amount: 0 });

    // Line 3 — Line 1 minus Line 2 (no returns, so equals grossReceipts)
    const line3Amount = grossReceipts;
    scheduleLines.push({ line: 3, description: "Subtract line 2 from line 1", amount: line3Amount });

    // Line 4 — Cost of goods sold.
    // The expense loop (below) will push Line 4 when expenses["cogs"] > 0 (Materials, etc.).
    // If COGS is zero the line stays absent, which is correct — the frontend shows "—" for missing lines.
    // We read the already-computed value here so Lines 5 and 7 are accurate.
    const cogsAmount = expenses["cogs"] || 0;

    // Line 5 — Gross profit (Line 3 minus Line 4)
    const line5Amount = line3Amount - cogsAmount;
    scheduleLines.push({ line: 5, description: "Gross profit. Subtract line 4 from line 3", amount: line5Amount });

    // Line 6 — Other income (all contracting revenue was already merged into Line 1)
    scheduleLines.push({ line: 6, description: "Other income, including federal and state gasoline or fuel tax credit or refund", amount: 0 });

    // Line 7 — Gross income (Line 5 plus Line 6)
    scheduleLines.push({ line: 7, description: "Gross income. Add lines 5 and 6", amount: line5Amount });

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
    const line9Description = `Car and truck expenses (${totalBusinessMiles.toFixed(0)} mi \u00d7 $${irsMileageRate.toFixed(2)}/mi)`;
    scheduleLines.push({ line: 9, description: line9Description, amount: totalCarTruck });
    totalExpenses += totalCarTruck;

    // Line 24a — Travel (lodging, airfare, etc. — 100% deductible)
    if (travelLodgingAmount > 0) {
      scheduleLines.push({ line: 24, description: "Travel — lodging & transportation (Line 24a)", amount: travelLodgingAmount });
      totalExpenses += travelLodgingAmount;
    }
    // Line 24b — Meals (50% deductible; stored amount already reflects the 50% portion)
    if (mealsDeductibleAmount > 0) {
      scheduleLines.push({ line: 24, description: "Meals — 50% deductible (Line 24b)", amount: mealsDeductibleAmount });
      totalExpenses += mealsDeductibleAmount;
    }

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
      mealsBreakdown: {
        receiptCount: mealsReceiptCount,
        totalSpend: mealsTotalSpend,
        deductibleAmount: mealsDeductibleAmount,
        explicitOverrideCount: mealsExplicitOverrideCount,
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

// ─── Home Office Settings ─────────────────────────────────────────────────────
// GET /api/tax-reports/home-office/:year — fetch stored home office fields for a year
router.get("/home-office/:year", async (req, res) => {
  try {
    const year = parseInt(req.params.year as string);
    const [settings] = await db.select({ homeOfficeSettings: settingsTable.homeOfficeSettings }).from(settingsTable).limit(1);
    const all = (settings?.homeOfficeSettings as Record<string, Record<string, string>> | null) ?? {};
    res.json(all[String(year)] ?? null);
  } catch (err) {
    console.error("[home-office GET]", err);
    res.status(500).json({ error: "Failed to load home office settings" });
  }
});

// PATCH /api/tax-reports/home-office/:year — upsert home office fields for a year
router.patch("/home-office/:year", async (req, res) => {
  try {
    const year = parseInt(req.params.year as string);
    const fields = req.body as Record<string, string>;
    const [existing] = await db.select({ id: settingsTable.id, homeOfficeSettings: settingsTable.homeOfficeSettings }).from(settingsTable).limit(1);
    if (!existing) {
      return res.status(404).json({ error: "Settings not found" });
    }
    const all = (existing.homeOfficeSettings as Record<string, Record<string, string>> | null) ?? {};
    all[String(year)] = { ...(all[String(year)] ?? {}), ...fields };
    await db.update(settingsTable).set({ homeOfficeSettings: all }).where(eq(settingsTable.id, existing.id));
    res.json(all[String(year)]);
  } catch (err) {
    console.error("[home-office PATCH]", err);
    res.status(500).json({ error: "Failed to save home office settings" });
  }
});

export default router;
