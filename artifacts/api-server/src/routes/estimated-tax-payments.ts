import { Router } from "express";
import { isOwnerWithdrawalExpenseCategory } from "../lib/owner-withdrawals.js";
import { db, estimatedTaxPaymentsTable, invoicesTable, expensesTable, mileageLogsTable, otherIncomeTable, settingsTable } from "@workspace/db";
import { eq, and, gte, lte, sum } from "drizzle-orm";
import { wrapAsync } from "./guards";
import { calculateMileageDeduction } from "../lib/irs-rates.js";
import { computeTaxEstimate, getTaxAssumptions } from "../lib/tax-estimate.js";

const router = Router();

interface QuarterInfo {
  quarter: number;
  label: string;
  period: string;
  federalDueDate: string;
  federalDueDateLabel: string;
  kyDueDate: string;
  kyDueDateLabel: string;
  recommendedFederal: number;
  recommendedKy: number;
  recommendedTotal: number;
  safeHarborFederal: number;
  safeHarborKy: number;
  safeHarborTotal: number;
  totalPaidFederal: number;
  totalPaidKy: number;
  totalPaidCombined: number;
  totalPaid: number;
  payments: EstimatedTaxPaymentRow[];
  status: "paid" | "partial" | "due" | "overdue";
}

interface EstimatedTaxPaymentRow {
  id: number;
  year: number;
  quarter: number;
  level: string;
  amountDue: number | null;
  amountPaid: number;
  paidDate: string | null;
  paymentMethod: string | null;
  notes: string | null;
  createdAt: Date;
}

function nextBusinessDay(d: Date): Date {
  const result = new Date(d);
  const day = result.getUTCDay();
  if (day === 6) result.setUTCDate(result.getUTCDate() + 2);
  else if (day === 0) result.setUTCDate(result.getUTCDate() + 1);
  return result;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDueDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
  });
}

function getQuarterDueDates(year: number, quarter: number): { dueDate: Date; label: string } {
  let base: Date;
  switch (quarter) {
    case 1: base = new Date(Date.UTC(year, 3, 15)); break;
    case 2: base = new Date(Date.UTC(year, 5, 15)); break;
    case 3: base = new Date(Date.UTC(year, 8, 15)); break;
    case 4: base = new Date(Date.UTC(year + 1, 0, 15)); break;
    default: base = new Date(Date.UTC(year, 3, 15));
  }
  const dueDate = nextBusinessDay(base);
  return { dueDate, label: formatDueDate(dueDate) };
}

const QUARTER_DEFS = [
  { quarter: 1, label: "Q1", period: "Jan – Mar" },
  { quarter: 2, label: "Q2", period: "Apr – May" },
  { quarter: 3, label: "Q3", period: "Jun – Aug" },
  { quarter: 4, label: "Q4", period: "Sep – Dec" },
];

interface YearTaxData {
  netProfit: number;
  fullYearFederalTax: number;
  fullYearKyTax: number;
  assumptionsUsed: ReturnType<typeof getTaxAssumptions>;
}

async function computeTaxData(year: number, ytd = false): Promise<YearTaxData> {
  const startDate = `${year}-01-01`;
  const today = new Date().toISOString().slice(0, 10);
  const endDate = ytd ? (today < `${year}-12-31` ? today : `${year}-12-31`) : `${year}-12-31`;

  const [invoicesResult, expensesResult, mileageResult, otherIncomeResult] = await Promise.all([
    db.select().from(invoicesTable).where(and(gte(invoicesTable.issueDate, startDate), lte(invoicesTable.issueDate, endDate))),
    db.select().from(expensesTable).where(and(gte(expensesTable.date, startDate), lte(expensesTable.date, endDate))),
    db.select({ date: mileageLogsTable.date, miles: mileageLogsTable.miles, classification: mileageLogsTable.classification }).from(mileageLogsTable).where(
      and(eq(mileageLogsTable.classification, "business"), gte(mileageLogsTable.date, startDate), lte(mileageLogsTable.date, endDate))
    ),
    db.select({ total: sum(otherIncomeTable.amount) }).from(otherIncomeTable).where(
      and(gte(otherIncomeTable.date, startDate), lte(otherIncomeTable.date, endDate))
    ),
  ]);
  const [settings] = await db.select({ taxAssumptions: settingsTable.taxAssumptions }).from(settingsTable).limit(1);

  const paidRevenue = invoicesResult.filter(i => i.status === "paid").reduce((s, i) => s + parseFloat(i.total ?? "0"), 0);
  const otherIncomeSum = otherIncomeResult[0]?.total ? parseFloat(otherIncomeResult[0].total as string) : 0;
  // Exclude mileage (tracked separately) and owner distributions (equity draws, not deductible expenses).
  const totalExpenses = expensesResult
    .filter(e => e.category !== "mileage" && !isOwnerWithdrawalExpenseCategory(e.category))
    .reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);
  const mileageDeduction = mileageResult.reduce((total, row) =>
    total + calculateMileageDeduction(row.miles, row.classification, row.date).deduction, 0);

  const netProfit = Math.max(0, (paidRevenue + otherIncomeSum) - totalExpenses - mileageDeduction);
  const estimate = computeTaxEstimate(netProfit, 0, year, settings?.taxAssumptions as any);
  const fullYearFederalTax = estimate.federalSE + estimate.federalIncome;
  const fullYearKyTax = estimate.kyState;

  return { netProfit, fullYearFederalTax, fullYearKyTax, assumptionsUsed: estimate.assumptionsUsed };
}

// GET /api/estimated-tax-payments?year=YYYY
router.get("/", wrapAsync(async (req, res) => {
  const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();

  const currentCalendarYear = new Date().getFullYear();
  const [payments, currentYearData, priorYearData] = await Promise.all([
    db.select().from(estimatedTaxPaymentsTable).where(eq(estimatedTaxPaymentsTable.year, year)),
    computeTaxData(year, year === currentCalendarYear),
    computeTaxData(year - 1),
  ]);

  const { fullYearFederalTax, fullYearKyTax } = currentYearData;

  const optionA_Federal = priorYearData.fullYearFederalTax > 0 ? priorYearData.fullYearFederalTax / 4 : null;
  const optionA_Ky = priorYearData.fullYearKyTax > 0 ? priorYearData.fullYearKyTax / 4 : null;
  const optionB_Federal = (fullYearFederalTax * 0.9) / 4;
  const optionB_Ky = (fullYearKyTax * 0.9) / 4;

  const safeHarborFederalPerQ = optionA_Federal !== null ? Math.min(optionA_Federal, optionB_Federal) : optionB_Federal;
  const safeHarborKyPerQ = optionA_Ky !== null ? Math.min(optionA_Ky, optionB_Ky) : optionB_Ky;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rows: EstimatedTaxPaymentRow[] = payments.map(p => ({
    id: p.id,
    year: p.year,
    quarter: p.quarter,
    level: p.level,
    amountDue: p.amountDue ? parseFloat(p.amountDue as string) : null,
    amountPaid: p.amountPaid ? parseFloat(p.amountPaid as string) : 0,
    paidDate: p.paidDate,
    paymentMethod: p.paymentMethod,
    notes: p.notes,
    createdAt: p.createdAt,
  }));

  const quarters: QuarterInfo[] = QUARTER_DEFS.map(qDef => {
    const qPayments = rows.filter(p => p.quarter === qDef.quarter);
    const totalPaidFederal = qPayments.filter(p => p.level === "federal").reduce((s, p) => s + p.amountPaid, 0);
    const totalPaidKy = qPayments.filter(p => p.level === "state").reduce((s, p) => s + p.amountPaid, 0);
    const totalPaidCombined = qPayments.filter(p => p.level === "combined").reduce((s, p) => s + p.amountPaid, 0);
    const totalPaid = totalPaidFederal + totalPaidKy + totalPaidCombined;

    const { dueDate, label } = getQuarterDueDates(year, qDef.quarter);
    const isOverdue = dueDate < today;

    const recommendedTotal = fullYearFederalTax / 4 + fullYearKyTax / 4;
    const safeHarborTotal = safeHarborFederalPerQ + safeHarborKyPerQ;

    let status: QuarterInfo["status"] = "due";
    if (safeHarborTotal > 0 && totalPaid >= safeHarborTotal) status = "paid";
    else if (totalPaid > 0) status = "partial";
    else if (isOverdue) status = "overdue";

    return {
      ...qDef,
      federalDueDate: isoDate(dueDate),
      federalDueDateLabel: label,
      kyDueDate: isoDate(dueDate),
      kyDueDateLabel: label,
      recommendedFederal: fullYearFederalTax / 4,
      recommendedKy: fullYearKyTax / 4,
      recommendedTotal,
      safeHarborFederal: safeHarborFederalPerQ,
      safeHarborKy: safeHarborKyPerQ,
      safeHarborTotal,
      totalPaidFederal,
      totalPaidKy,
      totalPaidCombined,
      totalPaid,
      payments: qPayments,
      status,
    };
  });

  const totalSafeHarbor = (safeHarborFederalPerQ + safeHarborKyPerQ) * 4;
  const totalRecommended = fullYearFederalTax + fullYearKyTax;
  const totalPaidYtd = rows.reduce((s, p) => s + p.amountPaid, 0);
  const priorYearAvailable = priorYearData.netProfit > 0;

  res.json({
    year,
    quarters,
    payments: rows,
    safeHarborMethod: priorYearAvailable ? "min-prior-year-and-90pct-current" : "current-year-90-percent",
    priorYearAvailable,
    summary: {
      netProfit: currentYearData.netProfit,
      priorYearNetProfit: priorYearData.netProfit,
      fullYearFederalTax,
      fullYearKyTax,
      totalRecommended,
      totalSafeHarbor,
      safeHarborPerQuarter: safeHarborFederalPerQ + safeHarborKyPerQ,
      totalPaid: totalPaidYtd,
      remaining: Math.max(0, totalSafeHarbor - totalPaidYtd),
      assumptionsUsed: currentYearData.assumptionsUsed,
    },
  });
}));

// POST /api/estimated-tax-payments
router.post("/", wrapAsync(async (req, res) => {
  const { year, quarter, level, amountDue, amountPaid, paidDate, paymentMethod, notes } = req.body;
  if (!year || !quarter || !level) {
    res.status(400).json({ error: "year, quarter, and level are required" });
    return;
  }
  if (![1, 2, 3, 4].includes(parseInt(quarter))) {
    res.status(400).json({ error: "quarter must be 1–4" });
    return;
  }
  if (!["federal", "state", "combined"].includes(level)) {
    res.status(400).json({ error: "level must be federal, state, or combined" });
    return;
  }
  const [row] = await db.insert(estimatedTaxPaymentsTable).values({
    year: parseInt(year),
    quarter: parseInt(quarter),
    level,
    amountDue: amountDue ? String(amountDue) : null,
    amountPaid: amountPaid ? String(amountPaid) : null,
    paidDate: paidDate || null,
    paymentMethod: paymentMethod || null,
    notes: notes || null,
  }).returning();
  res.status(201).json(row);
}));

// PUT /api/estimated-tax-payments/:id
router.put("/:id", wrapAsync(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { amountDue, amountPaid, paidDate, paymentMethod, notes, level } = req.body;
  const updates: Partial<typeof estimatedTaxPaymentsTable.$inferInsert> = {};
  if (amountDue !== undefined) updates.amountDue = String(amountDue);
  if (amountPaid !== undefined) updates.amountPaid = String(amountPaid);
  if (paidDate !== undefined) updates.paidDate = paidDate;
  if (paymentMethod !== undefined) updates.paymentMethod = paymentMethod;
  if (notes !== undefined) updates.notes = notes;
  if (level !== undefined) updates.level = level;
  const [row] = await db.update(estimatedTaxPaymentsTable).set(updates).where(eq(estimatedTaxPaymentsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
}));

// DELETE /api/estimated-tax-payments/:id
router.delete("/:id", wrapAsync(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(estimatedTaxPaymentsTable).where(eq(estimatedTaxPaymentsTable.id, id));
  res.status(204).end();
}));

export default router;
