import { Router } from "express";
import { db } from "@workspace/db";
import { jobsTable, invoicesTable, expensesTable, mileageLogsTable, subcontractorsTable, clientsTable, settingsTable, otherIncomeTable, assetsTable, estimatedTaxPaymentsTable, assetBusinessUseTable, businessesTable, jobSubHoursTable, jobSubcontractorsTable, ownerCapitalEntriesTable } from "@workspace/db/schema";
import { eq, and, gte, lte, desc, sum, ne, inArray, sql, count, isNull } from "drizzle-orm";
import { computeYtd } from "./subcontractors";
import { sectionGuard, ownerGuard } from "./guards";
import { getIrsMileageRate } from "../lib/irs-rates.js";
import { computeAllocationSplitPools } from "../lib/allocation.js";

const router = Router();


router.get("/dashboard", sectionGuard("invoices"), async (req, res) => {
  try {
    const { period = "month", businessLine: blFilter } = req.query as Record<string, string | undefined>;

    const now = new Date();
    let startDate: string;
    if (period === "week") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      startDate = d.toISOString().split("T")[0];
    } else if (period === "quarter") {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 3);
      startDate = d.toISOString().split("T")[0];
    } else if (period === "year") {
      startDate = `${now.getFullYear()}-01-01`;
    } else {
      startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    }
    const endDate = now.toISOString().split("T")[0];

    // For display stats on the "Tax Deductions" card, always show YTD mileage
    const ytdStart = `${now.getFullYear()}-01-01`;

    // For the YTD ("year") period, query expenses across the full calendar year
    const expenseEndDate = period === "year" ? `${now.getFullYear()}-12-31` : endDate;

    // Accept any non-empty business slug — no hardcoded allowlist
    const validBl = blFilter || null;

    // Build optional DB-level business-line WHERE condition (returns undefined when no filter = AND ignores it)
    const blWhere = (col: Parameters<typeof eq>[0]) =>
      validBl ? eq(col, validBl) : undefined;

    // Resolve businessId from slug for mileage isolation (mileage_logs uses businessId FK, not businessLine)
    let mileageBusinessId: number | null = null;
    if (validBl) {
      const [biz] = await db.select({ id: businessesTable.id }).from(businessesTable).where(eq(businessesTable.slug, validBl));
      mileageBusinessId = biz?.id ?? null;
    }
    const mileageWhere = mileageBusinessId ? eq(mileageLogsTable.businessId, mileageBusinessId) : undefined;

    // Fetch KPI data with DB-level business-line WHERE when validBl is set,
    // plus full (unfiltered) data in parallel for the byBusinessLine breakdown.
    const [
      kpiInvoices, kpiExpenses, allMileage, kpiOtherIncome, kpiActiveJobs,
      recentJobsRows, recentInvoicesRows, kpiOwnerCapital,
    ] = await Promise.all([
      // KPI queries — DB-level filter applied when validBl is set
      db.select().from(invoicesTable).where(and(gte(invoicesTable.issueDate, startDate), lte(invoicesTable.issueDate, endDate), blWhere(invoicesTable.businessLine))),
      db.select().from(expensesTable).where(and(gte(expensesTable.date, startDate), lte(expensesTable.date, expenseEndDate), blWhere(expensesTable.businessLine))),
      // Period-consistent mileage for the profit formula — matches the selected period
      db.select().from(mileageLogsTable).where(and(gte(mileageLogsTable.date, startDate), lte(mileageLogsTable.date, endDate), eq(mileageLogsTable.classification, "business"), mileageWhere)),
      db.select().from(otherIncomeTable).where(and(gte(otherIncomeTable.date, startDate), lte(otherIncomeTable.date, endDate), blWhere(otherIncomeTable.businessLine))),
      db.select().from(jobsTable).where(and(eq(jobsTable.status, "in_progress"), blWhere(jobsTable.businessLine))),
      // Recent rows — always unfiltered
      db.select({ id: jobsTable.id, title: jobsTable.title, description: jobsTable.description, clientId: jobsTable.clientId, clientName: clientsTable.name, status: jobsTable.status, jobType: jobsTable.jobType, address: jobsTable.address, city: jobsTable.city, state: jobsTable.state, startDate: jobsTable.startDate, endDate: jobsTable.endDate, notes: jobsTable.notes, createdAt: jobsTable.createdAt }).from(jobsTable).leftJoin(clientsTable, eq(jobsTable.clientId, clientsTable.id)).orderBy(desc(jobsTable.createdAt)).limit(5),
      db.select({ id: invoicesTable.id, invoiceNumber: invoicesTable.invoiceNumber, clientId: invoicesTable.clientId, clientName: clientsTable.name, jobId: invoicesTable.jobId, status: invoicesTable.status, issueDate: invoicesTable.issueDate, dueDate: invoicesTable.dueDate, subtotal: invoicesTable.subtotal, taxRate: invoicesTable.taxRate, taxAmount: invoicesTable.taxAmount, total: invoicesTable.total, amountPaid: invoicesTable.amountPaid, notes: invoicesTable.notes, terms: invoicesTable.terms, lineItems: invoicesTable.lineItems, createdAt: invoicesTable.createdAt }).from(invoicesTable).leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id)).orderBy(desc(invoicesTable.createdAt)).limit(5),
      db.select().from(ownerCapitalEntriesTable).where(and(gte(ownerCapitalEntriesTable.date, startDate), lte(ownerCapitalEntriesTable.date, expenseEndDate))),
    ]);

    // Fetch full (unfiltered) data for byBusinessLine breakdown.
    // When no filter is active, KPI data == full data — reuse it to avoid extra queries.
    const [rawInvoices, rawExpenses, rawOtherIncome, rawActiveJobs] = validBl
      ? await Promise.all([
          db.select().from(invoicesTable).where(and(gte(invoicesTable.issueDate, startDate), lte(invoicesTable.issueDate, endDate))),
          db.select().from(expensesTable).where(and(gte(expensesTable.date, startDate), lte(expensesTable.date, expenseEndDate))),
          db.select().from(otherIncomeTable).where(and(gte(otherIncomeTable.date, startDate), lte(otherIncomeTable.date, endDate))),
          db.select().from(jobsTable).where(eq(jobsTable.status, "in_progress")),
        ])
      : [kpiInvoices, kpiExpenses, kpiOtherIncome, kpiActiveJobs];

    // YTD mileage — fetched separately for the "Tax Deductions" display card (always shows YTD totals)
    const ytdMileageLogs = period === "year"
      ? allMileage
      : await db.select().from(mileageLogsTable).where(and(gte(mileageLogsTable.date, ytdStart), lte(mileageLogsTable.date, endDate), eq(mileageLogsTable.classification, "business"), mileageWhere));

    const invoiceRevenue = kpiInvoices.filter(i => i.status === "paid").reduce((s, i) => s + parseFloat(i.total ?? "0"), 0);
    const otherIncomeTotal = kpiOtherIncome.reduce((s, o) => s + parseFloat(o.amount ?? "0"), 0);
    const totalRevenue = invoiceRevenue + otherIncomeTotal;
    const pendingInvoices = kpiInvoices.filter(i => i.status === "sent").reduce((s, i) => s + parseFloat(i.total ?? "0"), 0);
    const overdueInvoices = kpiInvoices.filter(i => i.status === "overdue").length;
    const nonMileageExpenses = kpiExpenses.filter(e => e.category !== "mileage");
    const totalExpenses = nonMileageExpenses.reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);
    const excludedFromProfitFormula = nonMileageExpenses
      .filter(e => e.excludeFromNetProfit)
      .reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);
    const excludedFromProfit = kpiExpenses
      .filter(e => e.excludeFromNetProfit)
      .reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);
    const excludedExpenseCount = kpiExpenses.filter(e => e.excludeFromNetProfit).length;
    // Period-consistent mileage deduction used in the profit formula
    const periodMileageDeduction = allMileage.reduce((s, m) => s + parseFloat(m.deductionAmount ?? "0"), 0);
    // YTD mileage deduction for the "Tax Deductions" display card (always YTD)
    const mileageDeduction = ytdMileageLogs.reduce((s, m) => s + parseFloat(m.deductionAmount ?? "0"), 0);
    // Mileage cannot be attributed to a single business line — exclude from filtered net profit
    const mileageForNetProfit = validBl ? 0 : periodMileageDeduction;
    const operationalNetProfit = totalRevenue - (totalExpenses - excludedFromProfitFormula) - mileageForNetProfit;
    // Owner draws — tracked separately, never reduce taxable profit.
    // Draws can come from two sources:
    //   1. Legacy: expenses with category "Owner Draw" (excludeFromNetProfit=true)
    //   2. New: owner_capital_entries with negative amount (posted via Record Draw dialog)
    const ownerDrawFromExpenses = nonMileageExpenses
      .filter(e => e.category === "Owner Draw")
      .reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);
    const ownerDrawFromCapital = kpiOwnerCapital
      .filter(e => parseFloat(e.amount as string) < 0)
      .reduce((s, e) => s + Math.abs(parseFloat(e.amount as string)), 0);
    const ownerDrawTotal = ownerDrawFromExpenses + ownerDrawFromCapital;
    const ytdMiles = ytdMileageLogs.reduce((s, m) => s + parseFloat(m.miles ?? "0"), 0);
    const ytdMileageRate = getIrsMileageRate(now.getFullYear());

    // Subcontractor pay metrics — query job_subcontractors directly.
    // "Paid" = you recorded a payment on the job card. Completely independent of
    // whether the client has paid the invoice. A Subcontractor expense record just
    // means you spent that money — it does NOT count as "owed".
    const subPayRows = await db.select({
      amountOwed:       jobSubcontractorsTable.amountOwed,
      amountPaid:       jobSubcontractorsTable.amountPaid,
      businessLine:     jobsTable.businessLine,
      compensationType: jobSubcontractorsTable.compensationType,
      allocationPct:    jobSubcontractorsTable.allocationPct,
      jobId:            jobSubcontractorsTable.jobId,
      computedOwed: sql<string>`COALESCE((
        SELECT SUM(h.hours * COALESCE(h.rate_snapshot, 0))
        FROM job_sub_hours h
        WHERE h.job_id = ${jobSubcontractorsTable.jobId}
          AND h.subcontractor_id = ${jobSubcontractorsTable.subcontractorId}
      ), 0)`,
    })
      .from(jobSubcontractorsTable)
      .innerJoin(jobsTable, eq(jobSubcontractorsTable.jobId, jobsTable.id));

    const allocationJobIds = [...new Set(
      subPayRows
        .filter(r => r.amountOwed == null && r.compensationType === "allocation" && r.jobId != null)
        .map(r => r.jobId as number),
    )];
    const splitPoolMap = await computeAllocationSplitPools(allocationJobIds);

    let subContractorOwed = 0;
    let subContractorPaid = 0;
    for (const r of subPayRows) {
      if (validBl && r.businessLine !== validBl) continue;
      let owed: number;
      if (r.amountOwed != null) {
        owed = parseFloat(r.amountOwed);
      } else if (r.compensationType === "allocation" && r.allocationPct != null && r.jobId != null) {
        const pool = splitPoolMap.get(r.jobId)?.splitPool ?? 0;
        owed = pool * (parseFloat(r.allocationPct) / 100);
      } else {
        owed = parseFloat(r.computedOwed ?? "0");
      }
      const paid = r.amountPaid != null ? parseFloat(r.amountPaid) : 0;
      subContractorPaid += paid;
      subContractorOwed += Math.max(0, owed - paid);
    }
    const subContractorRemaining = subContractorOwed;
    const ownerProfit = operationalNetProfit - subContractorRemaining;
    // undrawnBalance placed here (after subContractorRemaining) so it reflects real obligations
    const undrawnBalance = operationalNetProfit - ownerDrawTotal - subContractorRemaining;

    // Profit by business line breakdown — always computed from full (unfiltered) data
    const allBusinesses = await db.select({ slug: businessesTable.slug, name: businessesTable.name }).from(businessesTable).orderBy(businessesTable.id);
    const byBusinessLine = allBusinesses.map(biz => {
      const bl = biz.slug;
      const blInvoices = rawInvoices.filter(i => i.businessLine === bl);
      const blOther = rawOtherIncome.filter(o => o.businessLine === bl);
      const blExpenses = rawExpenses.filter(e => e.businessLine === bl && e.category !== "mileage");
      const blActiveJobs = rawActiveJobs.filter(j => j.businessLine === bl);
      const blRevenue = blInvoices.filter(i => i.status === "paid").reduce((s, i) => s + parseFloat(i.total ?? "0"), 0)
        + blOther.reduce((s, o) => s + parseFloat(o.amount ?? "0"), 0);
      const blExpenseTotal = blExpenses.reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);
      const blExcluded = blExpenses.filter(e => e.excludeFromNetProfit).reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);
      return {
        businessLine: bl,
        label: biz.name,
        totalRevenue: blRevenue,
        totalExpenses: blExpenseTotal,
        operationalNetProfit: blRevenue - (blExpenseTotal - blExcluded),
        activeJobs: blActiveJobs.length,
      };
    });

    // Unattributed: revenue/expenses not tagged to any registered business slug
    const knownBls = new Set(allBusinesses.map(b => b.slug));
    const unattribExpenses = rawExpenses.filter(e => (!e.businessLine || !knownBls.has(e.businessLine)) && e.category !== "mileage");
    const unattribInvoices = rawInvoices.filter(i => !i.businessLine || !knownBls.has(i.businessLine));
    const unattribOther = rawOtherIncome.filter(o => !o.businessLine || !knownBls.has(o.businessLine));
    const unattribRevenue = unattribInvoices.filter(i => i.status === "paid").reduce((s, i) => s + parseFloat(i.total ?? "0"), 0)
      + unattribOther.reduce((s, o) => s + parseFloat(o.amount ?? "0"), 0);
    const unattribExpenseTotal = unattribExpenses.reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);
    const unattribExcluded = unattribExpenses.filter(e => e.excludeFromNetProfit).reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);
    if (unattribRevenue > 0 || unattribExpenseTotal > 0) {
      byBusinessLine.push({
        businessLine: "unattributed",
        label: "Unattributed",
        totalRevenue: unattribRevenue,
        totalExpenses: unattribExpenseTotal,
        operationalNetProfit: unattribRevenue - (unattribExpenseTotal - unattribExcluded),
        activeJobs: 0,
      });
    }

    // Monthly revenue for last 6 months — DB-level filter applied for chart data
    const monthlyRevenue = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i);
      const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const [monthlyInv, monthlyExp, monthlyOther] = await Promise.all([
        db.select().from(invoicesTable).where(and(gte(invoicesTable.issueDate, `${monthStr}-01`), lte(invoicesTable.issueDate, `${monthStr}-31`), blWhere(invoicesTable.businessLine))),
        db.select().from(expensesTable).where(and(gte(expensesTable.date, `${monthStr}-01`), lte(expensesTable.date, `${monthStr}-31`), blWhere(expensesTable.businessLine))),
        db.select().from(otherIncomeTable).where(and(gte(otherIncomeTable.date, `${monthStr}-01`), lte(otherIncomeTable.date, `${monthStr}-31`), blWhere(otherIncomeTable.businessLine))),
      ]);
      const invRevenue = monthlyInv.filter(i => i.status === "paid").reduce((s, i) => s + parseFloat(i.total ?? "0"), 0);
      const othRevenue = monthlyOther.reduce((s, o) => s + parseFloat(o.amount ?? "0"), 0);
      monthlyRevenue.push({
        month: monthStr,
        revenue: invRevenue + othRevenue,
        expenses: monthlyExp.filter(e => e.category !== "mileage").reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0),
      });
    }

    res.json({
      totalRevenue,
      pendingInvoices,
      activeJobs: kpiActiveJobs.length,
      totalExpenses,
      mileageDeduction,
      periodMileageDeduction,
      ytdMiles,
      ytdMileageRate,
      overdueInvoices,
      operationalNetProfit,
      excludedFromProfit,
      formulaExcludedFromProfit: excludedFromProfitFormula,
      excludedExpenseCount,
      ownerDrawTotal,
      undrawnBalance,
      subContractorOwed,
      subContractorPaid,
      subContractorRemaining,
      ownerProfit,
      byBusinessLine,
      recentJobs: recentJobsRows.map(j => ({ ...j, createdAt: j.createdAt.toISOString() })),
      recentInvoices: recentInvoicesRows.map(i => ({
        ...i,
        jobTitle: null, jobCity: null, jobState: null,
        subtotal: parseFloat(i.subtotal ?? "0"),
        taxRate: i.taxRate ? parseFloat(i.taxRate) : null,
        taxAmount: i.taxAmount ? parseFloat(i.taxAmount) : null,
        total: parseFloat(i.total ?? "0"),
        amountPaid: i.amountPaid ? parseFloat(i.amountPaid) : null,
        lineItems: Array.isArray(i.lineItems) ? i.lineItems : [],
        createdAt: i.createdAt.toISOString(),
      })),
      monthlyRevenue,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get dashboard stats" });
  }
});

router.get("/compliance", sectionGuard("compliance"), async (_req, res) => {
  try {
    const [settings] = await db.select().from(settingsTable).limit(1);
    const threshold = parseFloat(settings?.thresholdAmount1099 ?? "600");

    const [subs, mileageLogs] = await Promise.all([
      db.select().from(subcontractorsTable),
      db.select().from(mileageLogsTable).where(eq(mileageLogsTable.classification, "business")),
    ]);

    const currentYear = new Date().getFullYear();
    const subsWithYtd = await Promise.all(subs.map(async s => ({
      ...s,
      _ytd: await computeYtd(s.id, currentYear),
    })));
    const subcontractor1099Alerts = subsWithYtd
      .filter(s => s._ytd >= threshold * 0.8)
      .map(s => {
        const ytd = s._ytd;
        let alert = "";
        if (ytd >= threshold) {
          alert = `${s.name} has reached the $${threshold} 1099 threshold ($${ytd.toFixed(2)} YTD)`;
        } else {
          alert = `${s.name} is approaching the $${threshold} threshold ($${ytd.toFixed(2)} YTD)`;
        }
        return { name: s.name, ytdPayments: ytd, threshold, w9OnFile: s.w9OnFile, alert };
      });

    const uncategorizedMileageCount = 0;
    const mileageAlerts: string[] = [];
    if (uncategorizedMileageCount > 0) {
      mileageAlerts.push(`${uncategorizedMileageCount} trips need classification`);
    }

    const today = new Date().toISOString().split("T")[0];
    const thirtyDaysOut = new Date();
    thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);
    const thirtyDaysStr = thirtyDaysOut.toISOString().split("T")[0];

    const licenseAlerts: any[] = [];
    for (const s of subs) {
      if (s.licenseExpiry && s.licenseExpiry <= thirtyDaysStr) {
        const days = Math.ceil((new Date(s.licenseExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        licenseAlerts.push({ subName: s.name, type: "License", expiryDate: s.licenseExpiry, daysUntilExpiry: days });
      }
      if (s.insuranceExpiry && s.insuranceExpiry <= thirtyDaysStr) {
        const days = Math.ceil((new Date(s.insuranceExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        licenseAlerts.push({ subName: s.name, type: "Insurance/COI", expiryDate: s.insuranceExpiry, daysUntilExpiry: days });
      }
    }

    res.json({ subcontractor1099Alerts, mileageAlerts, licenseAlerts, uncategorizedMileageCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get compliance report" });
  }
});

router.get("/accounting", sectionGuard("invoices"), async (req, res) => {
  try {
    const year = parseInt((req.query.year as string) || String(new Date().getFullYear()));
    const blFilter = (req.query.businessLine as string | undefined) || null;
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    // Optional DB-level business-line filter — accepts any slug, no hardcoded allowlist
    const blWhere = (col: Parameters<typeof eq>[0]) =>
      blFilter ? eq(col, blFilter) : undefined;

    // Resolve businessId from slug for mileage isolation
    let mileageBusinessId: number | null = null;
    if (blFilter) {
      const [biz] = await db.select({ id: businessesTable.id }).from(businessesTable).where(eq(businessesTable.slug, blFilter));
      mileageBusinessId = biz?.id ?? null;
    }
    const mileageWhere = mileageBusinessId ? eq(mileageLogsTable.businessId, mileageBusinessId) : undefined;

    const [invoices, expenses, mileageLogs, subs, settings, otherIncomeRows] = await Promise.all([
      db.select({
        id: invoicesTable.id,
        status: invoicesTable.status,
        subtotal: invoicesTable.subtotal,
        taxAmount: invoicesTable.taxAmount,
        total: invoicesTable.total,
        issueDate: invoicesTable.issueDate,
        invoiceCity: invoicesTable.city,
        invoiceState: invoicesTable.state,
        jobCity: jobsTable.city,
        jobState: jobsTable.state,
        clientName: clientsTable.name,
        invoiceNumber: invoicesTable.invoiceNumber,
        businessLine: invoicesTable.businessLine,
      })
        .from(invoicesTable)
        .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
        .leftJoin(jobsTable, eq(invoicesTable.jobId, jobsTable.id))
        .where(and(gte(invoicesTable.issueDate, startDate), lte(invoicesTable.issueDate, endDate), blWhere(invoicesTable.businessLine))),
      db.select().from(expensesTable).where(and(gte(expensesTable.date, startDate), lte(expensesTable.date, endDate), blWhere(expensesTable.businessLine))),
      db.select().from(mileageLogsTable).where(and(gte(mileageLogsTable.date, startDate), lte(mileageLogsTable.date, endDate), mileageWhere)),
      db.select().from(subcontractorsTable),
      db.select().from(settingsTable).limit(1),
      db.select().from(otherIncomeTable).where(and(gte(otherIncomeTable.date, startDate), lte(otherIncomeTable.date, endDate), blWhere(otherIncomeTable.businessLine))),
    ]);

    const rate = parseFloat(settings[0]?.mileageRate ?? "0.725");

    const invoiceGrossRevenue = invoices.reduce((s, i) => s + parseFloat(i.total ?? "0"), 0);
    const invoicePaidRevenue = invoices.filter(i => i.status === "paid").reduce((s, i) => s + parseFloat(i.total ?? "0"), 0);
    const pendingRevenue = invoices.filter(i => ["sent", "overdue"].includes(i.status)).reduce((s, i) => s + parseFloat(i.total ?? "0"), 0);
    const otherIncomeSum = otherIncomeRows.reduce((s, o) => s + parseFloat(o.amount ?? "0"), 0);
    const grossRevenue = invoiceGrossRevenue + otherIncomeSum;
    const paidRevenue = invoicePaidRevenue + otherIncomeSum;

    // Exclude mileage category — it's tracked separately via mileageDeduction from
    // mileage_logs to prevent double-counting in the net profit calculation.
    const nonMileageExpenses = expenses.filter(e => e.category !== "mileage");
    const totalExpenses = nonMileageExpenses.reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);
    // Owner Draws are personal distributions — not tax-deductible. Exclude from net profit.
    const ownerDrawTotal = nonMileageExpenses
      .filter(e => e.category === "Owner Draw")
      .reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);

    const businessMiles = mileageLogs.filter(m => m.classification === "business");
    const totalMiles = businessMiles.reduce((s, m) => s + parseFloat(m.miles ?? "0"), 0);
    const mileageDeduction = businessMiles.reduce((s, m) => s + parseFloat(m.deductionAmount ?? "0"), 0);

    const subsWithYtdAcc = await Promise.all(subs.map(async s => ({
      ...s,
      _ytd: await computeYtd(s.id, year),
    })));
    const totalSubPayments = subsWithYtdAcc.reduce((acc, s) => acc + s._ytd, 0);
    // Net profit excludes owner draws (not a business expense for tax purposes)
    const netProfit = paidRevenue - (totalExpenses - ownerDrawTotal) - mileageDeduction;
    const undrawnBalance = netProfit - ownerDrawTotal;

    // Income by city — estOccTax replaces taxCollected (Willard never charges sales tax)
    // Owensboro occupational tax rate: 1.39%
    const OWENSBORO_OCC_RATE = 0.0139;
    const cityMap = new Map<string, { city: string; state: string; invoiceCount: number; gross: number; paid: number; estOccTax: number }>();
    for (const inv of invoices) {
      const city = inv.invoiceCity || inv.jobCity || "Unspecified";
      const state = inv.invoiceState || inv.jobState || "";
      const key = `${city}||${state}`;
      const existing = cityMap.get(key) ?? { city, state, invoiceCount: 0, gross: 0, paid: 0, estOccTax: 0 };
      existing.invoiceCount++;
      const total = parseFloat(inv.total ?? "0");
      existing.gross += total;
      if (inv.status === "paid") existing.paid += total;
      cityMap.set(key, existing);
    }
    // Also include other income rows that have a city
    for (const o of otherIncomeRows) {
      const city = (o.city ?? "").trim();
      if (!city) continue;
      const state = (o.state ?? "").trim();
      const key = `${city}||${state}`;
      const existing = cityMap.get(key) ?? { city, state, invoiceCount: 0, gross: 0, paid: 0, estOccTax: 0 };
      const amt = parseFloat(o.amount ?? "0");
      existing.gross += amt;
      existing.paid += amt;
      existing.invoiceCount++;
      cityMap.set(key, existing);
    }
    // Compute estOccTax after all income is accumulated (only for Owensboro rows)
    for (const row of cityMap.values()) {
      if (row.city.toLowerCase() === "owensboro") {
        row.estOccTax = Math.max(0, row.gross * OWENSBORO_OCC_RATE);
      }
    }
    const incomeByCity = Array.from(cityMap.values()).sort((a, b) => b.gross - a.gross);

    // Estimated tax liabilities based on YTD net profit
    // Sum across ALL Owensboro rows (same city may appear with different state/blank state values)
    const owensboroGross = incomeByCity
      .filter(r => r.city.trim().toLowerCase() === "owensboro")
      .reduce((s, r) => s + r.gross, 0);
    const owensboroOccTax = Math.max(0, owensboroGross * OWENSBORO_OCC_RATE);
    const kyStateTax = Math.max(0, netProfit * 0.04);
    // IRS SE tax: 15.3% × (net profit × 92.35%) — 92.35% accounts for half-SE deduction
    const federalSETax = Math.max(0, netProfit * 0.9235 * 0.153);
    const estimatedTaxes = {
      owensboroOccTax,
      kyStateTax,
      federalSETax,
      totalEstimated: owensboroOccTax + kyStateTax + federalSETax,
      owensboroOccRate: OWENSBORO_OCC_RATE,
      kyStateRate: 0.04,
      federalSERate: 0.153,
    };

    // Full records for tax spreadsheet — invoices + other income rows
    const invoiceRecords = invoices.map(inv => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      issueDate: inv.issueDate,
      clientName: inv.clientName ?? "",
      jobTitle: "",
      city: inv.invoiceCity || inv.jobCity || "",
      state: inv.invoiceState || inv.jobState || "",
      subtotal: parseFloat(inv.subtotal ?? "0"),
      taxAmount: parseFloat(inv.taxAmount ?? "0"),
      total: parseFloat(inv.total ?? "0"),
      status: inv.status,
      type: "invoice" as const,
    }));
    const otherIncomeRecords = otherIncomeRows.map(o => ({
      invoiceNumber: `OTHER`,
      issueDate: o.date,
      clientName: o.source ?? "",
      jobTitle: o.description,
      city: o.city ?? "",
      state: o.state ?? "",
      subtotal: parseFloat(o.amount ?? "0"),
      taxAmount: 0,
      total: parseFloat(o.amount ?? "0"),
      status: "paid" as const,
      type: "other_income" as const,
      paymentMethod: o.paymentMethod,
    }));
    const allRecords = [...invoiceRecords, ...otherIncomeRecords].sort((a, b) => a.issueDate.localeCompare(b.issueDate));

    // Expenses by category (mileage and Owner Draw excluded — mileage shown separately,
    // Owner Draw is a personal distribution not a business cost)
    const catMap = new Map<string, { category: string; amount: number; count: number }>();
    for (const e of nonMileageExpenses) {
      if (e.category === "Owner Draw") continue;
      const cat = e.category || "Uncategorized";
      const existing = catMap.get(cat) ?? { category: cat, amount: 0, count: 0 };
      existing.amount += parseFloat(e.amount ?? "0");
      existing.count++;
      catMap.set(cat, existing);
    }
    const expensesByCategory = Array.from(catMap.values()).sort((a, b) => b.amount - a.amount);
    // Business expenses = total non-mileage expenses minus owner draws
    const businessExpenses = totalExpenses - ownerDrawTotal;

    // Direct Job Costs vs Overhead split
    // Direct = expenses linked to a specific job (jobId set); Overhead = not linked to any job
    const buildCatBreakdown = (list: typeof nonMileageExpenses) => {
      const map = new Map<string, { category: string; amount: number; count: number }>();
      for (const e of list) {
        const cat = e.category || "Uncategorized";
        const row = map.get(cat) ?? { category: cat, amount: 0, count: 0 };
        row.amount += parseFloat(e.amount ?? "0");
        row.count++;
        map.set(cat, row);
      }
      return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
    };
    const directJobExpenses = nonMileageExpenses.filter(e => e.jobId != null && e.category !== "Owner Draw");
    const overheadExpenses  = nonMileageExpenses.filter(e => e.jobId == null  && e.category !== "Owner Draw");
    const directJobCosts = directJobExpenses.reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);
    const overheadCosts  = overheadExpenses.reduce((s, e)  => s + parseFloat(e.amount ?? "0"), 0);
    const grossMargin = paidRevenue - directJobCosts;
    const directJobCostsByCategory = buildCatBreakdown(directJobExpenses);
    const overheadByCategory = buildCatBreakdown(overheadExpenses);

    // Monthly income trend
    const monthlyIncome = [];
    for (let m = 1; m <= 12; m++) {
      const ms = `${year}-${String(m).padStart(2, "0")}`;
      const monthInvs = invoices.filter(i => i.issueDate.startsWith(ms));
      const monthExp = nonMileageExpenses.filter(e => e.date.startsWith(ms));
      const monthOther = otherIncomeRows.filter(o => o.date.startsWith(ms));
      const invGross = monthInvs.reduce((s, i) => s + parseFloat(i.total ?? "0"), 0);
      const othGross = monthOther.reduce((s, o) => s + parseFloat(o.amount ?? "0"), 0);
      monthlyIncome.push({
        month: ms,
        gross: invGross + othGross,
        paid: monthInvs.filter(i => i.status === "paid").reduce((s, i) => s + parseFloat(i.total ?? "0"), 0) + othGross,
        expenses: monthExp.reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0),
      });
    }

    const threshold = parseFloat(settings[0]?.thresholdAmount1099 ?? "600");
    const subcontractor1099 = subsWithYtdAcc.map(s => ({
      id: s.id,
      name: s.name,
      ytdPayments: s._ytd,
      threshold,
      requires1099: s._ytd >= threshold,
      w9OnFile: s.w9OnFile,
    }));

    const allBusinesses = await db.select({ slug: businessesTable.slug, name: businessesTable.name }).from(businessesTable).orderBy(businessesTable.id);
    const knownBlSlugs = new Set(allBusinesses.map(b => b.slug));
    const byBusinessLine: { businessLine: string; label: string; invoiceCount: number; invoiceGross: number; invoicePaid: number; otherIncome: number; totalRevenue: number; collectedRevenue: number; expenses: number; netProfit: number }[] = [];
    for (const biz of allBusinesses) {
      const bl = biz.slug;
      const blInvoices = invoices.filter(i => i.businessLine === bl);
      const blOther = otherIncomeRows.filter(o => o.businessLine === bl);
      const blExpenses = nonMileageExpenses.filter(e => e.businessLine === bl);
      const invoiceGross = blInvoices.reduce((s, i) => s + parseFloat(i.total ?? "0"), 0);
      const invoicePaid = blInvoices.filter(i => i.status === "paid").reduce((s, i) => s + parseFloat(i.total ?? "0"), 0);
      const otherSum = blOther.reduce((s, o) => s + parseFloat(o.amount ?? "0"), 0);
      const expSum = blExpenses.reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);
      byBusinessLine.push({
        businessLine: bl,
        label: biz.name,
        invoiceCount: blInvoices.length,
        invoiceGross,
        invoicePaid,
        otherIncome: otherSum,
        totalRevenue: invoiceGross + otherSum,
        collectedRevenue: invoicePaid + otherSum,
        expenses: expSum,
        netProfit: (invoicePaid + otherSum) - expSum,
      });
    }
    // Untagged: items not assigned to any registered business slug
    {
      const blInvoices = invoices.filter(i => !i.businessLine || !knownBlSlugs.has(i.businessLine));
      const blOther = otherIncomeRows.filter(o => !o.businessLine || !knownBlSlugs.has(o.businessLine));
      const blExpenses = nonMileageExpenses.filter(e => !e.businessLine || !knownBlSlugs.has(e.businessLine));
      const invoiceGross = blInvoices.reduce((s, i) => s + parseFloat(i.total ?? "0"), 0);
      const invoicePaid = blInvoices.filter(i => i.status === "paid").reduce((s, i) => s + parseFloat(i.total ?? "0"), 0);
      const otherSum = blOther.reduce((s, o) => s + parseFloat(o.amount ?? "0"), 0);
      const expSum = blExpenses.reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);
      byBusinessLine.push({
        businessLine: "untagged",
        label: "Untagged",
        invoiceCount: blInvoices.length,
        invoiceGross,
        invoicePaid,
        otherIncome: otherSum,
        totalRevenue: invoiceGross + otherSum,
        collectedRevenue: invoicePaid + otherSum,
        expenses: expSum,
        netProfit: (invoicePaid + otherSum) - expSum,
      });
    }

    const ownerDrawRows = nonMileageExpenses
      .filter(e => e.category === "Owner Draw")
      .map(e => ({ id: e.id, date: e.date, amount: parseFloat(e.amount ?? "0"), description: e.description, notes: e.notes ?? null, vendor: e.vendor ?? null }))
      .sort((a, b) => b.date.localeCompare(a.date));

    // Outstanding fixed/allocation sub payments — unpaid subs that haven't yet had
    // Mark Paid clicked (which would create an expense record). Hourly subs are excluded
    // because their hours auto-create expenses and are already in totalExpenses.
    const outstandingSubRows = await db.select({
      subName: subcontractorsTable.name,
      jobTitle: jobsTable.title,
      jobId: jobSubcontractorsTable.jobId,
      amountOwed: jobSubcontractorsTable.amountOwed,
      fixedAmount: jobSubcontractorsTable.fixedAmount,
      amountPaid: jobSubcontractorsTable.amountPaid,
      compensationType: jobSubcontractorsTable.compensationType,
      allocationPct: jobSubcontractorsTable.allocationPct,
      businessLine: jobsTable.businessLine,
    })
      .from(jobSubcontractorsTable)
      .innerJoin(jobsTable, eq(jobSubcontractorsTable.jobId, jobsTable.id))
      .innerJoin(subcontractorsTable, eq(jobSubcontractorsTable.subcontractorId, subcontractorsTable.id))
      .where(and(
        inArray(jobSubcontractorsTable.paymentStatus, ["unpaid", "partial"]),
        inArray(jobSubcontractorsTable.compensationType, ["fixed", "allocation"]),
        blFilter ? eq(jobsTable.businessLine, blFilter) : undefined,
      ));

    const outstandingAllocJobIds = [...new Set(
      outstandingSubRows
        .filter(r => r.amountOwed == null && r.compensationType === "allocation" && r.jobId != null)
        .map(r => r.jobId as number),
    )];
    const outstandingPoolMap = await computeAllocationSplitPools(outstandingAllocJobIds);

    const outstandingSubPayments = outstandingSubRows.map(r => {
      let fullOwed: number | null;
      if (r.amountOwed != null) {
        fullOwed = parseFloat(r.amountOwed);
      } else if (r.compensationType === "allocation" && r.allocationPct != null && r.jobId != null) {
        const pool = outstandingPoolMap.get(r.jobId)?.splitPool ?? 0;
        fullOwed = pool * (parseFloat(r.allocationPct) / 100);
      } else if (r.fixedAmount != null) {
        fullOwed = parseFloat(r.fixedAmount);
      } else {
        fullOwed = null;
      }
      const alreadyPaid = r.amountPaid != null ? parseFloat(r.amountPaid) : 0;
      const remaining = fullOwed != null ? Math.max(0, fullOwed - alreadyPaid) : null;
      return {
        subName: r.subName,
        jobTitle: r.jobTitle ?? "",
        jobId: r.jobId,
        compensationType: r.compensationType,
        amount: remaining,
        businessLine: r.businessLine,
      };
    });
    const outstandingSubTotal = outstandingSubPayments.reduce((s, i) => s + (i.amount ?? 0), 0);

    res.json({
      year,
      summary: { grossRevenue, paidRevenue, pendingRevenue, totalExpenses, businessExpenses, totalMiles, mileageDeduction, mileageRate: rate, totalSubPayments, netProfit, otherIncomeTotal: otherIncomeSum, ownerDrawTotal, undrawnBalance, directJobCosts, overheadCosts, grossMargin },
      incomeByCity,
      estimatedTaxes,
      expensesByCategory,
      directJobCostsByCategory,
      overheadByCategory,
      monthlyIncome,
      subcontractor1099,
      invoiceRecords: allRecords,
      otherIncomeRows,
      byBusinessLine,
      ownerDrawRows,
      outstandingSubPayments,
      outstandingSubTotal,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate accounting report" });
  }
});

const PL_CATEGORY_MAP: Record<string, "cogs" | "advertising" | "carTruck" | "contractLabor" | "insurance" | "professionalFees" | "officeExpense" | "rent" | "repairs" | "supplies" | "utilities" | "depreciation" | "other"> = {
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
  "materials":             "cogs",
  "advertising":           "advertising",
  "marketing":             "advertising",
  "fuel":                  "carTruck",
  "labor":                 "contractLabor",
  "subcontractor":         "contractLabor",
  "insurance":             "insurance",
  "professional-services": "professionalFees",
  "accounting":            "professionalFees",
  "legal":                 "professionalFees",
  "office-supplies":       "officeExpense",
  "office supplies":       "officeExpense",
  "rent":                  "rent",
  "supplies":              "supplies",
  "tools":                 "supplies",
  "repairs":               "repairs",
  "maintenance":           "repairs",
  "utilities":             "utilities",
  "depreciation":          "depreciation",
};

const PL_OPEX_LABELS: Record<string, string> = {
  advertising:      "Advertising",
  carTruck:         "Fuel / Travel",
  contractLabor:    "Contract Labor (Subcontractors)",
  depreciation:     "Depreciation & Section 179",
  insurance:        "Insurance",
  officeExpense:    "Office / Admin",
  professionalFees: "Legal & Professional Services",
  rent:             "Rent / Lease",
  repairs:          "Repairs & Maintenance",
  supplies:         "Tools & Equipment / Supplies",
  utilities:        "Utilities",
  other:            "Other Expenses",
};

router.get("/profit-loss", sectionGuard("invoices"), async (req, res) => {
  try {
    const year = parseInt((req.query.year as string) || String(new Date().getFullYear()));
    const blFilter = (req.query.businessLine as string | undefined) || null;
    const startDate = `${year}-01-01`;
    const endDate   = `${year}-12-31`;

    const blWhere = (col: Parameters<typeof eq>[0]) =>
      blFilter ? eq(col, blFilter) : undefined;

    let mileageBusinessId: number | null = null;
    if (blFilter) {
      const [biz] = await db.select({ id: businessesTable.id }).from(businessesTable).where(eq(businessesTable.slug, blFilter));
      mileageBusinessId = biz?.id ?? null;
    }
    const mileageWhere = mileageBusinessId ? eq(mileageLogsTable.businessId, mileageBusinessId) : undefined;

    const [invRows, expRows, mileRows, otherRows] = await Promise.all([
      db.select({ status: invoicesTable.status, total: invoicesTable.total })
        .from(invoicesTable)
        .where(and(gte(invoicesTable.issueDate, startDate), lte(invoicesTable.issueDate, endDate), blWhere(invoicesTable.businessLine))),
      db.select({
        category: expensesTable.category,
        amount: expensesTable.amount,
        excludeFromNetProfit: expensesTable.excludeFromNetProfit,
      })
        .from(expensesTable)
        .where(and(gte(expensesTable.date, startDate), lte(expensesTable.date, endDate), ne(expensesTable.category, "mileage"), blWhere(expensesTable.businessLine))),
      db.select({ totalMiles: sum(mileageLogsTable.miles), totalDed: sum(mileageLogsTable.deductionAmount) })
        .from(mileageLogsTable)
        .where(and(eq(mileageLogsTable.classification, "business"), gte(mileageLogsTable.date, startDate), lte(mileageLogsTable.date, endDate), mileageWhere)),
      db.select({ amount: otherIncomeTable.amount })
        .from(otherIncomeTable)
        .where(and(gte(otherIncomeTable.date, startDate), lte(otherIncomeTable.date, endDate), blWhere(otherIncomeTable.businessLine))),
      // NOTE: job_subcontractors.amount_paid is intentionally NOT added here.
      // Sub hours auto-create linked expenses in expensesTable (category="Subcontractor"),
      // so expRows already captures all hourly sub costs. Adding amount_paid on top
      // would double-count those payments. Flat-rate subs that don't use the hours
      // system should record a manual expense to appear here.
    ]);

    // Outstanding fixed/allocation sub liability — unpaid subs that haven't yet
    // created an expense record (only happens when Mark Paid is clicked).
    // Hourly subs are excluded: their hours auto-create expenses, so they already
    // appear in the Contract Labor line above.
    const outstandingSubRows = await db.select({
      subName: subcontractorsTable.name,
      jobTitle: jobsTable.title,
      jobId: jobSubcontractorsTable.jobId,
      amountOwed: jobSubcontractorsTable.amountOwed,
      fixedAmount: jobSubcontractorsTable.fixedAmount,
      amountPaid: jobSubcontractorsTable.amountPaid,
      compensationType: jobSubcontractorsTable.compensationType,
      businessLine: jobsTable.businessLine,
    })
      .from(jobSubcontractorsTable)
      .innerJoin(jobsTable, eq(jobSubcontractorsTable.jobId, jobsTable.id))
      .innerJoin(subcontractorsTable, eq(jobSubcontractorsTable.subcontractorId, subcontractorsTable.id))
      .where(and(
        inArray(jobSubcontractorsTable.paymentStatus, ["unpaid", "partial"]),
        inArray(jobSubcontractorsTable.compensationType, ["fixed", "allocation"]),
        blFilter ? eq(jobsTable.businessLine, blFilter) : undefined,
      ));

    const outstandingSubItems = outstandingSubRows.map(r => {
      const fullOwed = r.amountOwed != null ? parseFloat(r.amountOwed) : r.fixedAmount != null ? parseFloat(r.fixedAmount) : null;
      const alreadyPaid = r.amountPaid != null ? parseFloat(r.amountPaid) : 0;
      const remaining = fullOwed != null ? Math.max(0, fullOwed - alreadyPaid) : null;
      return {
        subName: r.subName,
        jobTitle: r.jobTitle ?? "",
        jobId: r.jobId,
        compensationType: r.compensationType,
        amount: remaining,
      };
    });
    const outstandingSubTotal = outstandingSubItems.reduce((s, i) => s + (i.amount ?? 0), 0);
    const outstandingSubLiability = { total: outstandingSubTotal, items: outstandingSubItems };

    // Count jobs archived (closed) within this P&L year — purely informational for the UI badge
    const [closedCountRow] = await db.select({ n: count() })
      .from(jobsTable)
      .where(and(
        eq(jobsTable.status, "closed"),
        gte(jobsTable.closedAt, startDate),
        lte(jobsTable.closedAt, endDate),
        blFilter ? eq(jobsTable.businessLine, blFilter) : undefined,
      ));
    const closedJobCount = closedCountRow?.n ?? 0;

    const grossReceipts = invRows.filter(i => i.status === "paid").reduce((s, i) => s + parseFloat(i.total ?? "0"), 0);
    const otherIncome   = otherRows.reduce((s, o) => s + parseFloat(o.amount ?? "0"), 0);
    const grossRevenue  = grossReceipts + otherIncome;

    const normalExpenses = expRows.filter(e => !e.excludeFromNetProfit);
    const writtenOffExpenses = expRows.filter(e => e.excludeFromNetProfit);
    const writeoffsTotal = writtenOffExpenses.reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);

    const buckets: Record<string, number> = {};
    for (const e of normalExpenses) {
      const cat = e.category || "Other";
      const key = PL_CATEGORY_MAP[cat] ?? "other";
      buckets[key] = (buckets[key] ?? 0) + parseFloat(e.amount ?? "0");
    }

    const cogs = buckets["cogs"] ?? 0;
    const grossProfit = grossRevenue - cogs;

    const operatingExpenses: { label: string; key: string; amount: number }[] = [];
    for (const [key, label] of Object.entries(PL_OPEX_LABELS)) {
      operatingExpenses.push({ label, key, amount: buckets[key] ?? 0 });
    }

    const totalOperatingExpenses = operatingExpenses.reduce((s, x) => s + x.amount, 0);
    const netOperatingIncome = grossProfit - totalOperatingExpenses;

    const totalMiles = mileRows[0]?.totalMiles ? parseFloat(mileRows[0].totalMiles as string) : 0;
    const mileageDeduction = mileRows[0]?.totalDed ? parseFloat(mileRows[0].totalDed as string) : 0;
    const mileageRate = getIrsMileageRate(year);
    const netProfit = netOperatingIncome - mileageDeduction;

    res.json({
      year,
      revenue: { grossReceipts, otherIncome, grossRevenue },
      cogs: { materials: cogs, total: cogs },
      grossProfit,
      operatingExpenses,
      totalOperatingExpenses,
      netOperatingIncome,
      deductions: { mileageDeduction, totalMiles, mileageRate, writeoffsTotal },
      netProfit,
      outstandingSubLiability,
      closedJobCount,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate profit & loss report" });
  }
});

// ─── Year-End Accountant Report ──────────────────────────────────────────────

function calcAnnualDepreciation(asset: {
  purchasePrice: string | number;
  purchaseDate: string;
  salvageValue?: string | number | null;
  usefulLifeYears?: number | null;
  depreciationMethod?: string | null;
  bonusDepreciationPct?: number | null;
}, forYear: number): number {
  const cost = parseFloat(String(asset.purchasePrice));
  const salvage = parseFloat(String(asset.salvageValue ?? 0));
  const life = asset.usefulLifeYears ?? 5;
  const method = asset.depreciationMethod ?? "straight-line";
  const bonusPct = (asset.bonusDepreciationPct ?? 60) / 100;
  const startYear = parseInt(asset.purchaseDate.slice(0, 4));

  if (!life || life <= 0 || cost <= 0) return 0;
  if (forYear < startYear || forYear >= startYear + life) return 0;

  const yearIndex = forYear - startYear;

  if (method === "section-179") {
    return yearIndex === 0 ? cost : 0;
  }

  if (method === "bonus") {
    const depreciableBasis = cost - salvage;
    if (life <= 1) return yearIndex === 0 ? depreciableBasis : 0;
    const bonusDeduction = depreciableBasis * bonusPct;
    const remainder = depreciableBasis - bonusDeduction;
    const remainingYears = life - 1;
    const annualOnRemainder = remainingYears > 0 ? remainder / remainingYears : 0;
    return yearIndex === 0 ? bonusDeduction : annualOnRemainder;
  }

  // straight-line
  return (cost - salvage) / life;
}

router.get("/year-end", ownerGuard(), async (req, res) => {
  try {
    const year = parseInt((req.query.year as string) || String(new Date().getFullYear()));
    const blFilter = (req.query.businessLine as string | undefined) || null;
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const blWhere = (col: Parameters<typeof eq>[0]) =>
      blFilter ? eq(col, blFilter) : undefined;

    let mileageBusinessId: number | null = null;
    if (blFilter) {
      const [biz] = await db.select({ id: businessesTable.id }).from(businessesTable).where(eq(businessesTable.slug, blFilter));
      mileageBusinessId = biz?.id ?? null;
    }
    // Mirror Schedule C rule (Task #919):
    // • No business filter → include ALL mileage (null businessId logs count globally)
    // • Business filter active + slug resolved → only logs tagged to that business (strict eq, no null fallback)
    // • Business filter active + slug not found → match nothing (safer than returning global totals for an invalid slug)
    const mileageWhere = blFilter
      ? (mileageBusinessId != null ? eq(mileageLogsTable.businessId, mileageBusinessId) : eq(mileageLogsTable.businessId, -1))
      : undefined;

    const [
      invoices,
      expenses,
      mileageLogs,
      otherIncomeRows,
      assets,
      taxPayments,
      subs,
      settings,
      busUseRows,
    ] = await Promise.all([
      db.select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        status: invoicesTable.status,
        issueDate: invoicesTable.issueDate,
        total: invoicesTable.total,
        subtotal: invoicesTable.subtotal,
        clientName: clientsTable.name,
        city: invoicesTable.city,
        state: invoicesTable.state,
        stripePaidAt: invoicesTable.stripePaidAt,
        squarePaidAt: invoicesTable.squarePaidAt,
      })
        .from(invoicesTable)
        .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
        .where(and(eq(invoicesTable.status, "paid"), blWhere(invoicesTable.businessLine))),
      db.select().from(expensesTable)
        .where(and(gte(expensesTable.date, startDate), lte(expensesTable.date, endDate), blWhere(expensesTable.businessLine))),
      db.select().from(mileageLogsTable)
        .where(and(gte(mileageLogsTable.date, startDate), lte(mileageLogsTable.date, endDate), eq(mileageLogsTable.classification, "business"), mileageWhere)),
      db.select().from(otherIncomeTable)
        .where(and(gte(otherIncomeTable.date, startDate), lte(otherIncomeTable.date, endDate), blWhere(otherIncomeTable.businessLine))),
      db.select().from(assetsTable),
      db.select().from(estimatedTaxPaymentsTable)
        .where(eq(estimatedTaxPaymentsTable.year, year)),
      db.select().from(subcontractorsTable),
      db.select().from(settingsTable).limit(1),
      db.select().from(assetBusinessUseTable),
    ]);

    // Build lookup: assetId → year → businessUsePct
    const busUseMap = new Map<number, Map<number, number>>();
    for (const row of busUseRows) {
      if (!busUseMap.has(row.assetId)) busUseMap.set(row.assetId, new Map());
      busUseMap.get(row.assetId)!.set(row.year, row.businessUsePct);
    }
    const getBusUsePct = (assetId: number, forYear: number): number => {
      return busUseMap.get(assetId)?.get(forYear) ?? 100;
    };

    // ── P&L Summary ──────────────────────────────────────────────────────────
    // Cash-basis: use electronic payment timestamps when available; fall back to issueDate for manual payments
    const getEffectivePaymentYear = (inv: typeof invoices[number]): number => {
      if (inv.stripePaidAt) return inv.stripePaidAt.getFullYear();
      if (inv.squarePaidAt) return inv.squarePaidAt.getFullYear();
      return parseInt(inv.issueDate.slice(0, 4));
    };
    const paidInvoices = invoices.filter(i => getEffectivePaymentYear(i) === year);
    const grossReceipts = paidInvoices.reduce((s, i) => s + parseFloat(i.total ?? "0"), 0);
    const otherIncomeTotal = otherIncomeRows.reduce((s, o) => s + parseFloat(o.amount ?? "0"), 0);
    const totalRevenue = grossReceipts + otherIncomeTotal;

    // Owner Draw is a personal distribution — not a Schedule C deduction.
    // Exclude it here so totalExpenses matches the expensesBySchedC breakdown total.
    const nonMileageExpenses = expenses.filter(e => e.category !== "mileage" && e.category !== "Owner Draw");
    const totalExpenses = nonMileageExpenses.reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);

    const totalMiles = mileageLogs.reduce((s, m) => s + parseFloat(m.miles ?? "0"), 0);
    const mileageDeduction = mileageLogs.reduce((s, m) => s + parseFloat(m.deductionAmount ?? "0"), 0);
    const mileageRate = getIrsMileageRate(year);

    // ── Asset Depreciation for the Year ──────────────────────────────────────
    // Helper: year in which an asset was disposed (sold or retired), or null if still active
    const getDisposalYear = (a: typeof assets[number]): number | null => {
      if ((a.status === "sold" || a.status === "retired") && a.saleDate) {
        return parseInt(a.saleDate.slice(0, 4));
      }
      return null;
    };

    const depreciationRows = assets
      .filter(a => {
        const disposalYear = getDisposalYear(a);
        // Exclude assets disposed of BEFORE the report year (no deduction for those years)
        return disposalYear === null || disposalYear >= year;
      })
      .map(a => {
        const busUsePct = getBusUsePct(a.id, year);
        const annual = calcAnnualDepreciation(a, year) * (busUsePct / 100);
        const cost = parseFloat(String(a.purchasePrice));
        const salvage = parseFloat(String(a.salvageValue ?? 0));
        const life = a.usefulLifeYears ?? 5;
        const startYear = parseInt(a.purchaseDate.slice(0, 4));
        const disposalYear = getDisposalYear(a);
        // Build full multi-year schedule for this asset
        const scheduleEndYear = disposalYear !== null
          ? Math.min(disposalYear, startYear + life - 1)
          : startYear + life - 1;
        let accumulated = 0;
        const schedule: { year: number; businessUsePct: number; annualDeduction: number; accumulated: number; bookValue: number }[] = [];
        for (let y2 = startYear; y2 <= scheduleEndYear; y2++) {
          const busUse2 = getBusUsePct(a.id, y2);
          const deduction = calcAnnualDepreciation(a, y2) * (busUse2 / 100);
          accumulated += deduction;
          const bookValue = Math.max(salvage, cost - accumulated);
          schedule.push({ year: y2, businessUsePct: busUse2, annualDeduction: deduction, accumulated, bookValue });
        }
        return {
          id: a.id,
          name: a.name,
          assetType: a.assetType,
          purchaseDate: a.purchaseDate,
          purchasePrice: cost,
          depreciationMethod: a.depreciationMethod ?? "straight-line",
          usefulLifeYears: life,
          salvageValue: salvage,
          bonusDepreciationPct: a.bonusDepreciationPct ?? 60,
          section179Eligible: a.section179Eligible,
          annualDeduction: annual,
          businessUsePct: busUsePct,
          status: a.status,
          schedule,
        };
      })
      .filter(r => r.annualDeduction > 0);

    const totalDepreciation = depreciationRows.reduce((s, r) => s + r.annualDeduction, 0);

    // Total accumulated depreciation across ALL assets (active + sold + retired),
    // summed from purchase year through min(disposal year, report year)
    const totalAccumulatedDepreciation = assets.reduce((sum, a) => {
      const startYear = parseInt(a.purchaseDate.slice(0, 4));
      const disposalYear = getDisposalYear(a);
      const endYear = disposalYear !== null ? Math.min(disposalYear, year) : year;
      let acc = 0;
      for (let y2 = startYear; y2 <= endYear; y2++) {
        acc += calcAnnualDepreciation(a, y2) * (getBusUsePct(a.id, y2) / 100);
      }
      return sum + acc;
    }, 0);

    // ── Disposed Assets ───────────────────────────────────────────────────────
    const disposedAssets = assets
      .filter(a => (a.status === "sold" || a.status === "retired") && a.saleDate && a.saleDate.startsWith(String(year)))
      .map(a => {
        const cost = parseFloat(String(a.purchasePrice));
        const salvage = parseFloat(String(a.salvageValue ?? 0));
        const life = a.usefulLifeYears ?? 5;
        const startYear = parseInt(a.purchaseDate.slice(0, 4));
        const saleYear = parseInt((a.saleDate ?? "").slice(0, 4));
        let accumulated = 0;
        for (let y2 = startYear; y2 < saleYear; y2++) {
          accumulated += calcAnnualDepreciation(a, y2) * (getBusUsePct(a.id, y2) / 100);
        }
        const bookValue = Math.max(salvage, cost - accumulated);
        const salePrice = a.salePrice != null ? parseFloat(String(a.salePrice)) : 0;
        return {
          id: a.id,
          name: a.name,
          assetType: a.assetType,
          purchaseDate: a.purchaseDate,
          purchasePrice: cost,
          saleDate: a.saleDate,
          salePrice,
          bookValue,
          gainLoss: salePrice - bookValue,
          status: a.status,
        };
      });

    // ── Expenses by Schedule C Category ──────────────────────────────────────
    const SCHED_C_MAP: Record<string, string> = {
      // ── Exact DB category values (lowercased) ──────────────────────────────
      "materials":             "Line 36 – Materials/Supplies",
      "advertising":           "Line 8 – Advertising",
      "fuel/travel":           "Line 9 – Car & Truck Expenses",
      "insurance":             "Line 15 – Insurance",
      "professional services": "Line 17 – Legal/Professional",
      "office/admin":          "Line 18 – Office",
      "rent/lease":            "Line 20a – Rent/Lease (Equipment)",
      "repairs/maintenance":   "Line 21 – Repairs",
      "tools/equipment":       "Line 22 – Supplies",
      "utilities":             "Line 25 – Utilities",
      "subcontractor":         "Line 11 – Contract Labor",
      // ── Legacy / alternate lowercase keys ──────────────────────────────────
      "fuel":                  "Line 9 – Car & Truck Expenses",
      "equipment":             "Line 13 – Depreciation / Sec. 179",
      "tools":                 "Line 22 – Supplies",
      "office":                "Line 18 – Office",
      "phone":                 "Line 25 – Utilities (Phone)",
      "repairs":               "Line 21 – Repairs",
      "travel":                "Line 24a – Travel",
      "meals":                 "Line 24b – Meals (50%)",
      "professional_fees":     "Line 17 – Legal/Professional",
      "rent":                  "Line 20a – Rent/Lease (Equipment)",
      "other":                 "Line 27a – Other",
    };

    const catMap = new Map<string, {
      schedCLine: string;
      amount: number;
      count: number;
      items: { date: string; description: string; vendor: string | null; amount: number }[];
    }>();
    for (const e of nonMileageExpenses) {
      // Owner Draw is a personal distribution — never a Schedule C deduction.
      if (e.category === "Owner Draw") continue;
      const cat = (e.category ?? "other").toLowerCase();
      const line = SCHED_C_MAP[cat] ?? "Line 27a – Other";
      const existing = catMap.get(line) ?? { schedCLine: line, amount: 0, count: 0, items: [] };
      const amt = parseFloat(e.amount ?? "0");
      existing.amount += amt;
      existing.count++;
      existing.items.push({
        date: e.date,
        description: e.description ?? "",
        vendor: e.vendor ?? null,
        amount: amt,
      });
      catMap.set(line, existing);
    }
    const expensesBySchedC = Array.from(catMap.values())
      .sort((a, b) => b.amount - a.amount)
      .map(cat => ({
        ...cat,
        items: cat.items.sort((a, b) => a.date.localeCompare(b.date)),
      }));

    // ── 1099 Subcontractor Payments ───────────────────────────────────────────
    const threshold = parseFloat(settings[0]?.thresholdAmount1099 ?? "600");
    const subPayments = await Promise.all(subs.map(async s => {
      const ytd = await computeYtd(s.id, year);
      return {
        id: s.id,
        name: s.name,
        ytdPayments: ytd,
        requires1099: ytd >= threshold,
        w9OnFile: s.w9OnFile ?? false,
        w9LegalName: s.w9LegalName ?? null,
      };
    }));
    const sub1099s = subPayments.filter(s => s.ytdPayments >= threshold);

    // ── Estimated Tax Payments ────────────────────────────────────────────────
    const estTaxRows = taxPayments.map(p => ({
      id: p.id,
      quarter: p.quarter,
      level: p.level,
      amountPaid: parseFloat(String(p.amountPaid ?? 0)),
      paidDate: p.paidDate,
      paymentMethod: p.paymentMethod,
      notes: p.notes,
    }));
    const totalEstimatedTaxPaid = estTaxRows.reduce((s, p) => s + p.amountPaid, 0);

    // ── Other Income ──────────────────────────────────────────────────────────
    const otherIncomeDetail = otherIncomeRows.map(o => ({
      id: o.id,
      date: o.date,
      description: o.description,
      source: o.source,
      amount: parseFloat(String(o.amount ?? 0)),
      paymentMethod: o.paymentMethod,
    }));

    // ── Net Profit & Tax Estimates ────────────────────────────────────────────
    const netProfit = totalRevenue - totalExpenses - mileageDeduction - totalDepreciation;
    const selfEmploymentTax = Math.max(0, netProfit * 0.9235 * 0.153);
    const seDeduction = selfEmploymentTax * 0.5;
    const federalIncomeTax = Math.max(0, (netProfit - seDeduction) * 0.22);
    const kyStateTax = Math.max(0, netProfit * 0.04);
    const totalEstimatedTaxLiability = selfEmploymentTax + federalIncomeTax + kyStateTax;

    res.json({
      year,
      generatedAt: new Date().toISOString(),
      companyName: settings[0]?.companyName ?? "Willard's General Contracting LLC",
      summary: {
        grossReceipts,
        otherIncomeTotal,
        totalRevenue,
        totalExpenses,
        mileageDeduction,
        mileageRate,
        totalMiles,
        totalDepreciation,
        netProfit,
      },
      taxEstimates: {
        selfEmploymentTax,
        federalIncomeTax,
        kyStateTax,
        totalLiability: totalEstimatedTaxLiability,
        totalPaid: totalEstimatedTaxPaid,
        balance: totalEstimatedTaxLiability - totalEstimatedTaxPaid,
      },
      expensesBySchedC,
      totalExpenses,
      invoices: paidInvoices.map(i => {
        const paymentDate = i.stripePaidAt
          ? i.stripePaidAt.toISOString().slice(0, 10)
          : i.squarePaidAt
          ? i.squarePaidAt.toISOString().slice(0, 10)
          : i.issueDate;
        return {
          invoiceNumber: i.invoiceNumber,
          issueDate: i.issueDate,
          paymentDate,
          clientName: i.clientName ?? "",
          total: parseFloat(String(i.total ?? 0)),
          city: i.city ?? "",
          state: i.state ?? "",
        };
      }),
      otherIncome: otherIncomeDetail,
      mileage: {
        totalMiles,
        mileageRate,
        deduction: mileageDeduction,
        trips: mileageLogs.length,
      },
      depreciation: {
        rows: depreciationRows,
        total: totalDepreciation,
        totalAccumulated: totalAccumulatedDepreciation,
      },
      disposedAssets,
      sub1099s,
      estimatedTaxPayments: estTaxRows,
    });
  } catch (err) {
    console.error("Year-end report error:", err);
    res.status(500).json({ error: "Failed to generate year-end report" });
  }
});

// ─── Reserve Summary: take-home-based tax & growth reserve ───────────────────
// Uses the same waterfall as Pay Breakdown (5% growth, 50/50 split, 25% tax reserve)
router.get("/reserve-summary", sectionGuard("jobs"), async (req, res) => {
  try {
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const GROWTH_PCT = 0.05;
    const OWNER_PCT = 0.50;
    const TAX_PCT = 0.25;

    const invoices = await db.select({
      id: invoicesTable.id,
      jobId: invoicesTable.jobId,
      total: invoicesTable.total,
      status: invoicesTable.status,
      issueDate: invoicesTable.issueDate,
    }).from(invoicesTable)
      .where(and(
        gte(invoicesTable.issueDate, startDate),
        lte(invoicesTable.issueDate, endDate),
        ne(invoicesTable.status, "draft")
      ));

    const jobIds = [...new Set(invoices.map(i => i.jobId).filter((id): id is number => id != null))];
    if (jobIds.length === 0) {
      return res.json({ months: [], ytd: { revenue: 0, subLaborCost: 0, ownerShare: 0, taxReserve: 0, growthFund: 0, takeHome: 0 } });
    }

    const subHoursRows = await db.select({
      jobId: jobSubHoursTable.jobId,
      cost: sql<string>`COALESCE(SUM(${jobSubHoursTable.hours} * COALESCE(${jobSubHoursTable.rateSnapshot}, 0)), 0)`,
    }).from(jobSubHoursTable)
      .where(inArray(jobSubHoursTable.jobId, jobIds))
      .groupBy(jobSubHoursTable.jobId);

    const hoursCostByJob = new Map(subHoursRows.map(r => [r.jobId, parseFloat(r.cost ?? "0")]));

    const monthMap = new Map<string, { revenue: number; subLaborCost: number; ownerShare: number; taxReserve: number; growthFund: number; takeHome: number }>();

    for (const inv of invoices) {
      if (!inv.jobId || !inv.issueDate) continue;
      const revenue = inv.status === "paid" ? parseFloat(inv.total ?? "0") : 0;
      // Use only logged hours × rate for subLaborCost. Allocation sub share is handled
      // implicitly by OWNER_PCT — paying an allocation sub is cash movement, not a new cost.
      const subLaborCost = hoursCostByJob.get(inv.jobId) ?? 0;
      const afterSubs = Math.max(0, revenue - subLaborCost);
      const growthFund = afterSubs * GROWTH_PCT;
      const toSplit = afterSubs - growthFund;
      const ownerShare = toSplit * OWNER_PCT;
      const taxReserve = ownerShare * TAX_PCT;
      const takeHome = ownerShare - taxReserve;
      const month = inv.issueDate.substring(0, 7);
      const existing = monthMap.get(month) ?? { revenue: 0, subLaborCost: 0, ownerShare: 0, taxReserve: 0, growthFund: 0, takeHome: 0 };
      existing.revenue += revenue;
      existing.subLaborCost += subLaborCost;
      existing.ownerShare += ownerShare;
      existing.taxReserve += taxReserve;
      existing.growthFund += growthFund;
      existing.takeHome += takeHome;
      monthMap.set(month, existing);
    }

    const months = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({ month, ...data }));

    const ytd = months.reduce((acc, m) => ({
      revenue: acc.revenue + m.revenue,
      subLaborCost: acc.subLaborCost + m.subLaborCost,
      ownerShare: acc.ownerShare + m.ownerShare,
      taxReserve: acc.taxReserve + m.taxReserve,
      growthFund: acc.growthFund + m.growthFund,
      takeHome: acc.takeHome + m.takeHome,
    }), { revenue: 0, subLaborCost: 0, ownerShare: 0, taxReserve: 0, growthFund: 0, takeHome: 0 });

    res.json({ months, ytd });
  } catch (err) {
    console.error("[reserve-summary]", err);
    res.status(500).json({ error: "Failed to compute reserve summary" });
  }
});

// ─── My Pay Summary: running balance of what the business owes the owner ─────
router.get("/owner-pay-summary", sectionGuard("invoices"), async (req, res) => {
  try {
    const GROWTH_PCT = 0.05;
    const TAX_PCT    = 0.25;

    // All paid invoices
    const invoiceRows = await db.select({
      jobId: invoicesTable.jobId,
      total: invoicesTable.total,
    }).from(invoicesTable).where(eq(invoicesTable.status, "paid"));

    const jobIds = [...new Set(invoiceRows.map(r => r.jobId).filter((id): id is number => id != null))];

    if (jobIds.length === 0) {
      return res.json({ totalEarned: 0, totalWithdrawn: 0, remaining: 0, withdrawals: [] });
    }

    // Revenue per job
    const revenueByJob = new Map<number, number>();
    for (const row of invoiceRows) {
      if (!row.jobId) continue;
      revenueByJob.set(row.jobId, (revenueByJob.get(row.jobId) ?? 0) + parseFloat(row.total ?? "0"));
    }

    // Hourly sub labor cost per job
    const hoursCostRows = await db.select({
      jobId: jobSubHoursTable.jobId,
      cost: sql<string>`COALESCE(SUM(${jobSubHoursTable.hours} * COALESCE(${jobSubHoursTable.rateSnapshot}, 0)), 0)`,
    }).from(jobSubHoursTable).where(inArray(jobSubHoursTable.jobId, jobIds)).groupBy(jobSubHoursTable.jobId);
    const hoursCostByJob = new Map(hoursCostRows.map(r => [r.jobId, parseFloat(r.cost ?? "0")]));

    // Fixed sub costs per job
    const fixedSubRows = await db.select({
      jobId: jobSubcontractorsTable.jobId,
      cost: sql<string>`COALESCE(SUM(COALESCE(${jobSubcontractorsTable.fixedAmount}, 0)), 0)`,
    }).from(jobSubcontractorsTable)
      .where(and(inArray(jobSubcontractorsTable.jobId, jobIds), eq(jobSubcontractorsTable.compensationType, "fixed")))
      .groupBy(jobSubcontractorsTable.jobId);
    const fixedCostByJob = new Map(fixedSubRows.map(r => [r.jobId, parseFloat(r.cost ?? "0")]));

    // Allocation sub percentages per job (to derive owner's remaining %)
    const allocRows = await db.select({
      jobId: jobSubcontractorsTable.jobId,
      totalAllocPct: sql<string>`COALESCE(SUM(COALESCE(${jobSubcontractorsTable.allocationPct}, 0)), 0)`,
    }).from(jobSubcontractorsTable)
      .where(and(inArray(jobSubcontractorsTable.jobId, jobIds), eq(jobSubcontractorsTable.compensationType, "allocation")))
      .groupBy(jobSubcontractorsTable.jobId);
    const allocPctByJob = new Map(allocRows.map(r => [r.jobId, parseFloat(r.totalAllocPct ?? "0")]));

    // Per-job take-home using same formula as Pay Breakdown panel
    let totalEarned = 0;
    const jobBreakdown: Array<{ jobId: number; revenue: number; takeHome: number }> = [];
    for (const [jobId, revenue] of revenueByJob) {
      const hourlyCost   = hoursCostByJob.get(jobId) ?? 0;
      const fixedCost    = fixedCostByJob.get(jobId) ?? 0;
      const afterWorkers = Math.max(0, revenue - hourlyCost - fixedCost);
      const growthReserve = afterWorkers * GROWTH_PCT;
      const toSplit      = afterWorkers - growthReserve;
      const totalAllocPct = allocPctByJob.get(jobId) ?? 0;
      // Owner pct: if allocation subs exist, owner gets remainder; else owner gets 100%
      const ownerPct     = totalAllocPct > 0 ? Math.max(0, 100 - totalAllocPct) : 100;
      const ownerShare   = toSplit * (ownerPct / 100);
      const takeHome     = ownerShare * (1 - TAX_PCT);
      totalEarned += takeHome;
      jobBreakdown.push({ jobId, revenue, takeHome });
    }

    // Total withdrawals: expenses with category "Owner Draw" + negative owner capital entries
    const [withdrawalExpenses, ocEntries] = await Promise.all([
      db.select({
        id: expensesTable.id,
        date: expensesTable.date,
        amount: expensesTable.amount,
        description: expensesTable.description,
      }).from(expensesTable)
        .where(eq(expensesTable.category, "Owner Draw"))
        .orderBy(desc(expensesTable.date)),
      db.select({
        id: ownerCapitalEntriesTable.id,
        date: ownerCapitalEntriesTable.date,
        amount: ownerCapitalEntriesTable.amount,
        description: ownerCapitalEntriesTable.description,
      }).from(ownerCapitalEntriesTable)
        .where(sql`CAST(${ownerCapitalEntriesTable.amount} AS numeric) < 0`)
        .orderBy(desc(ownerCapitalEntriesTable.date)),
    ]);

    const withdrawals = [
      ...withdrawalExpenses.map(e => ({
        id: `exp-${e.id}`,
        date: e.date,
        amount: parseFloat(e.amount ?? "0"),
        description: e.description ?? "Withdrawal",
      })),
      ...ocEntries.map(e => ({
        id: `oc-${e.id}`,
        date: e.date,
        amount: Math.abs(parseFloat(String(e.amount ?? "0"))),
        description: e.description ?? "Withdrawal",
      })),
    ].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

    const totalWithdrawn = withdrawals.reduce((s, w) => s + w.amount, 0);

    res.json({
      totalEarned:    Math.max(0, totalEarned),
      totalWithdrawn,
      remaining:      Math.max(0, totalEarned - totalWithdrawn),
      withdrawals,
      jobBreakdown,
    });
  } catch (err) {
    console.error("[owner-pay-summary]", err);
    res.status(500).json({ error: "Failed to compute owner pay summary" });
  }
});

export default router;
