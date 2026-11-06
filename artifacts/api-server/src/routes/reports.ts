import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { jobsTable, invoicesTable, invoiceCommunicationEventsTable, expensesTable, mileageLogsTable, subcontractorsTable, clientsTable, settingsTable, otherIncomeTable, assetsTable, estimatedTaxPaymentsTable, assetBusinessUseTable, businessesTable, jobSubHoursTable, jobSubcontractorsTable, ownerCapitalEntriesTable, growthFundDeploymentsTable, recurringExpensesTable, subPaymentRecordsTable } from "@workspace/db/schema";
import { plaidConnectionsTable } from "@workspace/db";
import { eq, and, or, gte, lte, desc, ne, inArray, sql, count, isNull, getTableColumns } from "drizzle-orm";
import { computeYtd } from "./subcontractors";
import { sectionGuard, ownerGuard } from "./guards";
import { summarizeMileageRecords } from "../lib/irs-rates.js";
import { computeTaxEstimate, getTaxAssumptions } from "../lib/tax-estimate.js";
import { computeAllocationSplitPools, computeSubOwed } from "../lib/allocation.js";
import { calculateOwnerPayFromJobProfit } from "../lib/job-profit-reports.js";
import { loadJobProfitByJob } from "../lib/job-profit-loader.js";
import { requestedBusiness, resolveMutationBusiness, mutationBusinessPredicate } from "../lib/business-scope.js";
import {
  filterCashReceipts,
  filterDashboardRevenueInvoices,
  getCashReceiptAmount,
  getDashboardRevenueDate,
  isDashboardRevenueDateEstimated,
  summarizeDashboardRevenueDateBasis,
  sumCashReceipts,
  sumDashboardRevenue,
} from "../lib/cash-revenue.js";
import { calcInvoiceFromStored } from "./invoices.js";
import { getWeekToDateStart } from "../lib/dashboard-period.js";
import {
  OWNER_WITHDRAWAL_EXPENSE_CATEGORIES,
  isOwnerWithdrawalExpenseCategory,
} from "../lib/owner-withdrawals.js";
import {
  buildInvoiceRevenueDateAuditCsv,
  type InvoiceRevenueDateAuditRow,
} from "../lib/invoice-revenue-date-audit.js";

const router = Router();

type ReportBusiness = { id: number; slug: string };

/** Resolve optional report selectors once and fail closed for unknown businesses. */
async function resolveReportBusiness(
  rawSlug: unknown,
  rawId: unknown,
  res: any,
): Promise<ReportBusiness | null | undefined> {
  if (rawSlug != null && typeof rawSlug !== "string") {
    res.status(400).json({ error: "Invalid business selector" });
    return undefined;
  }
  const slug = typeof rawSlug === "string" ? rawSlug.trim() : "";
  let id: number | null = null;
  if (rawId != null && String(rawId).trim() !== "") {
    const text = String(rawId).trim();
    if (!/^\d+$/.test(text)) {
      res.status(400).json({ error: "Invalid business ID" });
      return undefined;
    }
    id = Number(text);
    if (!Number.isSafeInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid business ID" });
      return undefined;
    }
  }
  if (!slug && id == null) return null;
  const [business] = await db.select({ id: businessesTable.id, slug: businessesTable.slug })
    .from(businessesTable)
    .where(id != null ? eq(businessesTable.id, id) : eq(businessesTable.slug, slug))
    .limit(1);
  if (!business || (slug && business.slug !== slug)) {
    res.status(400).json({ error: "Unknown business" });
    return undefined;
  }
  return business;
}

/** Prefer canonical ownership; only use businessLine for legacy null-owned rows. */
function reportBusinessWhere(
  business: ReportBusiness | null,
  businessLineColumn: any,
  businessIdColumn?: any,
): any {
  if (!business) return undefined;
  if (!businessIdColumn) return eq(businessLineColumn, business.slug);
  if (businessIdColumn === otherIncomeTable.businessId) {
    return or(
      eq(businessIdColumn, String(business.id)),
      eq(businessIdColumn, business.slug),
      and(isNull(businessIdColumn), eq(businessLineColumn, business.slug)),
    );
  }
  return or(
    eq(businessIdColumn, business.id),
    and(isNull(businessIdColumn), eq(businessLineColumn, business.slug)),
  );
}

const dashboardInvoiceSelection = {
  ...getTableColumns(invoicesTable),
  // Revenue attribution must come from append-only verified Gmail evidence,
  // never from the invoices.sentAt compatibility summary. MIN preserves the
  // first verified delivery period when an invoice is later resent.
  verifiedSentAt: sql<Date | null>`(
    SELECT MIN(${invoiceCommunicationEventsTable.completedAt})
    FROM ${invoiceCommunicationEventsTable}
    WHERE ${invoiceCommunicationEventsTable.invoiceId} = ${invoicesTable.id}
      AND ${invoiceCommunicationEventsTable.eventType} IN ('initial_invoice', 'resend_invoice')
      AND ${invoiceCommunicationEventsTable.status} = 'accepted'
      AND ${invoiceCommunicationEventsTable.provider} = 'gmail'
      AND ${invoiceCommunicationEventsTable.providerMessageId} IS NOT NULL
      AND ${invoiceCommunicationEventsTable.completedAt} IS NOT NULL
  )`.as("verified_sent_at"),
};

async function loadInvoiceSendDateAudit(req: Request, res: Response): Promise<InvoiceRevenueDateAuditRow[] | null> {
  const requestedScope = req.query.businessId != null || req.query.businessLine != null;
  const scope = await requestedBusiness(req);
  if (requestedScope && !scope) {
    res.status(400).json({ error: "Unknown business" });
    return null;
  }

  const rows = await db
    .select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        status: invoicesTable.status,
        issueDate: invoicesTable.issueDate,
        total: invoicesTable.total,
        amountPaid: invoicesTable.amountPaid,
        businessId: invoicesTable.businessId,
        businessLine: invoicesTable.businessLine,
        clientName: clientsTable.name,
        jobTitle: jobsTable.title,
        verifiedSentAt: dashboardInvoiceSelection.verifiedSentAt,
      })
      .from(invoicesTable)
      .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
      .leftJoin(jobsTable, eq(invoicesTable.jobId, jobsTable.id))
      .where(and(
        eq(invoicesTable.status, "paid"),
        scope ? mutationBusinessPredicate(invoicesTable, scope) : undefined,
      ))
    .orderBy(desc(invoicesTable.issueDate), desc(invoicesTable.id));

  return rows
    .filter(isDashboardRevenueDateEstimated)
    .map(invoice => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      clientName: invoice.clientName,
      jobTitle: invoice.jobTitle,
      issueDate: invoice.issueDate,
      dashboardRevenueDate: getDashboardRevenueDate(invoice),
      amount: getCashReceiptAmount(invoice),
      businessId: invoice.businessId,
      businessLine: invoice.businessLine,
    }));
}

router.get("/invoice-send-date-audit", sectionGuard("invoices"), async (req, res) => {
  try {
    const estimatedSendDateInvoices = await loadInvoiceSendDateAudit(req, res);
    if (estimatedSendDateInvoices == null) return;

    res.json({
      estimatedSendDateInvoices,
      totalCount: estimatedSendDateInvoices.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get invoice send-date audit" });
  }
});

router.get("/invoice-send-date-audit.csv", sectionGuard("invoices"), async (req, res) => {
  try {
    const estimatedSendDateInvoices = await loadInvoiceSendDateAudit(req, res);
    if (estimatedSendDateInvoices == null) return;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="revenue-date-audit.csv"');
    res.send(buildInvoiceRevenueDateAuditCsv(estimatedSendDateInvoices));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to export invoice send-date audit" });
  }
});

router.get("/dashboard", sectionGuard("invoices"), async (req, res) => {
  try {
    const { period = "month", businessLine: blFilter, businessId: businessIdFilter } = req.query as Record<string, string | undefined>;

    const now = new Date();
    let startDate: string;
    if (period === "week") {
      startDate = getWeekToDateStart(now);
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

    // The monthly chart always shows the last 6 months regardless of the selected KPI period.
    // allSubPayments must cover this wider window so subPayByMonth is populated for prior months.
    const chartD = new Date(now);
    chartD.setDate(1);
    chartD.setMonth(chartD.getMonth() - 5);
    const chartStartDate = `${chartD.getFullYear()}-${String(chartD.getMonth() + 1).padStart(2, "0")}-01`;

    const reportBusiness = await resolveReportBusiness(blFilter, businessIdFilter, res);
    if (reportBusiness === undefined) return;
    const validBl = reportBusiness?.slug ?? null;
    const mileageWhere = reportBusiness ? eq(mileageLogsTable.businessId, reportBusiness.id) : undefined;
    const blWhere = (businessLineColumn: any, businessIdColumn?: any) =>
      reportBusinessWhere(reportBusiness ?? null, businessLineColumn, businessIdColumn);

    // Fetch KPI data with DB-level business-line WHERE when validBl is set,
    // plus full (unfiltered) data in parallel for the byBusinessLine breakdown.
    const [
      kpiPaidInvoices, kpiNonPaidInvoices, kpiExpenses, allMileage, kpiOtherIncome, kpiActiveJobs,
      recentJobsRows, recentInvoicesRows, kpiOwnerCapital, allSubPayments,
    ] = await Promise.all([
      // Dashboard revenue uses verified send date with issueDate as a legacy fallback.
      // Paid invoices remain unbounded here so JS can attribute a paid invoice to its
      // send period even when payment arrived in a later period.
      db.select(dashboardInvoiceSelection).from(invoicesTable).where(and(eq(invoicesTable.status, "paid"), blWhere(invoicesTable.businessLine, invoicesTable.businessId))),
      // Non-paid invoices: issueDate-bounded so pending/overdue counts remain period-specific
      db.select().from(invoicesTable).where(and(ne(invoicesTable.status, "paid"), gte(invoicesTable.issueDate, startDate), lte(invoicesTable.issueDate, endDate), blWhere(invoicesTable.businessLine, invoicesTable.businessId))),
      db.select().from(expensesTable).where(and(gte(expensesTable.date, startDate), lte(expensesTable.date, expenseEndDate), blWhere(expensesTable.businessLine, expensesTable.businessId), isNull(expensesTable.voidedAt))),
      // Period-consistent mileage for the profit formula — matches the selected period.
      // subcontractorId IS NULL: exclude sub-portal mileage (James Willard, Dewayne Lamb, etc.)
      // which is job-tracking data, not the owner's Schedule C standard-mileage deduction.
      db.select().from(mileageLogsTable).where(and(gte(mileageLogsTable.date, startDate), lte(mileageLogsTable.date, endDate), eq(mileageLogsTable.classification, "business"), isNull(mileageLogsTable.subcontractorId), isNull(mileageLogsTable.voidedAt), mileageWhere)),
      db.select().from(otherIncomeTable).where(and(gte(otherIncomeTable.date, startDate), lte(otherIncomeTable.date, endDate), blWhere(otherIncomeTable.businessLine, otherIncomeTable.businessId), isNull(otherIncomeTable.voidedAt))),
      db.select().from(jobsTable).where(and(eq(jobsTable.status, "in_progress"), blWhere(jobsTable.businessLine, jobsTable.businessId))),
      // Recent rows — always unfiltered
      db.select({ id: jobsTable.id, title: jobsTable.title, description: jobsTable.description, clientId: jobsTable.clientId, clientName: clientsTable.name, status: jobsTable.status, jobType: jobsTable.jobType, address: jobsTable.address, city: jobsTable.city, state: jobsTable.state, startDate: jobsTable.startDate, endDate: jobsTable.endDate, notes: jobsTable.notes, createdAt: jobsTable.createdAt }).from(jobsTable).leftJoin(clientsTable, eq(jobsTable.clientId, clientsTable.id)).where(blWhere(jobsTable.businessLine, jobsTable.businessId)).orderBy(desc(jobsTable.createdAt)).limit(5),
      db.select({ id: invoicesTable.id, invoiceNumber: invoicesTable.invoiceNumber, clientId: invoicesTable.clientId, clientName: clientsTable.name, jobId: invoicesTable.jobId, status: invoicesTable.status, issueDate: invoicesTable.issueDate, dueDate: invoicesTable.dueDate, subtotal: invoicesTable.subtotal, taxRate: invoicesTable.taxRate, taxAmount: invoicesTable.taxAmount, total: invoicesTable.total, amountPaid: invoicesTable.amountPaid, notes: invoicesTable.notes, terms: invoicesTable.terms, lineItems: invoicesTable.lineItems, createdAt: invoicesTable.createdAt }).from(invoicesTable).leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id)).where(blWhere(invoicesTable.businessLine, invoicesTable.businessId)).orderBy(desc(invoicesTable.createdAt)).limit(5),
      db.select().from(ownerCapitalEntriesTable).where(and(
        gte(ownerCapitalEntriesTable.date, startDate),
        lte(ownerCapitalEntriesTable.date, expenseEndDate),
        isNull(ownerCapitalEntriesTable.voidedAt),
        reportBusiness ? eq(ownerCapitalEntriesTable.businessId, reportBusiness.id) : undefined,
      )),
      // Fixed/allocation sub payments — cash-basis cash out.
      // Date range covers the full 6-month chart window (chartStartDate) so that
      // subPayByMonth is populated for all chart months, not just the KPI period.
      // The KPI aggregate is further restricted to startDate..expenseEndDate in JS below.
      // No business-line filter at DB level so the result powers both KPI (filtered in JS) and byBusinessLine.
      // Hourly subs already have auto-expense records (jobSubHoursId IS NOT NULL) — exclude them
      // to avoid double-counting with the expensesTable rows.
      db.select({ amount: sql<string>`${subPaymentRecordsTable.amount} + COALESCE(${subPaymentRecordsTable.advanceAmount}, 0)`, paymentDate: subPaymentRecordsTable.paymentDate, businessId: subPaymentRecordsTable.businessId, businessLine: subPaymentRecordsTable.businessLine })
        .from(subPaymentRecordsTable)
        .innerJoin(jobSubcontractorsTable, and(
          eq(jobSubcontractorsTable.jobId, subPaymentRecordsTable.jobId),
          eq(jobSubcontractorsTable.subcontractorId, subPaymentRecordsTable.subcontractorId),
        ))
        .where(and(
          gte(subPaymentRecordsTable.paymentDate, chartStartDate),
          lte(subPaymentRecordsTable.paymentDate, expenseEndDate),
          sql`${subPaymentRecordsTable.isReversal} IS NOT TRUE`,
          inArray(jobSubcontractorsTable.compensationType, ["fixed", "allocation"]),
        )),
    ]);

    // Merge paid + non-paid into the unified kpiInvoices array.
    // Paid invoices are pre-filtered to those whose verified send date (or legacy
    // issueDate fallback) falls within the selected period. This ensures every downstream
    // aggregate (revenue, byBusinessLine, unattributed breakdown) stays period-accurate
    // without individual date guards. The issueDate-bounded non-paid array is appended unchanged.
    const kpiInvoices = [
      ...filterDashboardRevenueInvoices(kpiPaidInvoices, startDate, endDate),
      ...kpiNonPaidInvoices,
    ];

    // Fetch full (unfiltered) data for byBusinessLine breakdown.
    // When no filter is active, KPI data == full data — reuse it to avoid extra queries.
    const [rawPaidInvoices, rawNonPaidInvoices, rawExpenses, rawOtherIncome, rawActiveJobs] = validBl
      ? await Promise.all([
          // Same paid/non-paid split as kpiInvoices — see comment above
          db.select(dashboardInvoiceSelection).from(invoicesTable).where(eq(invoicesTable.status, "paid")),
          db.select().from(invoicesTable).where(and(ne(invoicesTable.status, "paid"), gte(invoicesTable.issueDate, startDate), lte(invoicesTable.issueDate, endDate))),
          db.select().from(expensesTable).where(and(gte(expensesTable.date, startDate), lte(expensesTable.date, expenseEndDate), isNull(expensesTable.voidedAt))),
          db.select().from(otherIncomeTable).where(and(gte(otherIncomeTable.date, startDate), lte(otherIncomeTable.date, endDate), isNull(otherIncomeTable.voidedAt))),
          db.select().from(jobsTable).where(eq(jobsTable.status, "in_progress")),
        ])
      : [kpiPaidInvoices, kpiNonPaidInvoices, kpiExpenses, kpiOtherIncome, kpiActiveJobs];
    // Same dashboard send-date gate as kpiInvoices.
    const rawInvoices = [
      ...filterDashboardRevenueInvoices(rawPaidInvoices, startDate, endDate),
      ...rawNonPaidInvoices,
    ];

    // YTD mileage — fetched separately for the "Tax Deductions" display card (always shows YTD totals).
    // subcontractorId IS NULL: owner vehicle mileage only (excludes sub-portal tracking logs).
    const ytdMileageLogs = period === "year"
      ? allMileage
      : await db.select().from(mileageLogsTable).where(and(gte(mileageLogsTable.date, ytdStart), lte(mileageLogsTable.date, endDate), eq(mileageLogsTable.classification, "business"), isNull(mileageLogsTable.subcontractorId), isNull(mileageLogsTable.voidedAt), mileageWhere));

    // Dashboard operating revenue is attributed to the invoice's verified send period.
    // Payment status still controls recognition: unpaid sent/overdue invoices remain outstanding.
    const invoiceRevenue = sumDashboardRevenue(kpiInvoices, startDate, endDate);
    const revenueDateBasis = summarizeDashboardRevenueDateBasis(kpiPaidInvoices, startDate, endDate);
    const otherIncomeTotal = kpiOtherIncome.reduce((s, o) => s + parseFloat(o.amount ?? "0"), 0);
    const totalRevenue = invoiceRevenue + otherIncomeTotal;
    const pendingInvoices = kpiInvoices.filter(i => i.status === "sent").reduce((s, i) => s + parseFloat(i.total ?? "0"), 0);
    const overdueInvoices = kpiInvoices.filter(i => i.status === "overdue").length;
    // Cash-basis: exclude outstanding cost-booking rows (description ending in "(outstanding)").
    // These are accrual-style bookings created by "Complete Job & Keep As Outstanding" — the sub
    // has NOT been paid. The actual cash payment appears in sub_payment_records below.
    const isOutstandingCostBooking = (e: { description?: string | null }) =>
      (e.description ?? "").endsWith("(outstanding)");
    // Exclude wage-advance expenses for hourly subs (isWageAdvance = true).
    // These are cash advances that are pre-payments of hourly wages already fully captured
    // in job_sub_hours auto-expense accruals. Including them would double-count the labor cost.
    // The advance still appears on the Expenses page as a cash-flow record.
    const nonMileageExpenses = kpiExpenses.filter(e =>
      e.category !== "mileage" && !isOutstandingCostBooking(e) && !e.isWageAdvance,
    );
    // Fixed/allocation sub payments for this KPI period only (allSubPayments covers a wider
    // 6-month chart window, so restrict here to startDate..expenseEndDate before summing).
    // Also filtered to validBl in JS. Hourly subs already have auto-expense records so only
    // fixed/allocation need to be added from sub_payment_records.
    const kpiSubPayments = allSubPayments.filter(r =>
      r.paymentDate >= startDate &&
      r.paymentDate <= expenseEndDate &&
      (!validBl || r.businessLine === validBl),
    );
    const fixedAllocSubPaymentTotal = kpiSubPayments.reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
    const totalExpenses = nonMileageExpenses.reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0) + fixedAllocSubPaymentTotal;
    const excludedFromProfitFormula = nonMileageExpenses
      .filter(e => e.excludeFromNetProfit)
      .reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);
    const excludedFromProfit = kpiExpenses
      .filter(e => e.excludeFromNetProfit)
      .reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);
    const excludedExpenseCount = kpiExpenses.filter(e => e.excludeFromNetProfit).length;
    // Period-consistent mileage deduction used in the profit formula
    const periodMileageSummary = summarizeMileageRecords(allMileage);
    // YTD mileage deduction for the "Tax Deductions" display card (always YTD)
    const ytdMileageSummary = summarizeMileageRecords(ytdMileageLogs);
    const periodMileageDeduction = periodMileageSummary.totalDeduction;
    const mileageDeduction = ytdMileageSummary.totalDeduction;
    // Mileage cannot be attributed to a single business line — exclude from filtered net profit
    const mileageForNetProfit = validBl ? 0 : periodMileageDeduction;
    const operationalNetProfit = totalRevenue - (totalExpenses - excludedFromProfitFormula) - mileageForNetProfit;
    // Owner draws — tracked separately, never reduce taxable profit.
    // Covers all owner-distribution categories: legacy "Owner Draw", current
    // "Owner Compensation", and equity "Owner Withdrawal".
    // Negative owner_capital_entries are "Return of Capital" — they already
    // reduce netCapitalInvested in the frontend ledger and must NOT be added
    // to ownerDrawTotal, which would deduct them a second time from equity.
    const ownerDrawTotal = kpiOwnerCapital
      .filter(e => !reportBusiness || e.businessId === reportBusiness.id)
      .reduce((sum, e) => {
        const amount = parseFloat(e.amount ?? "0");
        return sum + (amount < 0 ? Math.abs(amount) : 0);
      }, 0);
    const ytdMiles = ytdMileageSummary.totalMiles;
    const ytdMileageRate = ytdMileageSummary.ratePerMile;

    // Subcontractor pay metrics — query job_subcontractors directly.
    // "Paid" = you recorded a payment on the job card. Completely independent of
    // whether the client has paid the invoice. A Subcontractor expense record just
    // means you spent that money — it does NOT count as "owed".
    const subPayRows = await db.select({
      amountOwed:       jobSubcontractorsTable.amountOwed,
      amountPaid:       jobSubcontractorsTable.amountPaid,
      paymentStatus:    jobSubcontractorsTable.paymentStatus,
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
      if (reportBusiness && !(r.businessId != null
        ? r.businessId === reportBusiness.id
        : r.businessLine === reportBusiness.slug)) continue;
      const paid = r.amountPaid != null ? parseFloat(r.amountPaid) : 0;
      subContractorPaid += paid;
      // Trust paymentStatus as authoritative — paid/overpaid rows have no outstanding liability.
      // This matches the logic in /api/subcontractors/outstanding-balances.
      if (r.paymentStatus === "paid" || r.paymentStatus === "overpaid") continue;
      let owed: number;
      if (r.amountOwed != null) {
        owed = parseFloat(r.amountOwed);
      } else if (r.compensationType === "allocation" && r.allocationPct != null && r.jobId != null) {
        const pool = splitPoolMap.get(r.jobId)?.splitPool ?? 0;
        owed = computeSubOwed({ compensationType: "allocation", amountOwed: null, fixedAmount: null, allocationPct: r.allocationPct }, pool) ?? 0;
      } else {
        owed = parseFloat(r.computedOwed ?? "0");
      }
      subContractorOwed += Math.max(0, owed - paid);
    }
    const subContractorRemaining = subContractorOwed;
    const ownerProfit = operationalNetProfit - subContractorRemaining;
    // undrawnBalance placed here (after subContractorRemaining) so it reflects real obligations
    const undrawnBalance = operationalNetProfit - ownerDrawTotal - subContractorRemaining;

    // Profit by business line breakdown — always computed from full (unfiltered) data
    const OWNER_DRAW_CATS = OWNER_WITHDRAWAL_EXPENSE_CATEGORIES;
    const allBusinesses = await db.select({ slug: businessesTable.slug, name: businessesTable.name }).from(businessesTable).orderBy(businessesTable.id);

    // Group KPI-period sub payments by business line for the per-BL breakdown.
    // Only include payments within startDate..expenseEndDate so the BL breakdown stays
    // period-consistent with invoices and ordinary expenses.
    // (subPayByMonth uses the wider allSubPayments array for the 6-month chart window.)
    const kpiSubPayForBl = allSubPayments.filter(r =>
      r.paymentDate >= startDate && r.paymentDate <= expenseEndDate
    );
    const subPayByBl = new Map<string, number>();
    for (const r of kpiSubPayForBl) {
      const bl = r.businessLine ?? "unattributed";
      subPayByBl.set(bl, (subPayByBl.get(bl) ?? 0) + parseFloat(r.amount ?? "0"));
    }

    const byBusinessLine = allBusinesses.map(biz => {
      const bl = biz.slug;
      const blInvoices = rawInvoices.filter(i => i.businessLine === bl);
      const blOther = rawOtherIncome.filter(o => o.businessLine === bl);
      // Exclude outstanding cost-bookings (cash-basis: not yet paid) and wage-advance
      // pre-payments (already captured in jsh accruals) from the BL breakdown too.
      const blExpenses = rawExpenses.filter(e => e.businessLine === bl && e.category !== "mileage" && !isOutstandingCostBooking(e) && !e.isWageAdvance);
      const blActiveJobs = rawActiveJobs.filter(j => j.businessLine === bl);
      const blRevenue = sumDashboardRevenue(blInvoices, startDate, endDate)
        + blOther.reduce((s, o) => s + parseFloat(o.amount ?? "0"), 0);
      const blSubPayTotal = subPayByBl.get(bl) ?? 0;
      const blExpenseTotal = blExpenses.reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0) + blSubPayTotal;
      const blOwnerDrawTotal = blExpenses.filter(e => isOwnerWithdrawalExpenseCategory(e.category)).reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);
      // Union of owner-draw categories and the excludeFromNetProfit flag.
      // Each expense is excluded at most once even if both conditions apply,
      // preserving the Expense-UI "exclude from net profit" semantics for
      // non-owner expenses while also catching owner draws that predate the flag.
      // Sub payments (blSubPayTotal) are always business costs — never excluded.
      const blExcludedTotal = blExpenses
        .filter(e => isOwnerWithdrawalExpenseCategory(e.category) || !!e.excludeFromNetProfit)
        .reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);
      return {
        businessLine: bl,
        label: biz.name,
        totalRevenue: blRevenue,
        totalExpenses: blExpenseTotal,
        businessExpenses: blExpenseTotal - blOwnerDrawTotal,
        operationalNetProfit: blRevenue - (blExpenseTotal - blExcludedTotal),
        activeJobs: blActiveJobs.length,
      };
    });

    // Unattributed: revenue/expenses not tagged to any registered business slug
    const knownBls = new Set(allBusinesses.map(b => b.slug));
    const unattribExpenses = rawExpenses.filter(e =>
      (!e.businessLine || !knownBls.has(e.businessLine)) &&
      e.category !== "mileage" &&
      !isOutstandingCostBooking(e) &&
      !e.isWageAdvance,
    );
    const unattribInvoices = rawInvoices.filter(i => !i.businessLine || !knownBls.has(i.businessLine));
    const unattribOther = rawOtherIncome.filter(o => !o.businessLine || !knownBls.has(o.businessLine));
    const unattribRevenue = sumDashboardRevenue(unattribInvoices, startDate, endDate)
      + unattribOther.reduce((s, o) => s + parseFloat(o.amount ?? "0"), 0);
    // Unattributed sub payments: those with null/unknown businessLine or a slug not in registered businesses
    const unattribSubPay = Array.from(subPayByBl.entries())
      .filter(([bl]) => bl === "unattributed" || !knownBls.has(bl))
      .reduce((s, [, v]) => s + v, 0);
    const unattribExpenseTotal = unattribExpenses.reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0) + unattribSubPay;
    // Match the attribution logic: union of owner-category OR excludeFromNetProfit flag
    const unattribOwnerTotal = unattribExpenses.filter(e => isOwnerWithdrawalExpenseCategory(e.category)).reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);
    const unattribExcluded = unattribExpenses.filter(e => isOwnerWithdrawalExpenseCategory(e.category) || !!e.excludeFromNetProfit).reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);
    if (unattribRevenue > 0 || unattribExpenseTotal > 0) {
      byBusinessLine.push({
        businessLine: "unattributed",
        label: "Unattributed",
        totalRevenue: unattribRevenue,
        totalExpenses: unattribExpenseTotal,
        businessExpenses: unattribExpenseTotal - unattribOwnerTotal,
        operationalNetProfit: unattribRevenue - (unattribExpenseTotal - unattribExcluded),
        activeJobs: 0,
      });
    }

    // Build month → sub payment total map (for monthly chart).
    // Uses the already-fetched allSubPayments so no extra DB round trip.
    const subPayByMonth = new Map<string, number>();
    for (const r of allSubPayments) {
      if (validBl && r.businessLine !== validBl) continue;
      const month = r.paymentDate.slice(0, 7); // YYYY-MM
      subPayByMonth.set(month, (subPayByMonth.get(month) ?? 0) + parseFloat(r.amount ?? "0"));
    }

    // Monthly revenue for last 6 months — DB-level filter applied for chart data
    const monthlyRevenue = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(1); // pin to 1st before subtracting months to prevent day overflow (e.g. Mar 31 → Feb 31 → Mar 3)
      d.setMonth(d.getMonth() - i);
      const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const lastDay = String(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()).padStart(2, "0");
      const [monthlyPaidInv, monthlyNonPaidInv, monthlyExp, monthlyOther] = await Promise.all([
        // Paid invoices: no issueDate filter — JS attributes by send date below
        db.select(dashboardInvoiceSelection).from(invoicesTable).where(and(eq(invoicesTable.status, "paid"), blWhere(invoicesTable.businessLine, invoicesTable.businessId))),
        // Non-paid: issueDate-bounded so outstanding counts remain month-specific
        db.select().from(invoicesTable).where(and(ne(invoicesTable.status, "paid"), gte(invoicesTable.issueDate, `${monthStr}-01`), lte(invoicesTable.issueDate, `${monthStr}-${lastDay}`), blWhere(invoicesTable.businessLine, invoicesTable.businessId))),
        db.select().from(expensesTable).where(and(gte(expensesTable.date, `${monthStr}-01`), lte(expensesTable.date, `${monthStr}-${lastDay}`), blWhere(expensesTable.businessLine, expensesTable.businessId), isNull(expensesTable.voidedAt))),
        db.select().from(otherIncomeTable).where(and(gte(otherIncomeTable.date, `${monthStr}-01`), lte(otherIncomeTable.date, `${monthStr}-${lastDay}`), blWhere(otherIncomeTable.businessLine, otherIncomeTable.businessId), isNull(otherIncomeTable.voidedAt))),
      ]);
      // Filter paid to verified send date (or issueDate fallback) within this month so the revenue bar
      // and outstanding aggregate only reflect invoices that belong to this period.
      const monthlyInv = [
        ...filterDashboardRevenueInvoices(monthlyPaidInv, `${monthStr}-01`, `${monthStr}-${lastDay}`),
        ...monthlyNonPaidInv,
      ];
      const invRevenue = sumDashboardRevenue(monthlyInv, `${monthStr}-01`, `${monthStr}-${lastDay}`);
      const othRevenue = monthlyOther.reduce((s, o) => s + parseFloat(o.amount ?? "0"), 0);
      const mo_revenue = invRevenue + othRevenue;
      // Exclude mileage (sourced from mileage_logs), owner distributions (equity, not business costs),
      // and outstanding cost-bookings (cash not yet paid) so the monthly chart matches the
      // top-line net profit formula. Add fixed/allocation sub payments for this month.
      const MONTHLY_OWNER_CATS = OWNER_WITHDRAWAL_EXPENSE_CATEGORIES;
      const mo_subPay = subPayByMonth.get(monthStr) ?? 0;
      const mo_expenses = monthlyExp.filter(e =>
        e.category !== "mileage" &&
        !isOwnerWithdrawalExpenseCategory(e.category) &&
        !(e.description ?? "").endsWith("(outstanding)") &&
        !e.isWageAdvance
      ).reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0) + mo_subPay;
      const mo_outstanding = monthlyInv.filter(i => ["sent", "overdue"].includes(i.status ?? "")).reduce((s, i) => s + parseFloat(i.total ?? "0"), 0);
      monthlyRevenue.push({
        month: monthStr,
        revenue: mo_revenue,
        expenses: mo_expenses,
        profit: mo_revenue - mo_expenses,
        outstanding: mo_outstanding,
      });
    }

    res.json({
      totalRevenue,
      revenueDateBasis,
      pendingInvoices,
      activeJobs: kpiActiveJobs.length,
      totalExpenses,
      businessExpenses: totalExpenses - ownerDrawTotal,
      mileageDeduction,
      periodMileageDeduction,
      ytdMiles,
      ytdMileageRate,
      ratePeriods: ytdMileageSummary.ratePeriods,
      periodRatePeriods: periodMileageSummary.ratePeriods,
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

router.get("/revenue-by-month", sectionGuard("invoices"), async (req, res) => {
  try {
    const requestedYear = Number(req.query.year);
    const currentYear = new Date().getFullYear();
    const year = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= currentYear + 1
      ? requestedYear
      : currentYear;
    const businessLine = typeof req.query.businessLine === "string" && req.query.businessLine.trim()
      ? req.query.businessLine.trim()
      : null;
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    const businessWhere = (column: Parameters<typeof eq>[0]) =>
      businessLine ? eq(column, businessLine) : undefined;

    const [paidInvoices, otherIncome] = await Promise.all([
      db.select(dashboardInvoiceSelection)
        .from(invoicesTable)
        .where(and(
          eq(invoicesTable.status, "paid"),
          isNull(invoicesTable.voidedAt),
          businessWhere(invoicesTable.businessLine),
        )),
      db.select({
        date: otherIncomeTable.date,
        amount: otherIncomeTable.amount,
      })
        .from(otherIncomeTable)
        .where(and(
          gte(otherIncomeTable.date, startDate),
          lte(otherIncomeTable.date, endDate),
          isNull(otherIncomeTable.voidedAt),
          businessWhere(otherIncomeTable.businessLine),
        )),
    ]);

    const months = Array.from({ length: 12 }, (_, index) => {
      const month = `${year}-${String(index + 1).padStart(2, "0")}`;
      const lastDay = String(new Date(year, index + 1, 0).getDate()).padStart(2, "0");
      const monthStart = `${month}-01`;
      const monthEnd = `${month}-${lastDay}`;
      const invoiceRevenue = sumDashboardRevenue(paidInvoices, monthStart, monthEnd);
      const otherIncomeRevenue = otherIncome
        .filter(row => row.date >= monthStart && row.date <= monthEnd)
        .reduce((sum, row) => sum + parseFloat(row.amount ?? "0"), 0);

      return {
        month,
        invoiceRevenue,
        otherIncome: otherIncomeRevenue,
        totalRevenue: invoiceRevenue + otherIncomeRevenue,
      };
    });
    const annualTotal = months.reduce((sum, month) => sum + month.totalRevenue, 0);

    res.json({
      year,
      businessLine,
      annualTotal,
      monthlyAverage: annualTotal / 12,
      months,
      attribution: {
        invoices: "first_verified_delivery_or_issue_date",
        otherIncome: "receipt_date",
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get monthly revenue" });
  }
});

router.get("/compliance", sectionGuard("compliance"), async (req, res) => {
  try {
    const blFilter = (req.query.businessLine as string | undefined) || null;
    const [settings] = await db.select().from(settingsTable).limit(1);
    const threshold = parseFloat(settings?.thresholdAmount1099 ?? "600");

    const [subs, mileageLogs, uncategorizedMileageResult] = await Promise.all([
      db.select().from(subcontractorsTable),
      db.select().from(mileageLogsTable).where(and(eq(mileageLogsTable.classification, "business"), isNull(mileageLogsTable.voidedAt))),
      db.select({ cnt: count() }).from(mileageLogsTable).where(
        sql`(${mileageLogsTable.classification} IS NULL OR ${mileageLogsTable.classification} NOT IN ('business', 'personal'))`
      ),
    ]);

    const currentYear = new Date().getFullYear();
    const subsWithYtd = await Promise.all(subs.map(async s => ({
      ...s,
      _ytd: await computeYtd(s.id, currentYear, blFilter),
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

    const uncategorizedMileageCount = uncategorizedMileageResult[0]?.cnt ?? 0;
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
    const rawYear = req.query.year == null ? new Date().getFullYear() : Number(req.query.year);
    if (!Number.isInteger(rawYear) || rawYear < 2000 || rawYear > 2200) return res.status(400).json({ error: "A valid tax year is required" });
    const year = rawYear;
    const reportBusiness = await resolveReportBusiness(req.query.businessLine, undefined, res);
    if (reportBusiness === undefined) return;
    const blFilter = reportBusiness?.slug ?? null;
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    const blWhere = (businessLineColumn: any, businessIdColumn?: any) =>
      reportBusinessWhere(reportBusiness ?? null, businessLineColumn, businessIdColumn);
    const mileageWhere = reportBusiness ? eq(mileageLogsTable.businessId, reportBusiness.id) : undefined;

    // Accounting invoice columns — shared between the paid and non-paid fetches below
    const accInvoiceCols = {
      id: invoicesTable.id,
      status: invoicesTable.status,
      subtotal: invoicesTable.subtotal,
      taxRate: invoicesTable.taxRate,
      taxAmount: invoicesTable.taxAmount,
      total: invoicesTable.total,
      amountPaid: invoicesTable.amountPaid,
      issueDate: invoicesTable.issueDate,
      stripePaidAt: invoicesTable.stripePaidAt,
      squarePaidAt: invoicesTable.squarePaidAt,
      lastManualPaidAt: invoicesTable.lastManualPaidAt,
      invoiceCity: invoicesTable.city,
      invoiceState: invoicesTable.state,
      jobCity: jobsTable.city,
      jobState: jobsTable.state,
      clientName: clientsTable.name,
      invoiceNumber: invoicesTable.invoiceNumber,
      businessLine: invoicesTable.businessLine,
      lineItems: invoicesTable.lineItems,
    };
    const [accPaidInvoices, accNonPaidInvoices, expenses, mileageLogs, subs, settings, otherIncomeRows, accFixedAllocSubPayments] = await Promise.all([
      // Paid invoices: no issueDate filter — effective payment date governs year attribution in JS.
      // An invoice issued in Dec but paid in Jan will appear in January's revenue, not December's.
      db.select(accInvoiceCols)
        .from(invoicesTable)
        .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
        .leftJoin(jobsTable, eq(invoicesTable.jobId, jobsTable.id))
        .where(and(eq(invoicesTable.status, "paid"), blWhere(invoicesTable.businessLine, invoicesTable.businessId))),
      // Non-paid invoices: issueDate-bounded so pending/overdue revenue stays year-specific
      db.select(accInvoiceCols)
        .from(invoicesTable)
        .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
        .leftJoin(jobsTable, eq(invoicesTable.jobId, jobsTable.id))
        .where(and(ne(invoicesTable.status, "paid"), gte(invoicesTable.issueDate, startDate), lte(invoicesTable.issueDate, endDate), blWhere(invoicesTable.businessLine, invoicesTable.businessId))),
      db.select().from(expensesTable).where(and(gte(expensesTable.date, startDate), lte(expensesTable.date, endDate), blWhere(expensesTable.businessLine, expensesTable.businessId), isNull(expensesTable.voidedAt))),
      // subcontractorId IS NULL: owner vehicle mileage only — excludes sub-portal tracking logs.
      db.select().from(mileageLogsTable).where(and(gte(mileageLogsTable.date, startDate), lte(mileageLogsTable.date, endDate), isNull(mileageLogsTable.subcontractorId), isNull(mileageLogsTable.voidedAt), mileageWhere)),
      db.select().from(subcontractorsTable),
      db.select().from(settingsTable).limit(1),
      db.select().from(otherIncomeTable).where(and(gte(otherIncomeTable.date, startDate), lte(otherIncomeTable.date, endDate), blWhere(otherIncomeTable.businessLine, otherIncomeTable.businessId), isNull(otherIncomeTable.voidedAt))),
      // Fixed/allocation sub payments — cash-basis cash out (not in expenses after Task #892).
      // Hourly subs already have auto-expense records (jobSubHoursId IS NOT NULL) — excluded here
      // via compensationType filter to avoid double-counting with the expensesTable rows.
      // paymentDate and jobId are fetched to power monthlyIncome and directJobCosts breakdowns.
      db.select({
        amount:      sql<string>`${subPaymentRecordsTable.amount} + COALESCE(${subPaymentRecordsTable.advanceAmount}, 0)`,
        businessLine: subPaymentRecordsTable.businessLine,
        paymentDate: subPaymentRecordsTable.paymentDate,
        jobId:       subPaymentRecordsTable.jobId,
      })
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
        )),
    ]);
    // Merge paid + non-paid. Paid invoices are pre-filtered to effective payment date within
    // the selected year so cityMap, owensboroGross, and all other aggregates only see
    // invoices that belong to this year — no extra guards needed in each calculation.
    const invoices = [
      ...filterCashReceipts(accPaidInvoices, startDate, endDate),
      ...accNonPaidInvoices,
    ].map(inv => {
      const live = calcInvoiceFromStored(inv.lineItems, inv.taxRate);
      return { ...inv, subtotal: String(live.subtotal), taxAmount: String(live.taxAmount), total: String(live.total) };
    });

    const invoiceGrossRevenue = invoices.reduce((s, i) => s + parseFloat(i.total ?? "0"), 0);
    // Cash-basis: count paid revenue only when payment was received in the selected year
    const invoicePaidRevenue = sumCashReceipts(invoices, startDate, endDate);
    const pendingRevenue = invoices.filter(i => ["sent", "overdue"].includes(i.status)).reduce((s, i) => s + parseFloat(i.total ?? "0"), 0);
    const otherIncomeSum = otherIncomeRows.reduce((s, o) => s + parseFloat(o.amount ?? "0"), 0);
    const grossRevenue = invoiceGrossRevenue + otherIncomeSum;
    const paidRevenue = invoicePaidRevenue + otherIncomeSum;

    // Exclude mileage category — it's tracked separately via mileageDeduction from
    // mileage_logs to prevent double-counting in the net profit calculation.
    // Also exclude outstanding cost-booking rows (cash-basis: sub has NOT been paid yet;
    // description ends with "(outstanding)"). The actual cash payment appears in
    // accFixedAllocSubPayments below.
    const accIsOutstanding = (e: { description?: string | null }) =>
      (e.description ?? "").endsWith("(outstanding)");
    // Exclude wage-advance expenses (isWageAdvance=true): pre-payments of hourly wages
    // already fully captured in jsh auto-expense accruals — counting them would double the cost.
    const nonMileageExpenses = expenses.filter(e =>
      e.category !== "mileage" && !accIsOutstanding(e) && !e.isWageAdvance,
    );
    const accFixedAllocSubPaymentTotal = accFixedAllocSubPayments.reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
    const totalExpenses = nonMileageExpenses.reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0) + accFixedAllocSubPaymentTotal;
    const legacyOwnerDrawTotal = nonMileageExpenses
      .filter(e => isOwnerWithdrawalExpenseCategory(e.category))
      .reduce((sum, e) => sum + parseFloat(e.amount ?? "0"), 0);
    // subcontractorId == null guard: belt-and-suspenders in case the DB query misses any
    // sub logs (e.g. businessId filter alone wouldn't exclude business_id=NULL sub records).
    const businessMiles = mileageLogs.filter(m => m.classification === "business" && m.subcontractorId == null);
    const mileageSummary = summarizeMileageRecords(businessMiles);
    const totalMiles = mileageSummary.totalMiles;
    const mileageDeduction = mileageSummary.totalDeduction;

    // Slot order for mock queue: [assets, assetBusinessUse, waterfallPaidInvs, accOwnerContribRows]
    // computeOwnerWaterfall fires its first await synchronously → [waterfallPaidInvs] before the
    // direct ownerCapitalEntries chain → [accOwnerContribRows] next.
    const [subsWithYtdAcc, depreciationDeduction, accWaterfall, accOwnerContribRows] = await Promise.all([
      Promise.all(subs.map(async s => ({ ...s, _ytd: await computeYtd(s.id, year, blFilter) }))),
      computeDepreciationForYear(year, reportBusiness ?? null),
      computeOwnerWaterfall(year, reportBusiness ?? null),
      db.select({ amount: ownerCapitalEntriesTable.amount, businessId: ownerCapitalEntriesTable.businessId })
        .from(ownerCapitalEntriesTable)
        .where(and(
          gte(ownerCapitalEntriesTable.date, startDate),
          lte(ownerCapitalEntriesTable.date, endDate),
          isNull(ownerCapitalEntriesTable.voidedAt),
          reportBusiness ? eq(ownerCapitalEntriesTable.businessId, reportBusiness.id) : undefined,
        )),
    ]);
    const canonicalOwnerDrawTotal = accOwnerContribRows.reduce((sum, row) => {
      const amount = parseFloat(row.amount ?? "0");
      return sum + (amount < 0 ? Math.abs(amount) : 0);
    }, 0);
    // Canonical ledger wins. The fallback keeps still-active pre-migration rows readable
    // without adding them on top of a matching owner-capital withdrawal.
    const ownerDrawTotal = canonicalOwnerDrawTotal > 0 ? canonicalOwnerDrawTotal : legacyOwnerDrawTotal;
    // Sign convention: positive entries = capital contributions (cash into business).
    const accOwnerContributionsTotal = (accOwnerContribRows as { amount: string | null }[]).reduce((s, r) => {
      const amt = parseFloat(r.amount ?? "0");
      return s + (amt > 0 ? amt : 0);
    }, 0);
    const totalSubPayments = subsWithYtdAcc.reduce((acc, s) => acc + s._ytd, 0);
    // Net profit excludes owner draws and deducts depreciation — matches P&L and Year-End Report
    const netProfit = paidRevenue - (totalExpenses - legacyOwnerDrawTotal) - mileageDeduction - depreciationDeduction;
    const undrawnBalance = netProfit - ownerDrawTotal;

    // Income by city — estOccTax replaces taxCollected (Willard never charges sales tax)
    const taxAssumptions = getTaxAssumptions(year, settings[0]?.taxAssumptions as any);
    const cityMap = new Map<string, { city: string; state: string; invoiceCount: number; gross: number; paid: number; estOccTax: number }>();
    for (const inv of invoices) {
      // Trim before fallback so whitespace-only invoice fields don't suppress job fields
      const city = (inv.invoiceCity ?? "").trim() || (inv.jobCity ?? "").trim() || "Unspecified";
      const state = ((inv.invoiceState ?? "").trim() || (inv.jobState ?? "").trim()).toUpperCase();
      // Normalize key: lowercase city + uppercase state so casing differences don't split rows
      const key = `${city.toLowerCase()}||${state}`;
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
      const state = (o.state ?? "").trim().toUpperCase();
      const key = `${city.toLowerCase()}||${state}`;
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
         row.estOccTax = Math.max(0, row.gross * taxAssumptions.occupationalRate);
      }
    }
    const incomeByCity = Array.from(cityMap.values()).sort((a, b) => b.gross - a.gross);

    // Estimated tax liabilities based on YTD net profit
    // Sum across ALL Owensboro rows (same city may appear with different state/blank state values)
    const owensboroGross = incomeByCity
      .filter(r => r.city.trim().toLowerCase() === "owensboro")
      .reduce((s, r) => s + r.gross, 0);
    // Use shared helper — federal income tax is NOT yet included in this endpoint's total
    // (that addition is handled by Task #1872 for the reserve dashboard).
    const accTaxEst = computeTaxEstimate(netProfit, owensboroGross, year, settings[0]?.taxAssumptions as any);
    const estimatedTaxes = {
      owensboroOccTax: accTaxEst.occ,
      kyStateTax: accTaxEst.kyState,
      federalSETax: accTaxEst.federalSE,
      totalEstimated: accTaxEst.totalWithoutFederalIncome,
      owensboroOccRate: taxAssumptions.occupationalRate,
      kyStateRate: taxAssumptions.kentuckyIncomeRate,
      federalSERate: taxAssumptions.federalSeRate,
      assumptionsUsed: accTaxEst.assumptionsUsed,
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

    // Expenses by category (mileage and owner distributions excluded — mileage shown
    // separately; owner pay is a personal distribution not a business cost).
    // Fixed/allocation sub payments are included under the "Subcontractor" category so the
    // category chart agrees with totalExpenses.
    const catMap = new Map<string, { category: string; amount: number; count: number }>();
    for (const e of nonMileageExpenses) {
      if (isOwnerWithdrawalExpenseCategory(e.category)) continue;
      const cat = e.category || "Uncategorized";
      const existing = catMap.get(cat) ?? { category: cat, amount: 0, count: 0 };
      existing.amount += parseFloat(e.amount ?? "0");
      existing.count++;
      catMap.set(cat, existing);
    }
    // Merge sub payments into the "Subcontractor" category bucket.
    if (accFixedAllocSubPayments.length > 0) {
      const subCatEntry = catMap.get("Subcontractor") ?? { category: "Subcontractor", amount: 0, count: 0 };
      subCatEntry.amount += accFixedAllocSubPaymentTotal;
      subCatEntry.count  += accFixedAllocSubPayments.length;
      catMap.set("Subcontractor", subCatEntry);
    }
    const expensesByCategory = Array.from(catMap.values()).sort((a, b) => b.amount - a.amount);
    // Business expenses = total non-mileage expenses minus owner draws
    const businessExpenses = totalExpenses - legacyOwnerDrawTotal;

    // Direct Job Costs vs Overhead split.
    // Direct = expenses linked to a specific job (jobId set); Overhead = not linked to any job.
    // Fixed/allocation sub payments are always job-specific (pay-worker requires a job) →
    // they are added to directJobCosts in full.
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
    const OWNER_CATS_ACC = OWNER_WITHDRAWAL_EXPENSE_CATEGORIES;
    const directJobExpenses = nonMileageExpenses.filter(e => e.jobId != null && !isOwnerWithdrawalExpenseCategory(e.category));
    const overheadExpenses  = nonMileageExpenses.filter(e => e.jobId == null  && !isOwnerWithdrawalExpenseCategory(e.category));
    // Sub payments go to directJobCosts (they're always tied to a job).
    // Include them in the Subcontractor slice of directJobCostsByCategory.
    const directJobCosts = directJobExpenses.reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0) + accFixedAllocSubPaymentTotal;
    const overheadCosts  = overheadExpenses.reduce((s, e)  => s + parseFloat(e.amount ?? "0"), 0);
    const grossMargin = paidRevenue - directJobCosts;
    // Build the per-category breakdown for direct costs, adding sub payments to "Subcontractor".
    const directJobCostsByCategory = (() => {
      const base = buildCatBreakdown(directJobExpenses);
      if (accFixedAllocSubPayments.length > 0) {
        const idx = base.findIndex(r => r.category === "Subcontractor");
        if (idx >= 0) {
          base[idx] = { ...base[idx], amount: base[idx].amount + accFixedAllocSubPaymentTotal, count: base[idx].count + accFixedAllocSubPayments.length };
        } else {
          base.push({ category: "Subcontractor", amount: accFixedAllocSubPaymentTotal, count: accFixedAllocSubPayments.length });
        }
        base.sort((a, b) => b.amount - a.amount);
      }
      return base;
    })();
    const overheadByCategory = buildCatBreakdown(overheadExpenses);

    // Group sub payments by YYYY-MM for the monthly chart.
    const accSubPayByMonth = new Map<string, number>();
    for (const r of accFixedAllocSubPayments) {
      const ms = r.paymentDate.slice(0, 7);
      accSubPayByMonth.set(ms, (accSubPayByMonth.get(ms) ?? 0) + parseFloat(r.amount ?? "0"));
    }

    // Monthly income trend — cash basis for paid, issue-date for non-paid.
    // Paid invoices are bucketed by effective payment date (stripePaidAt → squarePaidAt →
    // issueDate) so a December-issued invoice paid in January lands in January's paid
    // column rather than being dropped from the chart entirely.
    // Sub payments are added per-month so the chart's expense bars agree with totalExpenses.
    const monthlyIncome = [];
    for (let m = 1; m <= 12; m++) {
      const ms = `${year}-${String(m).padStart(2, "0")}`;
      const lastDay = new Date(year, m, 0).getDate();
      // Paid: bucket by effective payment date; non-paid: bucket by issueDate
      const monthPaidInvs    = invoices.filter(i => i.status === "paid" && filterCashReceipts([i], `${ms}-01`, `${ms}-${lastDay}`).length > 0);
      const monthNonPaidInvs = invoices.filter(i => i.status !== "paid" && (i.issueDate ?? "").startsWith(ms));
      // Owner distributions excluded — they are equity events, not business costs
      const monthExp = nonMileageExpenses.filter(e => e.date.startsWith(ms) && !isOwnerWithdrawalExpenseCategory(e.category));
      const monthSubPay = accSubPayByMonth.get(ms) ?? 0;
      const monthOther = otherIncomeRows.filter(o => o.date.startsWith(ms));
      const invGross = [...monthPaidInvs, ...monthNonPaidInvs].reduce((s, i) => s + parseFloat(i.total ?? "0"), 0);
      const othGross = monthOther.reduce((s, o) => s + parseFloat(o.amount ?? "0"), 0);
      monthlyIncome.push({
        month: ms,
        gross: invGross + othGross,
        paid: monthPaidInvs.reduce((s, i) => s + parseFloat(i.total ?? "0"), 0) + othGross,
        expenses: monthExp.reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0) + monthSubPay,
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
    // Owner distributions are equity events for a single-member LLC, never business costs.
    // Exclude from every business-line expense/profit calculation.
    const ACCT_OWNER_CATS = OWNER_WITHDRAWAL_EXPENSE_CATEGORIES;
    const knownBlSlugs = new Set(allBusinesses.map(b => b.slug));
    // Group accFixedAllocSubPayments by business line for byBusinessLine breakdown.
    const accSubPayByBl = new Map<string, number>();
    for (const r of accFixedAllocSubPayments) {
      const bl = r.businessLine ?? "untagged";
      accSubPayByBl.set(bl, (accSubPayByBl.get(bl) ?? 0) + parseFloat(r.amount ?? "0"));
    }

    const byBusinessLine: { businessLine: string; label: string; invoiceCount: number; invoiceGross: number; invoicePaid: number; otherIncome: number; totalRevenue: number; collectedRevenue: number; expenses: number; netProfit: number }[] = [];
    for (const biz of allBusinesses) {
      const bl = biz.slug;
      const blInvoices = invoices.filter(i => i.businessLine === bl);
      const blOther = otherIncomeRows.filter(o => o.businessLine === bl);
      const blExpenses = nonMileageExpenses.filter(e => e.businessLine === bl);
      const invoiceGross = blInvoices.reduce((s, i) => s + parseFloat(i.total ?? "0"), 0);
      const invoicePaid = blInvoices.filter(i => i.status === "paid").reduce((s, i) => s + parseFloat(i.total ?? "0"), 0);
      const otherSum = blOther.reduce((s, o) => s + parseFloat(o.amount ?? "0"), 0);
      const blOwnerTotal = blExpenses.filter(e => isOwnerWithdrawalExpenseCategory(e.category)).reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);
      const blSubPayTotal = accSubPayByBl.get(bl) ?? 0;
      const expSum = blExpenses.reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0) + blSubPayTotal;
      const businessExpSum = expSum - blOwnerTotal;
      byBusinessLine.push({
        businessLine: bl,
        label: biz.name,
        invoiceCount: blInvoices.length,
        invoiceGross,
        invoicePaid,
        otherIncome: otherSum,
        totalRevenue: invoiceGross + otherSum,
        collectedRevenue: invoicePaid + otherSum,
        expenses: businessExpSum,
        netProfit: (invoicePaid + otherSum) - businessExpSum,
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
      const blOwnerTotal = blExpenses.filter(e => isOwnerWithdrawalExpenseCategory(e.category)).reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);
      const untaggedSubPay = Array.from(accSubPayByBl.entries())
        .filter(([bl]) => bl === "untagged" || !knownBlSlugs.has(bl))
        .reduce((s, [, v]) => s + v, 0);
      const expSum = blExpenses.reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0) + untaggedSubPay;
      const businessExpSum = expSum - blOwnerTotal;
      byBusinessLine.push({
        businessLine: "untagged",
        label: "Untagged",
        invoiceCount: blInvoices.length,
        invoiceGross,
        invoicePaid,
        otherIncome: otherSum,
        totalRevenue: invoiceGross + otherSum,
        collectedRevenue: invoicePaid + otherSum,
        expenses: businessExpSum,
        netProfit: (invoicePaid + otherSum) - businessExpSum,
      });
    }

    const ownerDrawRows = nonMileageExpenses
      .filter(e => isOwnerWithdrawalExpenseCategory(e.category))
      .map(e => ({ id: e.id, date: e.date, amount: parseFloat(e.amount ?? "0"), description: e.description, notes: e.notes ?? null, vendor: e.vendor ?? null }))
      .sort((a, b) => b.date.localeCompare(a.date));

    // Outstanding sub payments — unpaid subs that haven't yet had Mark Paid clicked.
    // Includes fixed, allocation, and hourly types. For hourly subs the amount owed
    // is computed from job_sub_hours (hours × rateSnapshot); their hours also auto-
    // create expense records, so they appear in both totalExpenses and here.
    const outstandingSubRows = await db.select({
      subName: subcontractorsTable.name,
      jobTitle: jobsTable.title,
      jobId: jobSubcontractorsTable.jobId,
      subcontractorId: jobSubcontractorsTable.subcontractorId,
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
        inArray(jobSubcontractorsTable.compensationType, ["fixed", "allocation", "hourly"]),
        blFilter ? eq(jobsTable.businessLine, blFilter) : undefined,
      ));

    const outstandingAllocJobIds = [...new Set(
      outstandingSubRows
        .filter(r => r.amountOwed == null && r.compensationType === "allocation" && r.jobId != null)
        .map(r => r.jobId as number),
    )];
    const outstandingPoolMap = await computeAllocationSplitPools(outstandingAllocJobIds);

    // For hourly subs, compute amount owed from logged hours × rate snapshot
    const hourlyRows = outstandingSubRows.filter(r => r.compensationType === "hourly" && r.jobId != null && r.subcontractorId != null);
    const hourlyHoursMap = new Map<string, number>();
    if (hourlyRows.length > 0) {
      const hourlyJobIds = [...new Set(hourlyRows.map(r => r.jobId as number))];
      const hourlySubIds = [...new Set(hourlyRows.map(r => r.subcontractorId as number))];
      const hoursCostRows = await db.select({
        jobId: jobSubHoursTable.jobId,
        subcontractorId: jobSubHoursTable.subcontractorId,
        cost: sql<string>`COALESCE(SUM(${jobSubHoursTable.hours} * COALESCE(${jobSubHoursTable.rateSnapshot}, 0)), 0)`,
      })
        .from(jobSubHoursTable)
        .where(and(
          inArray(jobSubHoursTable.jobId, hourlyJobIds),
          inArray(jobSubHoursTable.subcontractorId, hourlySubIds),
        ))
        .groupBy(jobSubHoursTable.jobId, jobSubHoursTable.subcontractorId);
      for (const row of hoursCostRows) {
        if (hourlyRows.some(r => r.jobId === row.jobId && r.subcontractorId === row.subcontractorId)) {
          hourlyHoursMap.set(`${row.jobId}:${row.subcontractorId}`, parseFloat(row.cost));
        }
      }
    }

    const outstandingSubPayments = outstandingSubRows.map(r => {
      let fullOwed: number | null;
      if (r.amountOwed != null) {
        fullOwed = parseFloat(r.amountOwed);
      } else if (r.compensationType === "allocation" && r.jobId != null) {
        const pool = outstandingPoolMap.get(r.jobId)?.splitPool ?? 0;
        fullOwed = computeSubOwed({ compensationType: "allocation", amountOwed: null, fixedAmount: r.fixedAmount, allocationPct: r.allocationPct }, pool);
      } else if (r.compensationType === "hourly" && r.jobId != null && r.subcontractorId != null) {
        fullOwed = hourlyHoursMap.get(`${r.jobId}:${r.subcontractorId}`) ?? null;
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
    // Only show rows with a real positive balance — skip $0 and uncomputable (TBD) entries
    }).filter(i => i.amount != null && !Number.isNaN(i.amount) && i.amount > 0);
    const outstandingSubTotal = outstandingSubPayments.reduce((s, i) => s + (i.amount ?? 0), 0);

    // ── Owner Activity ──────────────────────────────────────────────────────────
    const { ownerAllocated: accOwnerAllocated, ownerTaxReserve: accOwnerTaxReserve } = accWaterfall;
    const accOwnerCashTaken = ownerDrawTotal;
    const accOwnerRetained = Math.max(0, accOwnerAllocated - accOwnerTaxReserve - accOwnerCashTaken);
    const accOwnerOverWithdrawal = Math.max(0, accOwnerCashTaken - (accOwnerAllocated - accOwnerTaxReserve));

    res.json({
      year,
      summary: { grossRevenue, paidRevenue, pendingRevenue, totalExpenses, businessExpenses, totalMiles, mileageDeduction, mileageRate: mileageSummary.ratePerMile, ratePeriods: mileageSummary.ratePeriods, totalSubPayments, netProfit, otherIncomeTotal: otherIncomeSum, ownerDrawTotal, undrawnBalance, directJobCosts, overheadCosts, grossMargin },
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
      ownerActivity: {
        ownerDrawTotal,
        ownerContributionsTotal: accOwnerContributionsTotal,
        ownerAllocated: accOwnerAllocated,
        ownerTaxReserve: accOwnerTaxReserve,
        ownerCashTaken: accOwnerCashTaken,
        ownerRetained: accOwnerRetained,
        ownerOverWithdrawal: accOwnerOverWithdrawal,
      },
      ownerDrawRows,
      outstandingSubPayments,
      outstandingSubTotal,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate accounting report" });
  }
});

// ─── Shared: Tax Profile Config ───────────────────────────────────────────────
// Drives the Owner Withdrawals card label and accounting disclaimer.
// All tax-treatment rules live here — never branch on election name elsewhere.
export interface TaxProfile {
  taxElection: string;
  activitySectionTitle: string;
  contributionLabel: string;     // retained for response compatibility only
  distributionLabel: string;
  activityDisclaimer: string;
}

export function getTaxProfile(taxElection: string | null | undefined): TaxProfile {
  switch (taxElection || "sole_prop") {
    case "partnership":
      return {
        taxElection: "partnership",
        activitySectionTitle: "Owner Withdrawals",
        contributionLabel: "Historical owner contributions",
        distributionLabel: "Owner Withdrawals",
        activityDisclaimer: "Owner withdrawals reduce business cash only. They are not income, business expenses, job costs, profit deductions, or tax deductions.",
      };
    case "s_corp":
      return {
        taxElection: "s_corp",
        activitySectionTitle: "Owner Withdrawals",
        contributionLabel: "Historical owner contributions",
        distributionLabel: "Owner Withdrawals",
        activityDisclaimer: "Owner withdrawals reduce business cash only. They are not income, business expenses, job costs, profit deductions, or tax deductions. Officer salaries remain a separate payroll or expense workflow.",
      };
    case "c_corp":
      return {
        taxElection: "c_corp",
        activitySectionTitle: "Owner Withdrawals",
        contributionLabel: "Historical owner contributions",
        distributionLabel: "Owner Withdrawals",
        activityDisclaimer: "Owner withdrawals reduce business cash only. They are not income, business expenses, job costs, profit deductions, or tax deductions. Officer salaries remain a separate payroll or expense workflow.",
      };
    default: // sole_prop
      return {
        taxElection: "sole_prop",
        activitySectionTitle: "Owner Withdrawals",
        contributionLabel: "Historical owner contributions",
        distributionLabel: "Owner Withdrawals",
        activityDisclaimer: "Owner withdrawals reduce business cash only. They are not income, business expenses, job costs, profit deductions, or tax deductions.",
      };
  }
}

// ─── Shared: Tax Estimate Calculation ─────────────────────────────────────────
// All tax formula logic lives in lib/tax-estimate.ts (pure, testable).
// Re-export the types and functions so callers within this file use one import.
export type { TaxEstimate } from "../lib/tax-estimate.js";
export { computeTaxEstimate, getTaxYearData } from "../lib/tax-estimate.js";

// ─── Shared: Owner Waterfall ───────────────────────────────────────────────────
// Mirrors the /reserve-summary waterfall constants.
// revenue → afterSubs → 5% growth fund → 50/50 owner split → 25% tax reserve
const WATERFALL_GROWTH_PCT = 0.05;
const WATERFALL_OWNER_PCT  = 0.50;
const WATERFALL_TAX_PCT    = 0.25;

/**
 * Compute ownerAllocated (owner's cash-basis share of revenue) and ownerTaxReserve
 * (25% of ownerAllocated) for the given year.
 *
 * Attribution: effective payment date (Stripe → Square → issueDate), matching the
 * Accounting and Year-End routes. A December-issued invoice paid in January is
 * attributed to January. The DB fetch has NO date filter; year gating is applied
 * in JS after computing the effective date.
 *
 * ⚠ P&L asymmetry: /profit-loss attributes invoice revenue by issueDate (pre-existing
 * behavior). For invoices that span a year-end boundary the P&L ownerAllocated will
 * therefore differ slightly from the Accounting/Year-End ownerAllocated. Fixing the
 * P&L revenue attribution basis is out of scope for this feature.
 *
 * Jobless invoices (jobId=null): INCLUDED with subLaborCost=0. /reserve-summary
 * excludes them (pre-existing behavior there); the waterfall intentionally includes
 * them so jobless revenue is not silently dropped from the owner's allocation.
 *
 * Sign convention for owner_capital_entries: positive = contribution (cash IN), negative = withdrawal (cash OUT).
 */
async function computeOwnerWaterfall(
  year: number,
  reportBusiness: ReportBusiness | null,
): Promise<{ ownerAllocated: number; ownerTaxReserve: number }> {
  const startDate = `${year}-01-01`;
  const endDate   = `${year}-12-31`;
  const blWhere = (businessLineColumn: any, businessIdColumn?: any) =>
    reportBusinessWhere(reportBusiness, businessLineColumn, businessIdColumn);

  // No date WHERE — JS applies effective-payment-date gating after the fetch.
  const paidInvs = await db.select({
    jobId:        invoicesTable.jobId,
    total:        invoicesTable.total,
    stripePaidAt: invoicesTable.stripePaidAt,
    squarePaidAt: invoicesTable.squarePaidAt,
    issueDate:    invoicesTable.issueDate,
  })
    .from(invoicesTable)
    .where(and(
      eq(invoicesTable.status, "paid"),
      blWhere(invoicesTable.businessLine, invoicesTable.businessId),
    ));

  // Attribute each invoice to a year by effective payment date.
  const yearInvs = paidInvs.filter(i => {
    const effDate = i.stripePaidAt instanceof Date
      ? i.stripePaidAt.toISOString().slice(0, 10)
      : i.squarePaidAt instanceof Date
      ? i.squarePaidAt.toISOString().slice(0, 10)
      : (i.issueDate ?? "");
    return effDate >= startDate && effDate <= endDate;
  });

  // Derive job IDs only from year-attributed invoices.
  const jobIds = [...new Set(yearInvs.map(i => i.jobId).filter((id): id is number => id != null))];
  const hoursCostByJob = new Map<number, number>();
  if (jobIds.length > 0) {
    const subHoursRows = await db.select({
      jobId: jobSubHoursTable.jobId,
      cost: sql<string>`COALESCE(SUM(${jobSubHoursTable.hours} * COALESCE(${jobSubHoursTable.rateSnapshot}, 0)), 0)`,
    })
      .from(jobSubHoursTable)
      .where(inArray(jobSubHoursTable.jobId, jobIds))
      .groupBy(jobSubHoursTable.jobId);
    for (const r of subHoursRows) {
      hoursCostByJob.set(r.jobId, parseFloat(r.cost ?? "0"));
    }
  }

  let ownerAllocated = 0;
  for (const inv of yearInvs) {
    const revenue = parseFloat(inv.total ?? "0");
    const subLaborCost = inv.jobId != null ? (hoursCostByJob.get(inv.jobId) ?? 0) : 0;
    const afterSubs  = Math.max(0, revenue - subLaborCost);
    const growthFund = afterSubs * WATERFALL_GROWTH_PCT;
    const toSplit    = afterSubs - growthFund;
    ownerAllocated  += toSplit * WATERFALL_OWNER_PCT;
  }
  return { ownerAllocated, ownerTaxReserve: ownerAllocated * WATERFALL_TAX_PCT };
}

// ─── Shared: Asset Depreciation for a Tax Year ────────────────────────────────
// Used by /profit-loss and /accounting so every screen derives the same
// depreciation number. calcAnnualDepreciation is a hoisted function declaration
// (defined near the /year-end route below) and is accessible here at runtime.
async function computeDepreciationForYear(
  year: number,
  reportBusiness: ReportBusiness | null = null,
): Promise<number> {
  const [allAssets, allBusUseRows] = await Promise.all([
    db.select().from(assetsTable),
    db.select().from(assetBusinessUseTable),
  ]);
  const assets = reportBusiness
    ? allAssets.filter(asset => asset.businessId === reportBusiness.id)
    : allAssets;
  const assetIds = new Set(assets.map(asset => asset.id));
  const busUseRows = reportBusiness
    ? allBusUseRows.filter(row => assetIds.has(row.assetId))
    : allBusUseRows;
  const busUseMap = new Map<number, Map<number, number>>();
  for (const row of busUseRows) {
    if (!busUseMap.has(row.assetId)) busUseMap.set(row.assetId, new Map());
    busUseMap.get(row.assetId)!.set(row.year, row.businessUsePct);
  }
  const getDisposalYear = (a: typeof assets[number]): number | null => {
    if ((a.status === "sold" || a.status === "retired") && a.saleDate)
      return parseInt(a.saleDate.slice(0, 4));
    return null;
  };
  return assets
    .filter(a => { const dy = getDisposalYear(a); return dy === null || dy >= year; })
    .reduce((sum, a) => {
      const busUsePct = busUseMap.get(a.id)?.get(year) ?? 100;
      return sum + calcAnnualDepreciation(a, year) * (busUsePct / 100);
    }, 0);
}

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
    const rawYear = req.query.year == null ? new Date().getFullYear() : Number(req.query.year);
    if (!Number.isInteger(rawYear) || rawYear < 2000 || rawYear > 2200) return res.status(400).json({ error: "A valid tax year is required" });
    const year = rawYear;
    const reportBusiness = await resolveReportBusiness(req.query.businessLine, undefined, res);
    if (reportBusiness === undefined) return;
    const blFilter = reportBusiness?.slug ?? null;
    const startDate = `${year}-01-01`;
    const endDate   = `${year}-12-31`;
    const blWhere = (businessLineColumn: any, businessIdColumn?: any) =>
      reportBusinessWhere(reportBusiness ?? null, businessLineColumn, businessIdColumn);
    const mileageWhere = reportBusiness ? eq(mileageLogsTable.businessId, reportBusiness.id) : undefined;

    const [invRows, expRows, mileRows, otherRows, plSubPayRows] = await Promise.all([
       db.select({ status: invoicesTable.status, total: invoicesTable.total, issueDate: invoicesTable.issueDate, stripePaidAt: invoicesTable.stripePaidAt, squarePaidAt: invoicesTable.squarePaidAt })
        .from(invoicesTable)
         .where(and(eq(invoicesTable.status, "paid"), blWhere(invoicesTable.businessLine, invoicesTable.businessId))),
      db.select({
        category: expensesTable.category,
        amount: expensesTable.amount,
        description: expensesTable.description,
        excludeFromNetProfit: expensesTable.excludeFromNetProfit,
        isWageAdvance: expensesTable.isWageAdvance,
      })
        .from(expensesTable)
        .where(and(gte(expensesTable.date, startDate), lte(expensesTable.date, endDate), ne(expensesTable.category, "mileage"), blWhere(expensesTable.businessLine, expensesTable.businessId), isNull(expensesTable.voidedAt))),
      // subcontractorId IS NULL: owner vehicle mileage only — excludes sub-portal tracking logs.
      db.select({ miles: mileageLogsTable.miles, classification: mileageLogsTable.classification, date: mileageLogsTable.date })
        .from(mileageLogsTable)
        .where(and(eq(mileageLogsTable.classification, "business"), isNull(mileageLogsTable.subcontractorId), isNull(mileageLogsTable.voidedAt), gte(mileageLogsTable.date, startDate), lte(mileageLogsTable.date, endDate), mileageWhere)),
      db.select({ amount: otherIncomeTable.amount })
        .from(otherIncomeTable)
        .where(and(gte(otherIncomeTable.date, startDate), lte(otherIncomeTable.date, endDate), blWhere(otherIncomeTable.businessLine, otherIncomeTable.businessId), isNull(otherIncomeTable.voidedAt))),
      // Fixed/allocation sub payments — cash-basis cash out. Hourly subs already have
      // auto-expense records (jobSubHoursId IS NOT NULL), so we only add fixed/allocation here
      // to avoid double-counting.
      db.select({ amount: sql<string>`${subPaymentRecordsTable.amount} + COALESCE(${subPaymentRecordsTable.advanceAmount}, 0)` })
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
        )),
    ]);

    // Outstanding sub liability — all comp types with unpaid/partial status.
    // For fixed/allocation subs: amount comes from amountOwed or fixedAmount.
    // For hourly subs:           amount is aggregated from job_sub_hours × rate_snapshot
    //                            (same as the Sub Balances screen), then reduced by amountPaid.
    const outstandingSubRows = await db.select({
      subName: subcontractorsTable.name,
      jobTitle: jobsTable.title,
      jobId: jobSubcontractorsTable.jobId,
      subcontractorId: jobSubcontractorsTable.subcontractorId,
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
        inArray(jobSubcontractorsTable.compensationType, ["fixed", "allocation", "hourly"]),
        blFilter ? eq(jobsTable.businessLine, blFilter) : undefined,
      ));

    // For hourly subs, compute owed from hours × rate_snapshot in job_sub_hours.
    // This mirrors the Sub Balances screen so both surfaces show the same liability.
    const hourlySubRows = outstandingSubRows.filter(r => r.compensationType === "hourly" && r.jobId != null && r.subcontractorId != null);
    const hourlyHoursMap = new Map<string, number>();
    if (hourlySubRows.length > 0) {
      const hourlyJobIds = [...new Set(hourlySubRows.map(r => r.jobId as number))];
      const hourlySubIds = [...new Set(hourlySubRows.map(r => r.subcontractorId as number))];
      const hoursCostRows = await db.select({
        jobId: jobSubHoursTable.jobId,
        subcontractorId: jobSubHoursTable.subcontractorId,
        cost: sql<string>`COALESCE(SUM(${jobSubHoursTable.hours} * COALESCE(${jobSubHoursTable.rateSnapshot}, 0)), 0)`,
      })
        .from(jobSubHoursTable)
        .where(and(
          inArray(jobSubHoursTable.jobId, hourlyJobIds),
          inArray(jobSubHoursTable.subcontractorId, hourlySubIds),
        ))
        .groupBy(jobSubHoursTable.jobId, jobSubHoursTable.subcontractorId);
      for (const row of hoursCostRows) {
        hourlyHoursMap.set(`${row.jobId}:${row.subcontractorId}`, parseFloat(row.cost));
      }
    }

    const outstandingSubItems = outstandingSubRows.map(r => {
      let fullOwed: number | null;
      if (r.amountOwed != null) {
        fullOwed = parseFloat(r.amountOwed);
      } else if (r.compensationType === "hourly" && r.jobId != null && r.subcontractorId != null) {
        fullOwed = hourlyHoursMap.get(`${r.jobId}:${r.subcontractorId}`) ?? null;
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
      };
    // Only show rows with a real positive balance — skip $0 and uncomputable entries
    }).filter(i => i.amount != null && !Number.isNaN(i.amount) && i.amount > 0);
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

    const grossReceipts = sumCashReceipts(invRows, startDate, endDate);
    const otherIncome   = otherRows.reduce((s, o) => s + parseFloat(o.amount ?? "0"), 0);
    const grossRevenue  = grossReceipts + otherIncome;

    // Cash-basis: exclude outstanding cost-booking rows before categorising.
    // These are accrual-style bookings (description ending in "(outstanding)") — the sub has NOT
    // been paid. The actual cash payment appears in plSubPayRows from sub_payment_records.
    // Also exclude wage-advance expenses (isWageAdvance=true): pre-payments of hourly wages
    // already fully captured in jsh auto-expense accruals — counting them would double the cost.
    // This mirrors the isWageAdvance filter applied in the Accounting, Dashboard, and Year-End routes.
    const plExpRows = expRows.filter(e =>
      !(e.description ?? "").endsWith("(outstanding)") && !e.isWageAdvance,
    );

    // All expenses count toward P&L categories (excludeFromNetProfit only affects job panels).
    // Owner distributions are excluded: they are equity distributions, not deductible expenses.
    // Covers "Owner Draw" (legacy), "Owner Compensation" (current), "Owner Withdrawal" (equity).
    const buckets: Record<string, number> = {};
    let legacyOwnerDrawTotal = 0;
    for (const e of plExpRows) {
      const cat = e.category || "Other";
      if (isOwnerWithdrawalExpenseCategory(cat)) {
        legacyOwnerDrawTotal += parseFloat(e.amount ?? "0");
        continue;
      }
      const key = PL_CATEGORY_MAP[cat] ?? "other";
      buckets[key] = (buckets[key] ?? 0) + parseFloat(e.amount ?? "0");
    }

    // Fixed/allocation sub payments from pay-worker: Contract Labor.
    // These live only in sub_payment_records after Task #892, so we add them here separately.
    // IMPORTANT: these are subcontractor payments, NOT materials/COGS — a service contractor
    // has no COGS. The forensic audit (Aug 2026) confirmed there are zero "Materials" expense
    // rows; the $9,628.47 that was incorrectly showing as COGS was James Willard's allocation
    // sub payments. Tax classification (subcontractor vs owner distribution) is the owner's
    // decision and must not be decided here — preserve the amounts, fix the label only.
    const plSubPayTotal = plSubPayRows.reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
    if (plSubPayTotal > 0) {
      buckets["contractLabor"] = (buckets["contractLabor"] ?? 0) + plSubPayTotal;
    }

    const cogs = buckets["cogs"] ?? 0;
    const grossProfit = grossRevenue - cogs;

    const operatingExpenses: { label: string; key: string; amount: number }[] = [];
    for (const [key, label] of Object.entries(PL_OPEX_LABELS)) {
      operatingExpenses.push({ label, key, amount: buckets[key] ?? 0 });
    }

    const totalOperatingExpenses = operatingExpenses.reduce((s, x) => s + x.amount, 0);
    const netOperatingIncome = grossProfit - totalOperatingExpenses;

    const mileageSummary = summarizeMileageRecords(mileRows);
    const totalMiles = mileageSummary.totalMiles;
    const mileageDeduction = mileageSummary.totalDeduction;
    const mileageRate = mileageSummary.ratePerMile;

    // Fetch depreciation, owner contributions, settings, and owner waterfall in parallel.
    // Mock-queue slot order (synchronous chain evaluation order matters):
    //   computeDepreciationForYear fires its inner Promise.all first → [assets, busUseRows]
    //   computeOwnerWaterfall fires its first await synchronously before the outer
    //   Promise.all calls .then() on the direct chains → [waterfallPaidInvs]
    //   then the outer Promise.all calls .then() on the two direct chains → [ownerContribRows, settingsRows]
    // Final order: [7] assets, [8] busUseRows, [9] waterfallPaidInvs, [10] ownerContribRows, [11] settingsRows
    const [depreciationDeduction, ownerContribRows, settingsRows, plWaterfall] = await Promise.all([
      computeDepreciationForYear(year, reportBusiness ?? null),
      db.select({ amount: ownerCapitalEntriesTable.amount })
        .from(ownerCapitalEntriesTable)
        .where(and(
          gte(ownerCapitalEntriesTable.date, startDate),
          lte(ownerCapitalEntriesTable.date, endDate),
          isNull(ownerCapitalEntriesTable.voidedAt),
          reportBusiness ? eq(ownerCapitalEntriesTable.businessId, reportBusiness.id) : undefined,
        )),
      db.select({ federalTaxElection: settingsTable.federalTaxElection })
        .from(settingsTable)
        .limit(1),
      computeOwnerWaterfall(year, reportBusiness ?? null),
    ]);
    // Sign convention: positive owner_capital_entries = contributions (cash into business).
    const ownerContributionsTotal = ownerContribRows.reduce((s, r) => {
      const amt = parseFloat(r.amount ?? "0");
      return s + (amt > 0 ? amt : 0);
    }, 0);
    const canonicalOwnerDrawTotal = ownerContribRows.reduce((sum, row) => {
      const amount = parseFloat(row.amount ?? "0");
      return sum + (amount < 0 ? Math.abs(amount) : 0);
    }, 0);
    const ownerDrawTotal = canonicalOwnerDrawTotal > 0 ? canonicalOwnerDrawTotal : legacyOwnerDrawTotal;
    const netProfit = netOperatingIncome - mileageDeduction - depreciationDeduction;
    const taxProfile = getTaxProfile(settingsRows[0]?.federalTaxElection);

    // Owner activity waterfall fields.
    // ownerCashTaken = owner draws recorded as expenses (cash withdrawn from business).
    // ownerRetained  = owner's allocated share remaining after tax reserve and withdrawals.
    // ownerOverWithdrawal > 0 means owner took more than their after-tax allocation.
    const { ownerAllocated: plOwnerAllocated, ownerTaxReserve: plOwnerTaxReserve } = plWaterfall;
    const plOwnerCashTaken = ownerDrawTotal;
    const plOwnerRetained = Math.max(0, plOwnerAllocated - plOwnerTaxReserve - plOwnerCashTaken);
    const plOwnerOverWithdrawal = Math.max(0, plOwnerCashTaken - (plOwnerAllocated - plOwnerTaxReserve));

    res.json({
      year,
      revenue: { grossReceipts, otherIncome, grossRevenue },
      cogs: { materials: cogs, total: cogs },
      grossProfit,
      operatingExpenses,
      totalOperatingExpenses,
      netOperatingIncome,
      deductions: { mileageDeduction, totalMiles, mileageRate, ratePeriods: mileageSummary.ratePeriods, depreciationDeduction },
      netProfit,
      taxProfile,
      ownerActivity: {
        ownerDrawTotal,
        ownerContributionsTotal,
        ownerAllocated: plOwnerAllocated,
        ownerTaxReserve: plOwnerTaxReserve,
        ownerCashTaken: plOwnerCashTaken,
        ownerRetained: plOwnerRetained,
        ownerOverWithdrawal: plOwnerOverWithdrawal,
      },
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
    const rawYear = req.query.year == null ? new Date().getFullYear() : Number(req.query.year);
    if (!Number.isInteger(rawYear) || rawYear < 2000 || rawYear > 2200) return res.status(400).json({ error: "A valid tax year is required" });
    const year = rawYear;
    const reportBusiness = await resolveReportBusiness(req.query.businessLine, undefined, res);
    if (reportBusiness === undefined) return;
    const blFilter = reportBusiness?.slug ?? null;
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    const blWhere = (businessLineColumn: any, businessIdColumn?: any) =>
      reportBusinessWhere(reportBusiness ?? null, businessLineColumn, businessIdColumn);
    const mileageWhere = reportBusiness ? eq(mileageLogsTable.businessId, reportBusiness.id) : undefined;

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
      fixedAllocSubPayments,
    ] = await Promise.all([
      db.select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        status: invoicesTable.status,
        issueDate: invoicesTable.issueDate,
        total: invoicesTable.total,
        amountPaid: invoicesTable.amountPaid,
        subtotal: invoicesTable.subtotal,
        clientName: clientsTable.name,
        city: invoicesTable.city,
        state: invoicesTable.state,
        stripePaidAt: invoicesTable.stripePaidAt,
        squarePaidAt: invoicesTable.squarePaidAt,
        lastManualPaidAt: invoicesTable.lastManualPaidAt,
      })
        .from(invoicesTable)
        .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
        .where(and(eq(invoicesTable.status, "paid"), blWhere(invoicesTable.businessLine, invoicesTable.businessId))),
      db.select().from(expensesTable)
        .where(and(gte(expensesTable.date, startDate), lte(expensesTable.date, endDate), blWhere(expensesTable.businessLine, expensesTable.businessId), isNull(expensesTable.voidedAt))),
      // subcontractorId IS NULL: owner vehicle mileage only — excludes sub-portal tracking logs.
      db.select().from(mileageLogsTable)
        .where(and(gte(mileageLogsTable.date, startDate), lte(mileageLogsTable.date, endDate), eq(mileageLogsTable.classification, "business"), isNull(mileageLogsTable.subcontractorId), isNull(mileageLogsTable.voidedAt), mileageWhere)),
      db.select().from(otherIncomeTable)
        .where(and(gte(otherIncomeTable.date, startDate), lte(otherIncomeTable.date, endDate), blWhere(otherIncomeTable.businessLine, otherIncomeTable.businessId), isNull(otherIncomeTable.voidedAt))),
      db.select().from(assetsTable)
        .where(reportBusiness ? eq(assetsTable.businessId, reportBusiness.id) : undefined),
      db.select().from(estimatedTaxPaymentsTable)
        .where(and(
          eq(estimatedTaxPaymentsTable.year, year),
          reportBusiness ? eq(estimatedTaxPaymentsTable.businessId, reportBusiness.id) : undefined,
        )),
      db.select().from(subcontractorsTable),
      db.select().from(settingsTable).limit(1),
      db.select().from(assetBusinessUseTable),
      // Fixed/allocation sub payments from pay-worker (not in expenses after Task #892).
      // Hourly sub payments already have auto-expense records (jobSubHoursId IS NOT NULL),
      // so we intentionally exclude compensationType='hourly' to avoid double-counting.
      db.select({
        id: subPaymentRecordsTable.id,
        jobId: subPaymentRecordsTable.jobId,
        amount: sql<string>`${subPaymentRecordsTable.amount} + COALESCE(${subPaymentRecordsTable.advanceAmount}, 0)`,
        paymentDate: subPaymentRecordsTable.paymentDate,
        description: subPaymentRecordsTable.description,
        subcontractorId: subPaymentRecordsTable.subcontractorId,
      })
        .from(subPaymentRecordsTable)
        .innerJoin(
          jobSubcontractorsTable,
          and(
            eq(jobSubcontractorsTable.jobId, subPaymentRecordsTable.jobId),
            eq(jobSubcontractorsTable.subcontractorId, subPaymentRecordsTable.subcontractorId),
          )
        )
        .where(and(
          gte(subPaymentRecordsTable.paymentDate, startDate),
          lte(subPaymentRecordsTable.paymentDate, endDate),
          sql`${subPaymentRecordsTable.isReversal} IS NOT TRUE`,
          inArray(jobSubcontractorsTable.compensationType, ["fixed", "allocation"]),
          blWhere(subPaymentRecordsTable.businessLine),
        )),
    ]);

    // Assets are business-scoped above; only attach usage records belonging to those assets.
    const reportAssetIds = new Set(assets.map(asset => asset.id));
    const scopedBusUseRows = reportBusiness
      ? busUseRows.filter(row => reportAssetIds.has(row.assetId))
      : busUseRows;
    // Build lookup: assetId → year → businessUsePct
    const busUseMap = new Map<number, Map<number, number>>();
    for (const row of scopedBusUseRows) {
      if (!busUseMap.has(row.assetId)) busUseMap.set(row.assetId, new Map());
      busUseMap.get(row.assetId)!.set(row.year, row.businessUsePct);
    }
    const getBusUsePct = (assetId: number, forYear: number): number => {
      return busUseMap.get(assetId)?.get(forYear) ?? 100;
    };

    // ── P&L Summary ──────────────────────────────────────────────────────────
    // Cash-basis: use electronic payment timestamps when available; fall back to issueDate for manual payments
     const paidInvoices = filterCashReceipts(invoices, startDate, endDate);
    const grossReceipts = sumCashReceipts(paidInvoices, startDate, endDate);
    const otherIncomeTotal = otherIncomeRows.reduce((s, o) => s + parseFloat(o.amount ?? "0"), 0);
    const totalRevenue = grossReceipts + otherIncomeTotal;

    // Owner distributions are personal — not Schedule C deductions.
    // Exclude all three variants so totalExpenses matches the expensesBySchedC breakdown total.
    //
    // Cash-basis Schedule C rule for fixed/allocation subs:
    // The "Complete Job & Keep As Outstanding" flow (record-sub-expenses) creates cost-booking
    // expense rows with descriptions ending in "(outstanding)". These are accrual-style bookings —
    // the sub has not been paid yet. Under cash-basis accounting (Schedule C), deductions are
    // recognised when the payment is made, not when the obligation is incurred.
    // Therefore we unconditionally exclude outstanding-cost-booking rows from Schedule C.
    // When pay-worker later records payment, that payment appears in sub_payment_records and is
    // picked up below — in the same year it was actually paid, whether or not the cost-booking
    // row was in a prior year. This avoids any cross-year double-count without year-range
    // cross-referencing.
    const isOutstandingCostBooking = (e: typeof expenses[number]) =>
      (e.description ?? "").endsWith("(outstanding)");

    // Exclude wage-advance expenses (isWageAdvance=true): pre-payments of hourly wages
    // already fully captured in jsh auto-expense accruals — counting them would double the cost.
    const nonMileageExpenses = expenses.filter(e =>
      e.category !== "mileage" &&
      !isOwnerWithdrawalExpenseCategory(e.category) &&
      !isOutstandingCostBooking(e) &&
      !e.isWageAdvance
    );
    // LEDGER INVARIANT: pay-worker payments are represented exactly once. Fixed/allocation
    // payments live only in sub_payment_records (not expenses) after the ledger migration;
    // hourly payments are represented by their jobSubHours-linked auto-expense. There is
    // currently no FK from expenses to sub_payment_records, so do not add a second write
    // path without also adding an explicit source link/flag and excluding linked expenses
    // here. Otherwise a Schedule C payment would be silently counted twice.
    const fixedAllocSubPaymentTotal = fixedAllocSubPayments.reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
    const totalExpenses = nonMileageExpenses.reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0) + fixedAllocSubPaymentTotal;

    const mileageSummary = summarizeMileageRecords(mileageLogs);
    const totalMiles = mileageSummary.totalMiles;
    const mileageDeduction = mileageSummary.totalDeduction;
    const mileageRate = mileageSummary.ratePerMile;

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
      // Owner distributions are personal — never a Schedule C deduction.
      if (isOwnerWithdrawalExpenseCategory(e.category)) continue;
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
    // Inject fixed/allocation sub payments under Contract Labor. This is the only
    // Schedule C representation for those pay-worker payments; hourly payments stay
    // in the expenses loop through their jobSubHours-linked auto-expense. Keep this
    // paired with the ledger invariant above if either write path changes.
    // Hourly sub payments are excluded — their auto-expense records (jobSubHoursId IS NOT NULL)
    // are already in the expenses loop above, so including them here would double-count.
    const CONTRACT_LABOR_LINE = "Line 11 – Contract Labor";
    const subLookup = new Map(subs.map(s => [s.id, s.name]));
    for (const spr of fixedAllocSubPayments) {
      const existing = catMap.get(CONTRACT_LABOR_LINE) ?? { schedCLine: CONTRACT_LABOR_LINE, amount: 0, count: 0, items: [] };
      const amt = parseFloat(spr.amount ?? "0");
      existing.amount += amt;
      existing.count++;
      existing.items.push({
        date: spr.paymentDate,
        description: spr.description ?? "Subcontractor payment",
        vendor: subLookup.get(spr.subcontractorId) ?? null,
        amount: amt,
      });
      catMap.set(CONTRACT_LABOR_LINE, existing);
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
      const ytd = await computeYtd(s.id, year, blFilter);
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

    // Owensboro gross for OCC: paid invoices + other income with city = owensboro.
    // Uses only paid receipts (cash-basis, consistent with the rest of this endpoint).
    const yeOwensboroGross =
      paidInvoices
        .filter(i => (i.city ?? "").trim().toLowerCase() === "owensboro")
        .reduce((s, i) => s + parseFloat(i.total ?? "0"), 0)
      + otherIncomeRows
        .filter(o => (o.city ?? "").trim().toLowerCase() === "owensboro")
        .reduce((s, o) => s + parseFloat(o.amount ?? "0"), 0);

    // Use shared helper — year-appropriate progressive brackets; OCC now included.
    const yeTaxEst = computeTaxEstimate(netProfit, yeOwensboroGross, year);
    const selfEmploymentTax = yeTaxEst.federalSE;
    const seDeduction = yeTaxEst.seDeduction;
    const federalIncomeTax = yeTaxEst.federalIncome;
    const kyStateTax = yeTaxEst.kyState;
    const owensboroOccTax = yeTaxEst.occ;
    const totalEstimatedTaxLiability = yeTaxEst.total;

    // ── Owner Activity ──────────────────────────────────────────────────────────
    // Owner draws are excluded from nonMileageExpenses; compute from raw expenses array.
    // Fetch contributions + waterfall in parallel (adds slots after all existing year-end queries).
    const [yeOwnerContribRows, yeWaterfall] = await Promise.all([
      db.select({ amount: ownerCapitalEntriesTable.amount })
        .from(ownerCapitalEntriesTable)
        .where(and(
          gte(ownerCapitalEntriesTable.date, startDate),
          lte(ownerCapitalEntriesTable.date, endDate),
          isNull(ownerCapitalEntriesTable.voidedAt),
          reportBusiness ? eq(ownerCapitalEntriesTable.businessId, reportBusiness.id) : undefined,
        )),
      computeOwnerWaterfall(year, reportBusiness ?? null),
    ]);
    // Sign convention: positive entries = capital contributions (cash in).
    const yeOwnerContributionsTotal = yeOwnerContribRows.reduce((s, r) => {
      const amt = parseFloat(r.amount ?? "0");
      return s + (amt > 0 ? amt : 0);
    }, 0);
    const canonicalYeOwnerDrawTotal = yeOwnerContribRows.reduce((sum, row) => {
      const amount = parseFloat(row.amount ?? "0");
      return sum + (amount < 0 ? Math.abs(amount) : 0);
    }, 0);
    const legacyYeOwnerDrawTotal = expenses
      .filter(e => isOwnerWithdrawalExpenseCategory(e.category))
      .reduce((sum, e) => sum + parseFloat(e.amount ?? "0"), 0);
    const yeOwnerDrawTotal = canonicalYeOwnerDrawTotal > 0 ? canonicalYeOwnerDrawTotal : legacyYeOwnerDrawTotal;
    const yeOwnerCashTaken = yeOwnerDrawTotal;
    const yeOwnerRetained = Math.max(0, yeWaterfall.ownerAllocated - yeWaterfall.ownerTaxReserve - yeOwnerCashTaken);
    const yeOwnerOverWithdrawal = Math.max(0, yeOwnerCashTaken - (yeWaterfall.ownerAllocated - yeWaterfall.ownerTaxReserve));

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
        ratePeriods: mileageSummary.ratePeriods,
        totalMiles,
        totalDepreciation,
        netProfit,
      },
      taxEstimates: {
        selfEmploymentTax,
        federalIncomeTax,
        kyStateTax,
        owensboroOccTax,
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
        ratePeriods: mileageSummary.ratePeriods,
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
      ownerActivity: {
        ownerDrawTotal: yeOwnerDrawTotal,
        ownerContributionsTotal: yeOwnerContributionsTotal,
        ownerAllocated: yeWaterfall.ownerAllocated,
        ownerTaxReserve: yeWaterfall.ownerTaxReserve,
        ownerCashTaken: yeOwnerCashTaken,
        ownerRetained: yeOwnerRetained,
        ownerOverWithdrawal: yeOwnerOverWithdrawal,
      },
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

// ─── Business Reserve Dashboard ──────────────────────────────────────────────
// Single source of truth for all cash planning throughout the application.
// Any feature needing Required Reserve, Available to Spend, Reserve Health, or
// Business Cash Position must consume this endpoint rather than reimplementing.
router.get("/business-reserve", sectionGuard("jobs"), async (req, res) => {
  try {
    const year = new Date().getFullYear();
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const GROWTH_PCT = 0.05;
    const OWNER_PCT = 0.50;

    // 1. Settings for rates and reserve preferences
    const [settings] = await db.select().from(settingsTable).limit(1);
    const operatingReserveMode = settings?.operatingReserveMode ?? "0";
    const operatingReserveCustom = settings?.operatingReserveCustom != null ? parseFloat(String(settings.operatingReserveCustom)) : null;
    const includeGrowthFund = settings?.includeGrowthFundInReserve === 1;

    // 2. Growth fund YTD + data needed for estimated taxes
    // Invoice fetch is split: paid invoices have no issueDate filter so a Dec-issued invoice
    // paid in Jan is attributed to January via the shared cash-revenue helper below.
    // Non-paid (sent/overdue) invoices remain issueDate-bounded to keep period counts correct.
    const brInvoiceCols = {
      id: invoicesTable.id,
      jobId: invoicesTable.jobId,
      total: invoicesTable.total,
      status: invoicesTable.status,
      issueDate: invoicesTable.issueDate,
      stripePaidAt: invoicesTable.stripePaidAt,
      squarePaidAt: invoicesTable.squarePaidAt,
      invoiceCity: invoicesTable.city,
      jobCity: jobsTable.city,
    };
    const [brPaidInvoices, brNonPaidInvoices, expenses, mileageLogs, otherIncomeRows, brSubPayRows] = await Promise.all([
      // Paid invoices: no issueDate filter — JS gates revenue to the correct year via payment date
      db.select(brInvoiceCols).from(invoicesTable)
        .leftJoin(jobsTable, eq(invoicesTable.jobId, jobsTable.id))
        .where(eq(invoicesTable.status, "paid")),
      // Non-paid, non-draft: issueDate-bounded so display counts remain year-specific
      db.select(brInvoiceCols).from(invoicesTable)
        .leftJoin(jobsTable, eq(invoicesTable.jobId, jobsTable.id))
        .where(and(ne(invoicesTable.status, "paid"), ne(invoicesTable.status, "draft"), gte(invoicesTable.issueDate, startDate), lte(invoicesTable.issueDate, endDate))),
      db.select().from(expensesTable).where(and(gte(expensesTable.date, startDate), lte(expensesTable.date, endDate), isNull(expensesTable.voidedAt))),
      // subcontractorId IS NULL: owner vehicle mileage only — excludes sub-portal tracking logs.
      db.select().from(mileageLogsTable).where(and(gte(mileageLogsTable.date, startDate), lte(mileageLogsTable.date, endDate), isNull(mileageLogsTable.subcontractorId), isNull(mileageLogsTable.voidedAt))),
      db.select().from(otherIncomeTable).where(and(gte(otherIncomeTable.date, startDate), lte(otherIncomeTable.date, endDate), isNull(otherIncomeTable.voidedAt))),
      // Fixed/allocation sub payments — authoritative cash-basis cost that accounting uses but
      // the reserve route was previously omitting, causing Reserve to show $9,628.47 higher
      // net profit than Accounting and generating phantom SE tax on an accounting loss.
      db.select({ amount: sql<string>`${subPaymentRecordsTable.amount} + COALESCE(${subPaymentRecordsTable.advanceAmount}, 0)` })
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
        )),
    ]);
    // Pre-filter paid invoices to effective payment date within the selected year so
    // owensboroGross, growth fund accumulation, and all other aggregates only count
    // revenue from this year — no individual payment-date guards needed.
    const invoices = [
       ...filterCashReceipts(brPaidInvoices, startDate, endDate),
      ...brNonPaidInvoices,
    ];

    const jobIds = [...new Set(invoices.map(i => i.jobId).filter((id): id is number => id != null))];
    let growthFundAccumulated = 0;
    if (jobIds.length > 0) {
      const subHoursRows = await db.select({
        jobId: jobSubHoursTable.jobId,
        cost: sql<string>`COALESCE(SUM(${jobSubHoursTable.hours} * COALESCE(${jobSubHoursTable.rateSnapshot}, 0)), 0)`,
      }).from(jobSubHoursTable).where(inArray(jobSubHoursTable.jobId, jobIds)).groupBy(jobSubHoursTable.jobId);
      const hoursCostByJob = new Map(subHoursRows.map(r => [r.jobId, parseFloat(r.cost ?? "0")]));
      for (const inv of invoices) {
        if (!inv.jobId || inv.status !== "paid") continue;
        const revenue = parseFloat(inv.total ?? "0");
        const subLaborCost = hoursCostByJob.get(inv.jobId) ?? 0;
        const afterSubs = Math.max(0, revenue - subLaborCost);
        growthFundAccumulated += afterSubs * GROWTH_PCT;
      }
    }

    // Compute YTD net profit (matches accounting route logic) for estimated taxes.
    // Cash-basis: use effective payment date so revenue matches the year-end tax report.
    const invoicePaidRevenue = sumCashReceipts(invoices, startDate, endDate);
    const otherIncomeSum = otherIncomeRows.reduce((s, o) => s + parseFloat(o.amount ?? "0"), 0);
    const paidRevenue = invoicePaidRevenue + otherIncomeSum;
    // Exclude wage-advance expenses (isWageAdvance=true) to match the Accounting route.
    const nonMileageExpenses = expenses.filter(e => e.category !== "mileage" && !e.isWageAdvance);
    // Fixed/allocation sub payments are NOT in the expenses table (Task #892 removed that
    // dual-write). Add them separately so the reserve net-profit matches the accounting route.
    const brSubPayTotal = brSubPayRows.reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
    const totalExpenses = nonMileageExpenses.reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0) + brSubPayTotal;
    // subcontractorId == null: owner mileage only — belt-and-suspenders in JS to match DB filter.
    const businessMileageDeduction = summarizeMileageRecords(
      mileageLogs.filter(m => m.subcontractorId == null),
    ).totalDeduction;
    const depreciationDeduction = await computeDepreciationForYear(year);
    const netProfit = paidRevenue - totalExpenses - businessMileageDeduction - depreciationDeduction;

    // Owensboro gross for OCC tax — invoices + other income rows with city = owensboro
    const owensboroGross = invoices
      .filter(i => (i.invoiceCity || i.jobCity || "").trim().toLowerCase() === "owensboro")
      .reduce((s, i) => s + parseFloat(i.total ?? "0"), 0)
      + otherIncomeRows
        .filter(o => (o.city ?? "").trim().toLowerCase() === "owensboro")
        .reduce((s, o) => s + parseFloat(o.amount ?? "0"), 0);

    // Estimated tax breakdown — uses shared helper; federal income not yet included
    // in required reserve total (that addition is handled by Task #1872).
    const brTaxEst = computeTaxEstimate(netProfit, owensboroGross, year);
    const estimatedTaxes = brTaxEst.total;
    const taxBreakdown = { federalSE: brTaxEst.federalSE, federalIncome: brTaxEst.federalIncome, kyState: brTaxEst.kyState, occ: brTaxEst.occ };

    // 3. Growth fund invested this year → available balance
    const deployments = await db.select({ amount: growthFundDeploymentsTable.amount })
      .from(growthFundDeploymentsTable)
      .where(and(gte(growthFundDeploymentsTable.date, startDate), lte(growthFundDeploymentsTable.date, endDate)));
    const totalInvested = deployments.reduce((s, d) => s + parseFloat(d.amount ?? "0"), 0);
    const growthFundAvailable = Math.max(0, growthFundAccumulated - totalInvested);

    // 4. Recurring expenses: annual equivalent of all active templates
    const recurringRows = await db.select().from(recurringExpensesTable).where(eq(recurringExpensesTable.active, true));

    function toMonthlyAmount(amount: number, frequency: string): number {
      switch (frequency) {
        case "weekly": return amount * 52 / 12;
        case "biweekly": return amount * 26 / 12;
        case "monthly": return amount;
        case "quarterly": return amount / 3;
        case "yearly": return amount / 12;
        default: return amount;
      }
    }
    const monthlyRecurring = recurringRows.reduce((s, r) => s + toMonthlyAmount(parseFloat(r.amount ?? "0"), r.frequency), 0);
    const annualOverhead = monthlyRecurring * 12;

    // 5. Operating reserve from settings
    let operatingReserve = 0;
    if (operatingReserveMode === "custom") {
      operatingReserve = operatingReserveCustom ?? 0;
    } else {
      const months = parseInt(operatingReserveMode) || 0;
      operatingReserve = months * monthlyRecurring;
    }

    // 6. Required reserve total
    const requiredReserve = estimatedTaxes + annualOverhead + operatingReserve + (includeGrowthFund ? growthFundAvailable : 0);

    // 7. Plaid checking balance (from cache)
    const plaidConns = await db.select().from(plaidConnectionsTable).limit(1);
    const plaidConnected = plaidConns.length > 0;
    let checkingBalance: number | null = null;
    let balanceCachedAt: string | null = null;
    let balanceStaleDays: number | null = null;
    let balanceIsStale = false;
    if (plaidConnected && plaidConns[0].cachedBalanceCurrent != null) {
      checkingBalance = parseFloat(plaidConns[0].cachedBalanceCurrent);
      balanceCachedAt = plaidConns[0].balanceCachedAt ? plaidConns[0].balanceCachedAt.toISOString() : null;
      balanceStaleDays = balanceCachedAt
        ? Math.floor((Date.now() - new Date(balanceCachedAt).getTime()) / (1000 * 60 * 60 * 24))
        : null;
      // Stale when balance is older than 24 hours — Plaid sync does not auto-refresh it
      balanceIsStale = balanceCachedAt
        ? (Date.now() - new Date(balanceCachedAt).getTime()) > 24 * 60 * 60 * 1000
        : false;
    }

    // 8. Available to spend + health
    const availableToSpend = checkingBalance != null ? checkingBalance - requiredReserve : null;
    let reserveHealth: "funded" | "low" | "below" | null = null;
    if (checkingBalance != null) {
      if (checkingBalance >= requiredReserve) reserveHealth = "funded";
      else if (checkingBalance >= requiredReserve * 0.8) reserveHealth = "low";
      else reserveHealth = "below";
    }

    // 9. Overhead coverage: how many days/months the overhead-portion of reserve covers
    const overheadReserve = annualOverhead + operatingReserve;
    const overheadCoverageDays = monthlyRecurring > 0 ? Math.round(overheadReserve / (monthlyRecurring / 30)) : null;
    const overheadCoverageMonths = monthlyRecurring > 0 ? Math.round((overheadReserve / monthlyRecurring) * 10) / 10 : null;

    res.json({
      estimatedTaxes,
      taxBreakdown,
      growthFundAvailable,
      balanceCachedAt,
      balanceStaleDays,
      balanceIsStale,
      growthFundIncluded: includeGrowthFund,
      annualOverhead,
      monthlyRecurring,
      operatingReserve,
      operatingReserveMode,
      operatingReserveCustom,
      requiredReserve,
      checkingBalance,
      availableToSpend,
      reserveHealth,
      overheadCoverageDays,
      overheadCoverageMonths,
      plaidConnected,
    });
  } catch (err) {
    console.error("[business-reserve]", err);
    res.status(500).json({ error: "Failed to compute business reserve" });
  }
});

// ─── My Pay Summary: running balance of what the business owes the owner ─────
router.get("/owner-pay-summary", sectionGuard("invoices"), async (req, res) => {
  try {
    const rawBusinessId = String(req.query.businessId ?? "").trim();
    const businessId = rawBusinessId ? Number.parseInt(rawBusinessId, 10) : null;
    if (rawBusinessId && (!Number.isFinite(businessId) || businessId == null)) {
      return res.status(400).json({ error: "A valid business id is required" });
    }

    const [business] = businessId != null
      ? await db.select({
          id: businessesTable.id,
          slug: businessesTable.slug,
        }).from(businessesTable)
          .where(eq(businessesTable.id, businessId))
          .limit(1)
      : [];
    if (businessId != null && !business) {
      return res.status(404).json({ error: "Business not found" });
    }

    // Canonical ownership is business_id. Older jobs were intentionally kept
    // recoverable with business_line only, so include that compatibility path
    // when the slug proves the job belongs to this business.
    const jobBusinessScope = business
      ? or(
          eq(jobsTable.businessId, business.id),
          and(isNull(jobsTable.businessId), eq(jobsTable.businessLine, business.slug)),
        )
      : undefined;

    // With a selected business, every query is scoped to that business. With
    // no selector, this is the existing owner-wide dashboard view.
    const allJobs = await db.select({
      id: jobsTable.id,
      title: jobsTable.title,
      jobNumber: jobsTable.jobNumber,
      status: jobsTable.status,
      ownerPayIncluded: jobsTable.ownerPayIncluded,
    }).from(jobsTable)
      .where(jobBusinessScope)
      .orderBy(desc(jobsTable.jobNumber), desc(jobsTable.id));

    const jobIds = allJobs.map(j => j.id);
    const [profitByJob, financialSettings] = await Promise.all([
      loadJobProfitByJob(jobIds),
      db.select({
        growthReservePct: settingsTable.growthReservePct,
        taxReservePct: settingsTable.taxReservePct,
      }).from(settingsTable).limit(1),
    ]);

    // Allocation sub percentages per job
    const allocRows = jobIds.length > 0 ? await db.select({
      jobId: jobSubcontractorsTable.jobId,
      totalAllocPct: sql<string>`COALESCE(SUM(COALESCE(${jobSubcontractorsTable.allocationPct}, 0)), 0)`,
    }).from(jobSubcontractorsTable)
      .where(and(inArray(jobSubcontractorsTable.jobId, jobIds), eq(jobSubcontractorsTable.compensationType, "allocation")))
      .groupBy(jobSubcontractorsTable.jobId) : [];
    const allocPctByJob = new Map(allocRows.map(r => [r.jobId, parseFloat(r.totalAllocPct ?? "0")]));
    const growthReservePct = financialSettings[0]?.growthReservePct != null
      ? parseFloat(String(financialSettings[0].growthReservePct))
      : 5;
    const taxReservePct = financialSettings[0]?.taxReservePct != null
      ? parseFloat(String(financialSettings[0].taxReservePct))
      : 25;

    // Per-job take-home starts from the canonical job-profit calculation.
    // Owner allocation and tax reserve remain a separate presentation layer.
    let totalEarned = 0;
    const jobs = allJobs.map(job => {
      const loaded = profitByJob.get(job.id);
      if (!loaded) throw new Error(`Missing canonical profit calculation for job ${job.id}`);
      const totalAllocPct = allocPctByJob.get(job.id) ?? 0;
      const pay = calculateOwnerPayFromJobProfit(
        loaded,
        totalAllocPct,
        growthReservePct,
        taxReservePct,
      );
      // All jobs in the resolved business scope count automatically. The old
      // owner_pay_included flag powered a confusing UI toggle and must not hide
      // earned job pay from the summary.
      totalEarned += pay.takeHome;
      return {
        jobId:            job.id,
        jobNumber:        job.jobNumber,
        title:            job.title,
        status:           job.status,
        ownerPayIncluded: job.ownerPayIncluded,
        revenue:         pay.revenue,
        takeHome:        pay.takeHome,
      };
    });

    // ── Canonical withdrawal ledger ──────────────────────────────────────────────
    // Owner pay is equity, not an operating expense. Every withdrawal is stored
    // as a negative owner-capital entry; expenses are only retained as voided
    // historical rows by the one-time migration.
    const withdrawalRows = await db
      .select({
        id: ownerCapitalEntriesTable.id,
        date: ownerCapitalEntriesTable.date,
        amount: ownerCapitalEntriesTable.amount,
        description: ownerCapitalEntriesTable.description,
        source: ownerCapitalEntriesTable.source,
        businessId: ownerCapitalEntriesTable.businessId,
        jobId: ownerCapitalEntriesTable.jobId,
        expenseId: ownerCapitalEntriesTable.expenseId,
      })
      .from(ownerCapitalEntriesTable)
      .leftJoin(jobsTable, eq(ownerCapitalEntriesTable.jobId, jobsTable.id))
      .leftJoin(expensesTable, eq(ownerCapitalEntriesTable.expenseId, expensesTable.id))
      .where(and(
        sql`${ownerCapitalEntriesTable.amount} < 0`,
        isNull(ownerCapitalEntriesTable.voidedAt),
        business
          ? or(
              eq(ownerCapitalEntriesTable.businessId, business.id),
              and(
                isNull(ownerCapitalEntriesTable.businessId),
                or(
                  eq(jobsTable.businessId, business.id),
                  and(isNull(jobsTable.businessId), eq(jobsTable.businessLine, business.slug)),
                  eq(expensesTable.businessId, business.id),
                  and(isNull(expensesTable.businessId), eq(expensesTable.businessLine, business.slug)),
                ),
              ),
            )
          : undefined,
      ))
      .orderBy(desc(ownerCapitalEntriesTable.date));

    const withdrawals = withdrawalRows.map(r => ({
      id: `owner-${r.id}`,
      date: r.date,
      amount: Math.abs(parseFloat(r.amount as string)),
      description: r.description ?? "Owner Withdrawal",
      source: r.source ?? "Owner Withdrawal",
      businessId: r.businessId,
      jobId: r.jobId ?? null,
      expenseId: r.expenseId ?? null,
    }));

    const totalWithdrawn = withdrawals.reduce((s, w) => s + w.amount, 0);

    // Monthly paid — group by YYYY-MM for the Take-Home Dashboard chart.
    // Parse YYYY-MM-DD strings via the multi-argument Date constructor so that
    // overflow day values (e.g. "2026-06-32" stored due to a past timezone bug)
    // resolve to the correct calendar month.
    function parseOwnerPayDate(dateStr: string): Date | null {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
      if (!m) return null;
      const [, y, mo, d] = m.map(Number);
      const dt = new Date(y, mo - 1, d, 12, 0, 0); // midday avoids DST edges
      return isNaN(dt.getTime()) ? null : dt;
    }

    const monthlyPaidMap = new Map<string, number>();
    for (const r of withdrawalRows) {
      if (!r.date) continue;
      const d = parseOwnerPayDate(r.date);
      if (!d) continue;
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthlyPaidMap.set(month, (monthlyPaidMap.get(month) ?? 0) + Math.abs(parseFloat(r.amount as string)));
    }
    const monthlyPaid = Array.from(monthlyPaidMap.entries())
      .map(([month, paid]) => ({ month, paid }))
      .sort((a, b) => a.month.localeCompare(b.month));

    res.json({
      totalEarned:    Math.max(0, totalEarned),
      totalWithdrawn,
      remaining:      Math.max(0, totalEarned - totalWithdrawn),
      jobs,
      withdrawals,
      monthlyPaid,
    });
  } catch (err) {
    console.error("[owner-pay-summary]", err);
    res.status(500).json({ error: "Failed to compute owner withdrawal summary" });
  }
});

// ─── Growth Fund Deployments ──────────────────────────────────────────────────
router.get("/growth-fund-deployments", sectionGuard("jobs"), async (req, res) => {
  try {
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    const rawBusinessId = req.query.businessId;
    const businessFilter = rawBusinessId != null ? Number.parseInt(String(rawBusinessId), 10) : null;
    const conditions = [gte(growthFundDeploymentsTable.date, startDate), lte(growthFundDeploymentsTable.date, endDate)];
    if (businessFilter != null && Number.isFinite(businessFilter)) {
      conditions.push(eq(growthFundDeploymentsTable.businessId, businessFilter));
    }
    const rows = await db.select().from(growthFundDeploymentsTable)
      .where(and(...conditions))
      .orderBy(growthFundDeploymentsTable.date);
    res.json(rows.map(r => ({ ...r, amount: parseFloat(r.amount ?? "0") })));
  } catch (err) {
    console.error("[growth-fund-deployments GET]", err);
    res.status(500).json({ error: "Failed to load growth fund deployments" });
  }
});

router.post("/growth-fund-deployments", sectionGuard("jobs"), async (req, res) => {
  try {
    const { date, description, amount, notes } = req.body;
    if (!date || !description || !amount) {
      return res.status(400).json({ error: "date, description, and amount are required" });
    }
    const newAmount = parseFloat(String(amount));
    if (isNaN(newAmount) || newAmount <= 0) {
      return res.status(400).json({ error: "amount must be a positive number" });
    }
    const ownership = await resolveMutationBusiness(req);
    if (!ownership.ok) return res.status(400).json({ error: ownership.error });
    const owner = ownership.business;

    const year = parseInt((date as string).substring(0, 4));
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const GROWTH_PCT = 0.05;
    const OWNER_PCT = 0.50;
    const TAX_PCT = 0.25;

    const invoices = await db.select({
      jobId: invoicesTable.jobId,
      total: invoicesTable.total,
      status: invoicesTable.status,
      issueDate: invoicesTable.issueDate,
    }).from(invoicesTable)
      .where(and(
        gte(invoicesTable.issueDate, startDate),
        lte(invoicesTable.issueDate, endDate),
        ne(invoicesTable.status, "draft"),
        mutationBusinessPredicate(invoicesTable, owner),
      ));

    const jobIds = [...new Set(invoices.map(i => i.jobId).filter((id): id is number => id != null))];
    let accumulated = 0;
    if (jobIds.length > 0) {
      const subHoursRows = await db.select({
        jobId: jobSubHoursTable.jobId,
        cost: sql<string>`COALESCE(SUM(${jobSubHoursTable.hours} * COALESCE(${jobSubHoursTable.rateSnapshot}, 0)), 0)`,
      }).from(jobSubHoursTable).where(inArray(jobSubHoursTable.jobId, jobIds)).groupBy(jobSubHoursTable.jobId);
      const hoursCostByJob = new Map(subHoursRows.map(r => [r.jobId, parseFloat(r.cost ?? "0")]));
      for (const inv of invoices) {
        if (!inv.jobId) continue;
        const revenue = inv.status === "paid" ? parseFloat(inv.total ?? "0") : 0;
        const subLaborCost = hoursCostByJob.get(inv.jobId) ?? 0;
        const afterSubs = Math.max(0, revenue - subLaborCost);
        accumulated += afterSubs * GROWTH_PCT;
      }
    }

    const existingRows = await db.select({ amount: growthFundDeploymentsTable.amount })
      .from(growthFundDeploymentsTable)
      .where(and(
        gte(growthFundDeploymentsTable.date, startDate),
        lte(growthFundDeploymentsTable.date, endDate),
        mutationBusinessPredicate(growthFundDeploymentsTable, owner),
      ));
    const totalInvested = existingRows.reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
    const available = accumulated - totalInvested;

    if (newAmount > available + 0.005) {
      const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(available);
      return res.status(422).json({ error: `Investment would exceed available growth fund balance of ${fmt}` });
    }

    const user = (req as any).user;
    const [inserted] = await db.insert(growthFundDeploymentsTable).values({
      date: date as string,
      description: description as string,
      amount: String(newAmount),
      notes: notes ?? null,
      createdBy: user?.username ?? user?.email ?? null,
      businessId: owner.id,
    }).returning();

    res.status(201).json({ ...inserted, amount: parseFloat(inserted.amount ?? "0") });
  } catch (err) {
    console.error("[growth-fund-deployments POST]", err);
    res.status(500).json({ error: "Failed to save growth fund deployment" });
  }
});

router.delete("/growth-fund-deployments/:id", sectionGuard("jobs"), async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const ownership = await resolveMutationBusiness(req);
    if (!ownership.ok) return res.status(400).json({ error: ownership.error });
    await db.delete(growthFundDeploymentsTable).where(and(
      eq(growthFundDeploymentsTable.id, id),
      mutationBusinessPredicate(growthFundDeploymentsTable, ownership.business),
    ));
    res.json({ ok: true });
  } catch (err) {
    console.error("[growth-fund-deployments DELETE]", err);
    res.status(500).json({ error: "Failed to delete growth fund deployment" });
  }
});

export default router;
