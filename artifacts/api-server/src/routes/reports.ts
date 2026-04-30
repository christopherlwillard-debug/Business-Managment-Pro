import { Router } from "express";
import { db } from "@workspace/db";
import { jobsTable, invoicesTable, expensesTable, mileageLogsTable, subcontractorsTable, clientsTable, settingsTable, otherIncomeTable } from "@workspace/db/schema";
import { eq, and, gte, lte, desc, sum, ne, inArray } from "drizzle-orm";
import { computeYtd } from "./subcontractors";
import { sectionGuard } from "./guards";
import { getIrsMileageRate } from "../lib/irs-rates.js";

const router = Router();

const KNOWN_BL = ["general_contracting", "asphalt_sealing"] as const;
const BL_LABELS: Record<string, string> = {
  general_contracting: "General Contracting",
  asphalt_sealing: "Asphalt Sealing",
};

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

    // Mileage deduction is always shown YTD regardless of the period selector
    const ytdStart = `${now.getFullYear()}-01-01`;

    // For the YTD ("year") period, query expenses across the full calendar year
    const expenseEndDate = period === "year" ? `${now.getFullYear()}-12-31` : endDate;

    // Validate blFilter — only allow known values
    const validBl = blFilter && (KNOWN_BL as readonly string[]).includes(blFilter) ? blFilter : null;

    // Build optional DB-level business-line WHERE condition (returns undefined when no filter = AND ignores it)
    const blWhere = (col: Parameters<typeof eq>[0]) =>
      validBl ? eq(col, validBl) : undefined;

    // Fetch KPI data with DB-level business-line WHERE when validBl is set,
    // plus full (unfiltered) data in parallel for the byBusinessLine breakdown.
    const [
      kpiInvoices, kpiExpenses, allMileage, kpiOtherIncome, kpiActiveJobs,
      recentJobsRows, recentInvoicesRows,
    ] = await Promise.all([
      // KPI queries — DB-level filter applied when validBl is set
      db.select().from(invoicesTable).where(and(gte(invoicesTable.issueDate, startDate), lte(invoicesTable.issueDate, endDate), blWhere(invoicesTable.businessLine))),
      db.select().from(expensesTable).where(and(gte(expensesTable.date, startDate), lte(expensesTable.date, expenseEndDate), blWhere(expensesTable.businessLine))),
      // Mileage has no businessLine column — always fetch full YTD
      db.select().from(mileageLogsTable).where(and(gte(mileageLogsTable.date, ytdStart), lte(mileageLogsTable.date, endDate), eq(mileageLogsTable.classification, "business"))),
      db.select().from(otherIncomeTable).where(and(gte(otherIncomeTable.date, startDate), lte(otherIncomeTable.date, endDate), blWhere(otherIncomeTable.businessLine))),
      db.select().from(jobsTable).where(and(eq(jobsTable.status, "in_progress"), blWhere(jobsTable.businessLine))),
      // Recent rows — always unfiltered
      db.select({ id: jobsTable.id, title: jobsTable.title, description: jobsTable.description, clientId: jobsTable.clientId, clientName: clientsTable.name, status: jobsTable.status, jobType: jobsTable.jobType, address: jobsTable.address, city: jobsTable.city, state: jobsTable.state, startDate: jobsTable.startDate, endDate: jobsTable.endDate, estimatedAmount: jobsTable.estimatedAmount, actualAmount: jobsTable.actualAmount, notes: jobsTable.notes, createdAt: jobsTable.createdAt }).from(jobsTable).leftJoin(clientsTable, eq(jobsTable.clientId, clientsTable.id)).orderBy(desc(jobsTable.createdAt)).limit(5),
      db.select({ id: invoicesTable.id, invoiceNumber: invoicesTable.invoiceNumber, clientId: invoicesTable.clientId, clientName: clientsTable.name, jobId: invoicesTable.jobId, status: invoicesTable.status, issueDate: invoicesTable.issueDate, dueDate: invoicesTable.dueDate, subtotal: invoicesTable.subtotal, taxRate: invoicesTable.taxRate, taxAmount: invoicesTable.taxAmount, total: invoicesTable.total, amountPaid: invoicesTable.amountPaid, notes: invoicesTable.notes, terms: invoicesTable.terms, lineItems: invoicesTable.lineItems, createdAt: invoicesTable.createdAt }).from(invoicesTable).leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id)).orderBy(desc(invoicesTable.createdAt)).limit(5),
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
    const mileageDeduction = allMileage.reduce((s, m) => s + parseFloat(m.deductionAmount ?? "0"), 0);
    // Mileage cannot be attributed to a single business line — exclude from filtered net profit
    const mileageForNetProfit = validBl ? 0 : mileageDeduction;
    const operationalNetProfit = totalRevenue - (totalExpenses - excludedFromProfitFormula) - mileageForNetProfit;
    const ytdMiles = allMileage.reduce((s, m) => s + parseFloat(m.miles ?? "0"), 0);
    const ytdMileageRate = getIrsMileageRate(now.getFullYear());

    // Subcontractor pay metrics — expenses categorised as "Subcontractor", joined to jobs for subPaid status
    const subExpenses = kpiExpenses.filter(e => e.category?.toLowerCase() === "subcontractor");
    const subJobIds = [...new Set(subExpenses.map(e => e.jobId).filter((id): id is number => id != null))];
    const subJobSubPaidMap = new Map<number, boolean>();
    if (subJobIds.length > 0) {
      const subJobRows = await db.select({ id: jobsTable.id, subPaid: jobsTable.subPaid })
        .from(jobsTable)
        .where(inArray(jobsTable.id, subJobIds));
      for (const j of subJobRows) subJobSubPaidMap.set(j.id, j.subPaid);
    }
    // subContractorOwed = outstanding sub obligation: expenses where job is not yet marked subPaid (or no linked job)
    const subContractorOwed = subExpenses
      .filter(e => !e.jobId || !subJobSubPaidMap.get(e.jobId))
      .reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);
    // subContractorPaid = settled: expenses tied to jobs where subPaid=true
    const subContractorPaid = subExpenses
      .filter(e => e.jobId != null && subJobSubPaidMap.get(e.jobId) === true)
      .reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);
    // subContractorRemaining = outstanding amount still owed to subs (same as subContractorOwed by definition,
    // since owed=unpaid and paid are mutually exclusive; exposed separately for API clarity)
    const subContractorRemaining = subContractorOwed;
    // ownerProfit = net profit after accounting for unpaid sub obligations
    const ownerProfit = operationalNetProfit - subContractorOwed;

    // Profit by business line breakdown — always computed from full (unfiltered) data
    const byBusinessLine = KNOWN_BL.map(bl => {
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
        label: BL_LABELS[bl] ?? bl,
        totalRevenue: blRevenue,
        totalExpenses: blExpenseTotal,
        operationalNetProfit: blRevenue - (blExpenseTotal - blExcluded),
        activeJobs: blActiveJobs.length,
      };
    });

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
      ytdMiles,
      ytdMileageRate,
      overdueInvoices,
      operationalNetProfit,
      excludedFromProfit,
      formulaExcludedFromProfit: excludedFromProfitFormula,
      excludedExpenseCount,
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
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

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
        .where(and(gte(invoicesTable.issueDate, startDate), lte(invoicesTable.issueDate, endDate))),
      db.select().from(expensesTable).where(and(gte(expensesTable.date, startDate), lte(expensesTable.date, endDate))),
      db.select().from(mileageLogsTable).where(and(gte(mileageLogsTable.date, startDate), lte(mileageLogsTable.date, endDate))),
      db.select().from(subcontractorsTable),
      db.select().from(settingsTable).limit(1),
      db.select().from(otherIncomeTable).where(and(gte(otherIncomeTable.date, startDate), lte(otherIncomeTable.date, endDate))),
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

    const businessMiles = mileageLogs.filter(m => m.classification === "business");
    const totalMiles = businessMiles.reduce((s, m) => s + parseFloat(m.miles ?? "0"), 0);
    const mileageDeduction = businessMiles.reduce((s, m) => s + parseFloat(m.deductionAmount ?? "0"), 0);

    const subsWithYtdAcc = await Promise.all(subs.map(async s => ({
      ...s,
      _ytd: await computeYtd(s.id, year),
    })));
    const totalSubPayments = subsWithYtdAcc.reduce((acc, s) => acc + s._ytd, 0);
    const netProfit = paidRevenue - totalExpenses - mileageDeduction;

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

    // Expenses by category (mileage excluded — shown separately as mileageDeduction)
    const catMap = new Map<string, { category: string; amount: number; count: number }>();
    for (const e of nonMileageExpenses) {
      const cat = e.category || "Uncategorized";
      const existing = catMap.get(cat) ?? { category: cat, amount: 0, count: 0 };
      existing.amount += parseFloat(e.amount ?? "0");
      existing.count++;
      catMap.set(cat, existing);
    }
    const expensesByCategory = Array.from(catMap.values()).sort((a, b) => b.amount - a.amount);

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

    const BL_LABELS: Record<string, string> = {
      general_contracting: "General Contracting",
      asphalt_sealing: "Asphalt Sealing (DBA)",
      untagged: "Untagged",
    };
    const KNOWN_BL = ["general_contracting", "asphalt_sealing"];
    const blKeys = ["general_contracting", "asphalt_sealing", "untagged"] as const;
    const byBusinessLine = blKeys.map(bl => {
      let blInvoices, blOther, blExpenses;
      if (bl === "untagged") {
        blInvoices = invoices.filter(i => !i.businessLine || !KNOWN_BL.includes(i.businessLine));
        blOther = otherIncomeRows.filter(o => !o.businessLine || !KNOWN_BL.includes(o.businessLine));
        blExpenses = nonMileageExpenses.filter(e => !e.businessLine || !KNOWN_BL.includes(e.businessLine));
      } else {
        blInvoices = invoices.filter(i => i.businessLine === bl);
        blOther = otherIncomeRows.filter(o => o.businessLine === bl);
        blExpenses = nonMileageExpenses.filter(e => e.businessLine === bl);
      }
      const invoiceGross = blInvoices.reduce((s, i) => s + parseFloat(i.total ?? "0"), 0);
      const invoicePaid = blInvoices.filter(i => i.status === "paid").reduce((s, i) => s + parseFloat(i.total ?? "0"), 0);
      const otherSum = blOther.reduce((s, o) => s + parseFloat(o.amount ?? "0"), 0);
      const expSum = blExpenses.reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);
      return {
        businessLine: bl,
        label: BL_LABELS[bl] ?? bl,
        invoiceCount: blInvoices.length,
        invoiceGross,
        invoicePaid,
        otherIncome: otherSum,
        totalRevenue: invoiceGross + otherSum,
        collectedRevenue: invoicePaid + otherSum,
        expenses: expSum,
        netProfit: (invoicePaid + otherSum) - expSum,
      };
    });

    res.json({
      year,
      summary: { grossRevenue, paidRevenue, pendingRevenue, totalExpenses, totalMiles, mileageDeduction, mileageRate: rate, totalSubPayments, netProfit, otherIncomeTotal: otherIncomeSum },
      incomeByCity,
      estimatedTaxes,
      expensesByCategory,
      monthlyIncome,
      subcontractor1099,
      invoiceRecords: allRecords,
      otherIncomeRows,
      byBusinessLine,
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
    const startDate = `${year}-01-01`;
    const endDate   = `${year}-12-31`;

    const [invRows, expRows, mileRows, otherRows] = await Promise.all([
      db.select({ status: invoicesTable.status, total: invoicesTable.total })
        .from(invoicesTable)
        .where(and(gte(invoicesTable.issueDate, startDate), lte(invoicesTable.issueDate, endDate))),
      db.select({
        category: expensesTable.category,
        amount: expensesTable.amount,
        excludeFromNetProfit: expensesTable.excludeFromNetProfit,
      })
        .from(expensesTable)
        .where(and(gte(expensesTable.date, startDate), lte(expensesTable.date, endDate), ne(expensesTable.category, "mileage"))),
      db.select({ totalMiles: sum(mileageLogsTable.miles), totalDed: sum(mileageLogsTable.deductionAmount) })
        .from(mileageLogsTable)
        .where(and(eq(mileageLogsTable.classification, "business"), gte(mileageLogsTable.date, startDate), lte(mileageLogsTable.date, endDate))),
      db.select({ amount: otherIncomeTable.amount })
        .from(otherIncomeTable)
        .where(and(gte(otherIncomeTable.date, startDate), lte(otherIncomeTable.date, endDate))),
    ]);

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
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate profit & loss report" });
  }
});

export default router;
