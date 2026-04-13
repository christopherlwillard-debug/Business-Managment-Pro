import { Router } from "express";
import { db, estimatedTaxPaymentsTable, invoicesTable, expensesTable, mileageLogsTable, otherIncomeTable, settingsTable } from "@workspace/db";
import { eq, and, gte, lte, sum } from "drizzle-orm";
import { wrapAsync } from "./guards";

const router = Router();

interface QuarterInfo {
  quarter: number;
  label: string;
  period: string;
  dueDateLabel: string;
  dueDate: Date;
  recommendedFederal: number;
  recommendedKy: number;
  recommendedTotal: number;
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
  amountPaid: number;
  paidDate: string | null;
  paymentMethod: string | null;
  notes: string | null;
  createdAt: Date;
}

function getQuarterDueDate(year: number, quarter: number): Date {
  switch (quarter) {
    case 1: return new Date(year, 3, 15);
    case 2: return new Date(year, 5, 15);
    case 3: return new Date(year, 8, 15);
    case 4: return new Date(year + 1, 0, 15);
    default: return new Date(year, 3, 15);
  }
}

function getQuarterDueDateLabel(year: number, quarter: number): string {
  switch (quarter) {
    case 1: return `April 15, ${year}`;
    case 2: return `June 15, ${year}`;
    case 3: return `September 15, ${year}`;
    case 4: return `January 15, ${year + 1}`;
    default: return "";
  }
}

const QUARTER_DEFS = [
  { quarter: 1, label: "Q1", period: "Jan – Mar" },
  { quarter: 2, label: "Q2", period: "Apr – May" },
  { quarter: 3, label: "Q3", period: "Jun – Aug" },
  { quarter: 4, label: "Q4", period: "Sep – Dec" },
];

async function computeNetProfit(year: number): Promise<{ netProfit: number; kyStateTax: number; federalSETax: number }> {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  const [invoicesResult, expensesResult, mileageResult, otherIncomeResult, settingsResult] = await Promise.all([
    db.select().from(invoicesTable).where(and(gte(invoicesTable.issueDate, startDate), lte(invoicesTable.issueDate, endDate))),
    db.select().from(expensesTable).where(and(gte(expensesTable.date, startDate), lte(expensesTable.date, endDate))),
    db.select({ totalDeduction: sum(mileageLogsTable.deductionAmount) }).from(mileageLogsTable).where(and(eq(mileageLogsTable.classification, "business"), gte(mileageLogsTable.date, startDate), lte(mileageLogsTable.date, endDate))),
    db.select({ total: sum(otherIncomeTable.amount) }).from(otherIncomeTable).where(and(gte(otherIncomeTable.date, startDate), lte(otherIncomeTable.date, endDate))),
    db.select().from(settingsTable).limit(1),
  ]);

  const paidRevenue = invoicesResult.filter(i => i.status === "paid").reduce((s, i) => s + parseFloat(i.total ?? "0"), 0);
  const otherIncomeSum = otherIncomeResult[0]?.total ? parseFloat(otherIncomeResult[0].total as string) : 0;
  const totalExpenses = expensesResult.filter(e => e.category !== "mileage").reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);
  const mileageDeduction = mileageResult[0]?.totalDeduction ? parseFloat(mileageResult[0].totalDeduction as string) : 0;

  const netProfit = Math.max(0, (paidRevenue + otherIncomeSum) - totalExpenses - mileageDeduction);
  const kyStateTax = netProfit * 0.04;
  const federalSETax = netProfit * 0.9235 * 0.153;
  const federalIncomeTaxEst = Math.max(0, (netProfit - federalSETax * 0.5) * 0.22);

  return { netProfit, kyStateTax, federalSETax: federalSETax + federalIncomeTaxEst };
}

// GET /api/estimated-tax-payments?year=YYYY
router.get("/", wrapAsync(async (req, res) => {
  const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();

  const [payments, taxData] = await Promise.all([
    db.select().from(estimatedTaxPaymentsTable).where(eq(estimatedTaxPaymentsTable.year, year)),
    computeNetProfit(year),
  ]);

  const { kyStateTax, federalSETax } = taxData;
  const recommendedFederalPerQ = federalSETax / 4;
  const recommendedKyPerQ = kyStateTax / 4;
  const recommendedTotalPerQ = recommendedFederalPerQ + recommendedKyPerQ;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rows: EstimatedTaxPaymentRow[] = payments.map(p => ({
    id: p.id,
    year: p.year,
    quarter: p.quarter,
    level: p.level,
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

    const dueDate = getQuarterDueDate(year, qDef.quarter);
    const isOverdue = dueDate < today;

    let status: QuarterInfo["status"] = "due";
    if (totalPaid >= recommendedTotalPerQ && recommendedTotalPerQ > 0) status = "paid";
    else if (totalPaid > 0) status = "partial";
    else if (isOverdue) status = "overdue";

    return {
      ...qDef,
      dueDateLabel: getQuarterDueDateLabel(year, qDef.quarter),
      dueDate,
      recommendedFederal: recommendedFederalPerQ,
      recommendedKy: recommendedKyPerQ,
      recommendedTotal: recommendedTotalPerQ,
      totalPaidFederal,
      totalPaidKy,
      totalPaidCombined,
      totalPaid,
      payments: qPayments,
      status,
    };
  });

  const totalRecommended = recommendedTotalPerQ * 4;
  const totalPaidYtd = rows.reduce((s, p) => s + p.amountPaid, 0);

  res.json({
    year,
    quarters,
    payments: rows,
    summary: {
      recommendedPerQuarter: recommendedTotalPerQ,
      recommendedFederalPerQ,
      recommendedKyPerQ,
      totalRecommended,
      totalPaid: totalPaidYtd,
      remaining: Math.max(0, totalRecommended - totalPaidYtd),
      netProfit: taxData.netProfit,
    },
  });
}));

// POST /api/estimated-tax-payments
router.post("/", wrapAsync(async (req, res) => {
  const { year, quarter, level, amountPaid, paidDate, paymentMethod, notes } = req.body;
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
    amountPaid: amountPaid ? String(amountPaid) : null,
    paidDate: paidDate || null,
    paymentMethod: paymentMethod || null,
    notes: notes || null,
  }).returning();
  res.status(201).json(row);
}));

// PUT /api/estimated-tax-payments/:id
router.put("/:id", wrapAsync(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { amountPaid, paidDate, paymentMethod, notes, level } = req.body;
  const updates: Partial<typeof estimatedTaxPaymentsTable.$inferInsert> = {};
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
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(estimatedTaxPaymentsTable).where(eq(estimatedTaxPaymentsTable.id, id));
  res.status(204).end();
}));

export default router;
