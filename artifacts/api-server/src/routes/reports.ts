import { Router } from "express";
import { db } from "@workspace/db";
import { jobsTable, invoicesTable, expensesTable, mileageLogsTable, subcontractorsTable, clientsTable, settingsTable } from "@workspace/db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";

const router = Router();

router.get("/dashboard", async (req, res) => {
  try {
    const { period = "month" } = req.query;

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

    const [allInvoices, allExpenses, allMileage, activeJobsRows, recentJobsRows, recentInvoicesRows] = await Promise.all([
      db.select().from(invoicesTable).where(and(gte(invoicesTable.issueDate, startDate), lte(invoicesTable.issueDate, endDate))),
      db.select().from(expensesTable).where(and(gte(expensesTable.date, startDate), lte(expensesTable.date, endDate))),
      db.select().from(mileageLogsTable).where(and(gte(mileageLogsTable.date, startDate), lte(mileageLogsTable.date, endDate), eq(mileageLogsTable.classification, "business"))),
      db.select().from(jobsTable).where(eq(jobsTable.status, "in_progress")),
      db.select({ id: jobsTable.id, title: jobsTable.title, description: jobsTable.description, clientId: jobsTable.clientId, clientName: clientsTable.name, status: jobsTable.status, jobType: jobsTable.jobType, address: jobsTable.address, city: jobsTable.city, state: jobsTable.state, startDate: jobsTable.startDate, endDate: jobsTable.endDate, estimatedAmount: jobsTable.estimatedAmount, actualAmount: jobsTable.actualAmount, notes: jobsTable.notes, createdAt: jobsTable.createdAt }).from(jobsTable).leftJoin(clientsTable, eq(jobsTable.clientId, clientsTable.id)).orderBy(desc(jobsTable.createdAt)).limit(5),
      db.select({ id: invoicesTable.id, invoiceNumber: invoicesTable.invoiceNumber, clientId: invoicesTable.clientId, clientName: clientsTable.name, jobId: invoicesTable.jobId, status: invoicesTable.status, issueDate: invoicesTable.issueDate, dueDate: invoicesTable.dueDate, subtotal: invoicesTable.subtotal, taxRate: invoicesTable.taxRate, taxAmount: invoicesTable.taxAmount, total: invoicesTable.total, amountPaid: invoicesTable.amountPaid, notes: invoicesTable.notes, terms: invoicesTable.terms, lineItems: invoicesTable.lineItems, createdAt: invoicesTable.createdAt }).from(invoicesTable).leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id)).orderBy(desc(invoicesTable.createdAt)).limit(5),
    ]);

    const totalRevenue = allInvoices.filter(i => i.status === "paid").reduce((s, i) => s + parseFloat(i.total ?? "0"), 0);
    const pendingInvoices = allInvoices.filter(i => i.status === "sent").reduce((s, i) => s + parseFloat(i.total ?? "0"), 0);
    const overdueInvoices = allInvoices.filter(i => i.status === "overdue").length;
    const totalExpenses = allExpenses.reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);
    const mileageDeduction = allMileage.reduce((s, m) => s + parseFloat(m.deductionAmount ?? "0"), 0);

    // Monthly revenue for last 6 months
    const monthlyRevenue = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i);
      const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const [monthlyInv, monthlyExp] = await Promise.all([
        db.select().from(invoicesTable).where(and(gte(invoicesTable.issueDate, `${monthStr}-01`), lte(invoicesTable.issueDate, `${monthStr}-31`))),
        db.select().from(expensesTable).where(and(gte(expensesTable.date, `${monthStr}-01`), lte(expensesTable.date, `${monthStr}-31`))),
      ]);
      monthlyRevenue.push({
        month: monthStr,
        revenue: monthlyInv.filter(i => i.status === "paid").reduce((s, i) => s + parseFloat(i.total ?? "0"), 0),
        expenses: monthlyExp.reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0),
      });
    }

    res.json({
      totalRevenue,
      pendingInvoices,
      activeJobs: activeJobsRows.length,
      totalExpenses,
      mileageDeduction,
      overdueInvoices,
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

router.get("/compliance", async (_req, res) => {
  try {
    const [settings] = await db.select().from(settingsTable).limit(1);
    const threshold = parseFloat(settings?.thresholdAmount1099 ?? "600");

    const [subs, mileageLogs] = await Promise.all([
      db.select().from(subcontractorsTable),
      db.select().from(mileageLogsTable).where(eq(mileageLogsTable.classification, "business")),
    ]);

    const subcontractor1099Alerts = subs
      .filter(s => parseFloat(s.ytdPayments ?? "0") >= threshold * 0.8)
      .map(s => {
        const ytd = parseFloat(s.ytdPayments ?? "0");
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

router.get("/accounting", async (req, res) => {
  try {
    const year = parseInt((req.query.year as string) || String(new Date().getFullYear()));
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const [invoices, expenses, mileageLogs, subs, settings] = await Promise.all([
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
      })
        .from(invoicesTable)
        .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
        .leftJoin(jobsTable, eq(invoicesTable.jobId, jobsTable.id))
        .where(and(gte(invoicesTable.issueDate, startDate), lte(invoicesTable.issueDate, endDate))),
      db.select().from(expensesTable).where(and(gte(expensesTable.date, startDate), lte(expensesTable.date, endDate))),
      db.select().from(mileageLogsTable).where(and(gte(mileageLogsTable.date, startDate), lte(mileageLogsTable.date, endDate))),
      db.select().from(subcontractorsTable),
      db.select().from(settingsTable).limit(1),
    ]);

    const rate = parseFloat(settings[0]?.mileageRate ?? "0.725");

    const grossRevenue = invoices.reduce((s, i) => s + parseFloat(i.total ?? "0"), 0);
    const paidRevenue = invoices.filter(i => i.status === "paid").reduce((s, i) => s + parseFloat(i.total ?? "0"), 0);
    const pendingRevenue = invoices.filter(i => ["sent", "overdue"].includes(i.status)).reduce((s, i) => s + parseFloat(i.total ?? "0"), 0);

    const totalExpenses = expenses.reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);

    const businessMiles = mileageLogs.filter(m => m.classification === "business");
    const totalMiles = businessMiles.reduce((s, m) => s + parseFloat(m.miles ?? "0"), 0);
    const mileageDeduction = businessMiles.reduce((s, m) => s + parseFloat(m.deductionAmount ?? "0"), 0);

    const totalSubPayments = subs.reduce((s, sub) => s + parseFloat(sub.ytdPayments ?? "0"), 0);
    const netProfit = paidRevenue - totalExpenses - mileageDeduction;

    // Income by city
    const cityMap = new Map<string, { city: string; state: string; invoiceCount: number; gross: number; paid: number; taxCollected: number }>();
    for (const inv of invoices) {
      const city = inv.invoiceCity || inv.jobCity || "Unspecified";
      const state = inv.invoiceState || inv.jobState || "";
      const key = `${city}||${state}`;
      const existing = cityMap.get(key) ?? { city, state, invoiceCount: 0, gross: 0, paid: 0, taxCollected: 0 };
      existing.invoiceCount++;
      existing.gross += parseFloat(inv.total ?? "0");
      if (inv.status === "paid") existing.paid += parseFloat(inv.total ?? "0");
      existing.taxCollected += parseFloat(inv.taxAmount ?? "0");
      cityMap.set(key, existing);
    }
    const incomeByCity = Array.from(cityMap.values()).sort((a, b) => b.gross - a.gross);

    // Expenses by category
    const catMap = new Map<string, { category: string; amount: number; count: number }>();
    for (const e of expenses) {
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
      const monthExp = expenses.filter(e => e.date.startsWith(ms));
      monthlyIncome.push({
        month: ms,
        gross: monthInvs.reduce((s, i) => s + parseFloat(i.total ?? "0"), 0),
        paid: monthInvs.filter(i => i.status === "paid").reduce((s, i) => s + parseFloat(i.total ?? "0"), 0),
        expenses: monthExp.reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0),
      });
    }

    const threshold = parseFloat(settings[0]?.thresholdAmount1099 ?? "600");
    const subcontractor1099 = subs.map(s => ({
      id: s.id,
      name: s.name,
      ytdPayments: parseFloat(s.ytdPayments ?? "0"),
      threshold,
      requires1099: parseFloat(s.ytdPayments ?? "0") >= threshold,
      w9OnFile: s.w9OnFile,
    }));

    res.json({
      year,
      summary: { grossRevenue, paidRevenue, pendingRevenue, totalExpenses, totalMiles, mileageDeduction, mileageRate: rate, totalSubPayments, netProfit },
      incomeByCity,
      expensesByCategory,
      monthlyIncome,
      subcontractor1099,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate accounting report" });
  }
});

export default router;
