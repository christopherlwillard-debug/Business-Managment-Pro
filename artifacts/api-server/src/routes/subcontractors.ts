import { Router } from "express";
import { db } from "@workspace/db";
import { subcontractorsTable, settingsTable, expensesTable, paymentsTable, generated1099sTable, mileageLogsTable, jobsTable, jobSubHoursTable, jobSubcontractorsTable, invoicesTable, subPaymentRecordsTable, jobMileageReimbursementsTable } from "@workspace/db/schema";
import { eq, and, sql, inArray, ne, gte, lte } from "drizzle-orm";

const router = Router();

type PaymentHistoryJob = {
  jobId: number;
  jobTitle: string | null;
  businessLine: string | null;
  compensationType: string;
  totalHours: number;
  amountOwed: number | null;
  amountPaid: number;
  paymentStatus: string;
  paidDate: string | null;
  paidAt: string | null;
};

type PaymentHistoryCsvJob = PaymentHistoryJob & {
  subcontractorName?: string;
};

function csvCell(value: string | number | null | undefined): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function paymentHistoryToCsv(
  jobs: PaymentHistoryCsvJob[],
  options: { includeSubcontractor?: boolean } = {},
): string {
  const header = options.includeSubcontractor
    ? ["Subcontractor", "Job", "Business Line", "Comp Type", "Hours", "Owed", "Paid", "Status", "Paid Date"]
    : ["Job", "Business Line", "Comp Type", "Hours", "Owed", "Paid", "Status", "Paid Date"];
  const rows = jobs.map(job => [
    ...(options.includeSubcontractor ? [job.subcontractorName ?? ""] : []),
    job.jobTitle ?? `Job #${job.jobId}`,
    job.businessLine ?? "",
    job.compensationType,
    job.totalHours.toFixed(2),
    job.amountOwed != null ? job.amountOwed.toFixed(2) : "",
    job.amountPaid.toFixed(2),
    job.paymentStatus,
    job.paidDate ?? job.paidAt ?? "",
  ]);

  return [header, ...rows]
    .map(row => row.map(csvCell).join(","))
    .join("\r\n") + "\r\n";
}

type PaymentHistoryJobWithSubcontractor = PaymentHistoryJob & {
  subcontractorId: number;
  subcontractorName: string;
  effectiveYear: number | null;
};

async function loadPaymentHistoryJobs(subcontractorId?: number): Promise<PaymentHistoryJobWithSubcontractor[]> {
  const rows = await db
    .select({
      subcontractorId: subcontractorsTable.id,
      subcontractorName: subcontractorsTable.name,
      jobId: jobSubcontractorsTable.jobId,
      jobTitle: jobsTable.title,
      jobStatus: jobsTable.status,
      jobStartDate: jobsTable.startDate,
      businessLine: jobsTable.businessLine,
      compensationType: jobSubcontractorsTable.compensationType,
      amountOwedOverride: jobSubcontractorsTable.amountOwed,
      fixedAmount: jobSubcontractorsTable.fixedAmount,
      allocationPct: jobSubcontractorsTable.allocationPct,
      amountPaid: sql<string>`CASE
        WHEN EXISTS (
          SELECT 1 FROM sub_payment_records spr
          WHERE spr.job_id = ${jobSubcontractorsTable.jobId}
            AND spr.subcontractor_id = ${subcontractorsTable.id}
            AND (spr.is_reversal IS NULL OR spr.is_reversal = false)
        )
        THEN COALESCE((
          SELECT SUM(spr.amount + COALESCE(spr.advance_amount, 0))
          FROM sub_payment_records spr
          WHERE spr.job_id = ${jobSubcontractorsTable.jobId}
            AND spr.subcontractor_id = ${subcontractorsTable.id}
            AND (spr.is_reversal IS NULL OR spr.is_reversal = false)
        ), 0)
        ELSE COALESCE(${jobSubcontractorsTable.amountPaid}, 0)
      END`,
      paidDate: jobSubcontractorsTable.paidDate,
      paidNotes: jobSubcontractorsTable.paidNotes,
      paymentStatus: jobSubcontractorsTable.paymentStatus,
      paidAt: jobSubcontractorsTable.paidAt,
      computedOwed: sql<string>`COALESCE((
        SELECT SUM(h.hours * COALESCE(h.rate_snapshot, 0))
        FROM job_sub_hours h
        WHERE h.job_id = ${jobSubcontractorsTable.jobId}
          AND h.subcontractor_id = ${subcontractorsTable.id}
      ), 0)`,
      totalHours: sql<string>`COALESCE((
        SELECT SUM(h.hours)
        FROM job_sub_hours h
        WHERE h.job_id = ${jobSubcontractorsTable.jobId}
          AND h.subcontractor_id = ${subcontractorsTable.id}
      ), 0)`,
    })
    .from(jobSubcontractorsTable)
    .innerJoin(jobsTable, eq(jobSubcontractorsTable.jobId, jobsTable.id))
    .innerJoin(subcontractorsTable, eq(jobSubcontractorsTable.subcontractorId, subcontractorsTable.id))
    .where(subcontractorId === undefined
      ? undefined
      : eq(jobSubcontractorsTable.subcontractorId, subcontractorId));

  return rows.map(r => {
    const compType = r.compensationType ?? "hourly";
    const computedOwed = parseFloat(r.computedOwed ?? "0");
    const manualOverride = r.amountOwedOverride != null ? parseFloat(r.amountOwedOverride) : null;
    const amountOwed = manualOverride != null
      ? manualOverride
      : compType === "hourly"
        ? computedOwed
        : compType === "fixed"
          ? (r.fixedAmount != null ? parseFloat(r.fixedAmount) : null)
          : null;
    const amountPaid = r.amountPaid != null ? parseFloat(r.amountPaid) : 0;
    const paidDate = r.paidDate;
    const startDate = r.jobStartDate;
    const effectiveDate = paidDate || startDate;
    const effectiveYear = effectiveDate ? parseInt(effectiveDate.substring(0, 4)) : null;

    return {
      subcontractorId: r.subcontractorId,
      subcontractorName: r.subcontractorName,
      jobId: r.jobId,
      jobTitle: r.jobTitle,
      jobStatus: r.jobStatus,
      businessLine: r.businessLine ?? null,
      compensationType: compType,
      totalHours: parseFloat(r.totalHours ?? "0"),
      amountOwed,
      amountPaid,
      paidDate,
      paidNotes: r.paidNotes,
      paymentStatus: r.paymentStatus ?? "unpaid",
      paidAt: r.paidAt ?? null,
      effectiveYear,
    };
  });
}

function filterPaymentHistoryJobs(
  jobs: PaymentHistoryJobWithSubcontractor[],
  year: number | null,
  businessLine: string | null,
): PaymentHistoryJobWithSubcontractor[] {
  return jobs
    .filter(job => {
      if (year !== null && job.effectiveYear !== year) return false;
      if (businessLine && job.businessLine !== businessLine) return false;
      return true;
    })
    .sort((a, b) => {
      const subSort = a.subcontractorName.localeCompare(b.subcontractorName);
      if (subSort !== 0) return subSort;
      const dateSort = (b.paidDate || "").localeCompare(a.paidDate || "");
      if (dateSort !== 0) return dateSort;
      return (a.jobTitle ?? `Job #${a.jobId}`).localeCompare(b.jobTitle ?? `Job #${b.jobId}`);
    });
}

function format(s: any, ytdOverride?: number) {
  return {
    ...s,
    ytdPayments: ytdOverride !== undefined ? ytdOverride : parseFloat(s.ytdPayments ?? "0"),
    createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
    portalPinSet: !!s.portalPinHash,
    portalPinHash: undefined,
  };
}

async function computeHasLinkedRecords(subcontractorId: number): Promise<boolean> {
  const [expRow] = await db
    .select({ cnt: sql<string>`COUNT(*)` })
    .from(expensesTable)
    .where(
      and(
        eq(expensesTable.subcontractorId, subcontractorId),
        sql`LOWER(${expensesTable.category}) = 'subcontractor'`
      )
    );
  if (parseInt(expRow?.cnt ?? "0") > 0) return true;

  const [payRow] = await db
    .select({ cnt: sql<string>`COUNT(*)` })
    .from(paymentsTable)
    .where(eq(paymentsTable.subcontractorId, subcontractorId));
  return parseInt(payRow?.cnt ?? "0") > 0;
}

export async function computeYtd(subcontractorId: number, year: number, businessLine?: string | null): Promise<number> {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  // sub_payment_records: pay-worker payments (new path). Exclude reversals.
  // Filter by businessLine when provided so cross-entity totals aren't combined.
  const [sprRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${subPaymentRecordsTable.amount} + COALESCE(${subPaymentRecordsTable.advanceAmount}, 0)), 0)` })
    .from(subPaymentRecordsTable)
    .where(
      and(
        eq(subPaymentRecordsTable.subcontractorId, subcontractorId),
        gte(subPaymentRecordsTable.paymentDate, startDate),
        lte(subPaymentRecordsTable.paymentDate, endDate),
        sql`${subPaymentRecordsTable.isReversal} IS NOT TRUE`,
        businessLine ? eq(subPaymentRecordsTable.businessLine, businessLine) : undefined,
      )
    );

  // expenses (category=Subcontractor, jobSubHoursId IS NULL): manually-entered
  // old-path payments only. Rows where jobSubHoursId IS NOT NULL are sub-hours
  // auto-expenses that are already represented in sub_payment_records — excluding
  // them prevents double-counting.
  const [expRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${expensesTable.amount}), 0)` })
    .from(expensesTable)
    .where(
      and(
        eq(expensesTable.subcontractorId, subcontractorId),
        sql`LOWER(${expensesTable.category}) = 'subcontractor'`,
        gte(expensesTable.date, startDate),
        lte(expensesTable.date, endDate),
        sql`${expensesTable.jobSubHoursId} IS NULL`,
        businessLine ? eq(expensesTable.businessLine, businessLine) : undefined,
      )
    );

  // paymentsTable: legacy direct/manual payments. This table predates multi-business
  // support and has no businessLine column, so these records are always included in
  // the YTD total regardless of the businessLine filter. New payments use
  // subPaymentRecordsTable (which does carry businessLine) and old-path manual
  // expenses also carry businessLine, so only truly legacy paymentsTable rows
  // remain unscoped. This is an accepted limitation documented in Task #1884.
  const [payRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${paymentsTable.amount}), 0)` })
    .from(paymentsTable)
    .where(
      and(
        eq(paymentsTable.subcontractorId, subcontractorId),
        eq(paymentsTable.year, year)
      )
    );

  return (
    parseFloat(sprRow?.total ?? "0") +
    parseFloat(expRow?.total ?? "0") +
    parseFloat(payRow?.total ?? "0")
  );
}

router.get("/1099-report", async (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
    const [settings] = await db.select().from(settingsTable).limit(1);
    const threshold = parseFloat(settings?.thresholdAmount1099 ?? "600");
    const subs = await db.select().from(subcontractorsTable).orderBy(subcontractorsTable.name);

    const results = await Promise.all(subs.map(async (s) => {
      const ytd = await computeYtd(s.id, year);
      const alerts: string[] = [];
      if (ytd >= threshold) alerts.push(`YTD payments $${ytd.toFixed(2)} exceed $${threshold} threshold`);
      if (!s.w9OnFile) alerts.push("W-9 not on file");
      if (ytd >= threshold * 0.8 && ytd < threshold) alerts.push(`Approaching $${threshold} threshold`);

      return {
        subcontractorId: s.id,
        name: s.name,
        ytdPayments: ytd,
        threshold,
        needsForm: ytd >= threshold,
        w9OnFile: s.w9OnFile,
        alerts,
      };
    }));

    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get 1099 report" });
  }
});

/** All-time multi-source paid total — mirrors computeYtd but without year/date filtering. */
async function computeAllTimePaid(subcontractorId: number): Promise<number> {
  // sub_payment_records: pay-worker payments (new path). Exclude reversals.
  const [sprRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${subPaymentRecordsTable.amount} + COALESCE(${subPaymentRecordsTable.advanceAmount}, 0)), 0)` })
    .from(subPaymentRecordsTable)
    .where(
      and(
        eq(subPaymentRecordsTable.subcontractorId, subcontractorId),
        sql`${subPaymentRecordsTable.isReversal} IS NOT TRUE`,
      )
    );

  // expenses (category=Subcontractor, jobSubHoursId IS NULL): manually-entered old-path payments.
  // Rows where jobSubHoursId IS NOT NULL are sub-hours auto-expenses already in sub_payment_records.
  const [expRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${expensesTable.amount}), 0)` })
    .from(expensesTable)
    .where(
      and(
        eq(expensesTable.subcontractorId, subcontractorId),
        sql`LOWER(${expensesTable.category}) = 'subcontractor'`,
        sql`${expensesTable.jobSubHoursId} IS NULL`,
      )
    );

  // paymentsTable: direct/manual payments recorded via the payments flow.
  const [payRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${paymentsTable.amount}), 0)` })
    .from(paymentsTable)
    .where(eq(paymentsTable.subcontractorId, subcontractorId));

  return (
    parseFloat(sprRow?.total ?? "0") +
    parseFloat(expRow?.total ?? "0") +
    parseFloat(payRow?.total ?? "0")
  );
}

async function computeSubAggregates(subcontractorId: number, balanceSettledAt?: Date | null) {
  const [hoursRows, totalPaid, owedRows] = await Promise.all([
    db
      .select({ total: sql<string>`COALESCE(SUM(${jobSubHoursTable.hours}), 0)` })
      .from(jobSubHoursTable)
      .where(eq(jobSubHoursTable.subcontractorId, subcontractorId)),
    computeAllTimePaid(subcontractorId),
    db
      .select({
        amountOwed: jobSubcontractorsTable.amountOwed,
        computedOwed: sql<string>`COALESCE((
          SELECT SUM(h.hours * COALESCE(h.rate_snapshot, 0))
          FROM job_sub_hours h
          WHERE h.job_id = ${jobSubcontractorsTable.jobId}
            AND h.subcontractor_id = ${subcontractorId}
        ), 0)`,
      })
      .from(jobSubcontractorsTable)
      .where(eq(jobSubcontractorsTable.subcontractorId, subcontractorId)),
  ]);

  // If the sub is manually settled, treat totalOwed = totalPaid so balance = 0.
  // This handles subs paid via bonuses/flat expenses where hours×rate doesn't match reality.
  if (balanceSettledAt) {
    return {
      totalHours: parseFloat(hoursRows[0]?.total ?? "0"),
      totalOwed: totalPaid,
      totalPaid,
      balanceSettled: true,
    };
  }

  // totalOwed: use manual amountOwed override if set, else computed hours×rate_snapshot.
  let totalOwed = 0;
  for (const row of owedRows) {
    const owed = row.amountOwed != null
      ? parseFloat(row.amountOwed)
      : parseFloat(row.computedOwed ?? "0");
    totalOwed += owed;
  }

  return {
    totalHours: parseFloat(hoursRows[0]?.total ?? "0"),
    totalOwed,
    totalPaid,
    balanceSettled: false,
  };
}

router.get("/", async (req, res) => {
  try {
    const year = new Date().getFullYear();
    const subs = await db.select().from(subcontractorsTable).orderBy(subcontractorsTable.name);
    const formatted = await Promise.all(subs.map(async (s) => {
      const [ytd, hasLinkedRecords, agg] = await Promise.all([
        computeYtd(s.id, year),
        computeHasLinkedRecords(s.id),
        computeSubAggregates(s.id, s.balanceSettledAt),
      ]);
      return {
        ...format(s, ytd), hasLinkedRecords,
        totalTrackedHours: agg.totalHours,
        totalOwed: agg.totalOwed,
        totalPaid: agg.totalPaid,
        balance: Math.max(0, agg.totalOwed - agg.totalPaid),
        balanceSettled: agg.balanceSettled,
        payRate: s.payRate != null ? parseFloat(s.payRate) : null,
        payType: s.payType,
        role: s.role ?? "hourly",
        growthPct: s.growthPct != null ? parseFloat(s.growthPct) : 0,
      };
    }));
    res.json(formatted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch subcontractors" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, email, phone, trade, licenseNumber, licenseExpiry, insuranceExpiry, w9OnFile, address, notes, payRate, payType, role, growthPct } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });
    const [sub] = await db.insert(subcontractorsTable).values({
      name, email, phone, trade, licenseNumber, licenseExpiry, insuranceExpiry, w9OnFile: !!w9OnFile, address, notes,
      payRate: payRate != null ? String(payRate) : null,
      payType: payType || "hourly",
      role: role || "hourly",
      growthPct: growthPct != null ? String(growthPct) : "0",
    }).returning();
    const ytd = await computeYtd(sub.id, new Date().getFullYear());
    res.status(201).json(format(sub, ytd));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create subcontractor" });
  }
});

// GET /api/subcontractors/outstanding-balances
// IMPORTANT: must be declared before /:id so Express doesn't swallow "outstanding-balances" as an id param
router.get("/outstanding-balances", async (req, res) => {
  try {
    const includeSettled = req.query.includeSettled === "true";

    // Only fixed + allocation subs are tracked here; hourly owed requires hours×rate context
    const whereClause = includeSettled
      ? inArray(jobSubcontractorsTable.compensationType, ["fixed", "allocation"])
      : and(
          inArray(jobSubcontractorsTable.paymentStatus, ["unpaid", "partial"]),
          inArray(jobSubcontractorsTable.compensationType, ["fixed", "allocation"])
        );

    const rows = await db.select({
      subcontractorId: jobSubcontractorsTable.subcontractorId,
      subName: subcontractorsTable.name,
      jobId: jobSubcontractorsTable.jobId,
      jobTitle: jobsTable.title,
      jobStatus: jobsTable.status,
      businessLine: jobsTable.businessLine,
      compensationType: jobSubcontractorsTable.compensationType,
      fixedAmount: jobSubcontractorsTable.fixedAmount,
      allocationPct: jobSubcontractorsTable.allocationPct,
      amountOwed: jobSubcontractorsTable.amountOwed,
      amountPaid: jobSubcontractorsTable.amountPaid,
      paymentStatus: jobSubcontractorsTable.paymentStatus,
      lastPaidAt: jobSubcontractorsTable.lastPaidAt,
      paidAt: jobSubcontractorsTable.paidAt,
    })
      .from(jobSubcontractorsTable)
      .leftJoin(subcontractorsTable, eq(jobSubcontractorsTable.subcontractorId, subcontractorsTable.id))
      .leftJoin(jobsTable, eq(jobSubcontractorsTable.jobId, jobsTable.id))
      .where(whereClause);

    // Fetch total invoice revenue per job so allocation subs can compute their owed amount
    const uniqueJobIds = [...new Set(rows.map(r => r.jobId).filter(Boolean))];
    const jobRevenueMap = new Map<number, number>();
    if (uniqueJobIds.length > 0) {
      const revenueRows = await db.select({
        jobId: invoicesTable.jobId,
        revenue: sql<string>`SUM(${invoicesTable.total})`,
      })
        .from(invoicesTable)
        .where(inArray(invoicesTable.jobId, uniqueJobIds as number[]))
        .groupBy(invoicesTable.jobId);
      for (const rv of revenueRows) {
        if (rv.jobId != null) jobRevenueMap.set(rv.jobId, parseFloat(rv.revenue ?? "0"));
      }
    }

    type SubEntry = {
      subcontractorId: number;
      subName: string;
      jobs: Array<{
        jobId: number; jobTitle: string; jobStatus: string | null; businessLine: string | null;
        compensationType: string; fixedAmount: number | null; allocationPct: number | null;
        amountOwed: number | null; amountPaid: number; paymentStatus: string; lastPaidAt: string | null;
      }>;
      totalOwed: number;
      totalPaid: number;
      balance: number;
      percentComplete: number | null;
      lastPaymentDate: string | null;
    };

    const subMap = new Map<number, SubEntry>();

    for (const r of rows) {
      const subId = r.subcontractorId;
      if (!subMap.has(subId)) {
        subMap.set(subId, {
          subcontractorId: subId,
          subName: r.subName ?? `Sub #${subId}`,
          jobs: [],
          totalOwed: 0,
          totalPaid: 0,
          balance: 0,
          percentComplete: null,
          lastPaymentDate: null,
        });
      }
      const entry = subMap.get(subId)!;
      const amountPaid = r.amountPaid != null ? parseFloat(r.amountPaid) : 0;
      const compType = r.compensationType ?? "hourly";

      // Compute effective agreed owed:
      //   1. Manual override (amountOwed) always wins
      //   2. fixed: fall back to stored fixedAmount
      //   3. allocation: fall back to jobRevenue × allocationPct/100
      //      (uses total invoice revenue as the split pool proxy)
      let amountOwed: number | null = null;
      if (r.amountOwed != null) {
        amountOwed = parseFloat(r.amountOwed);
      } else if (compType === "fixed") {
        amountOwed = r.fixedAmount != null ? parseFloat(r.fixedAmount) : null;
      } else if (compType === "allocation" && r.allocationPct != null) {
        const jobRevenue = jobRevenueMap.get(r.jobId) ?? 0;
        if (jobRevenue > 0) {
          amountOwed = jobRevenue * (parseFloat(r.allocationPct) / 100);
        }
      }

      entry.jobs.push({
        jobId: r.jobId,
        jobTitle: r.jobTitle ?? `Job #${r.jobId}`,
        jobStatus: r.jobStatus,
        businessLine: r.businessLine,
        compensationType: compType,
        fixedAmount: r.fixedAmount != null ? parseFloat(r.fixedAmount) : null,
        allocationPct: r.allocationPct != null ? parseFloat(r.allocationPct) : null,
        amountOwed,
        amountPaid,
        paymentStatus: r.paymentStatus ?? "unpaid",
        lastPaidAt: r.lastPaidAt ?? null,
      });

      if (amountOwed != null) entry.totalOwed += amountOwed;
      entry.totalPaid += amountPaid;

      const mostRecent = r.lastPaidAt ?? r.paidAt ?? null;
      if (mostRecent && (!entry.lastPaymentDate || mostRecent > entry.lastPaymentDate)) {
        entry.lastPaymentDate = mostRecent;
      }
    }

    const perSubTotals = Array.from(subMap.values()).map(entry => {
      const balance = Math.max(0, entry.totalOwed - entry.totalPaid);
      const percentComplete = entry.totalOwed > 0
        ? Math.min(100, Math.round((entry.totalPaid / entry.totalOwed) * 100))
        : null;
      return { ...entry, balance, percentComplete };
    }).sort((a, b) => b.balance - a.balance);

    const totalOutstanding = perSubTotals.reduce((s, e) => s + e.balance, 0);
    const subsOwed = includeSettled
      ? perSubTotals.filter(e => e.balance > 0.005).length
      : perSubTotals.length;
    const jobsImpacted = includeSettled
      ? new Set(rows.filter(r => (r.amountPaid != null ? parseFloat(r.amountPaid) : 0) < (r.amountOwed != null ? parseFloat(r.amountOwed) : Infinity)).map(r => r.jobId)).size
      : new Set(rows.map(r => r.jobId)).size;

    res.json({ perSubTotals, totalOutstanding, subsOwed, jobsImpacted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch outstanding balances" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [sub] = await db.select().from(subcontractorsTable).where(eq(subcontractorsTable.id, id));
    if (!sub) return res.status(404).json({ error: "Subcontractor not found" });
    const ytd = await computeYtd(id, new Date().getFullYear());
    res.json(format(sub, ytd));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch subcontractor" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, email, phone, trade, licenseNumber, licenseExpiry, insuranceExpiry, w9OnFile, address, notes, payRate, travelPayRate, payType, role, growthPct } = req.body;
    const updates: Record<string, unknown> = {};
    if ("name" in req.body) updates.name = name;
    if ("email" in req.body) updates.email = email;
    if ("phone" in req.body) updates.phone = phone;
    if ("trade" in req.body) updates.trade = trade;
    if ("licenseNumber" in req.body) updates.licenseNumber = licenseNumber;
    if ("licenseExpiry" in req.body) updates.licenseExpiry = licenseExpiry;
    if ("insuranceExpiry" in req.body) updates.insuranceExpiry = insuranceExpiry;
    if ("w9OnFile" in req.body) updates.w9OnFile = !!w9OnFile;
    if ("address" in req.body) updates.address = address;
    if ("notes" in req.body) updates.notes = notes;
    if ("payRate" in req.body) updates.payRate = payRate != null ? String(payRate) : null;
    if ("travelPayRate" in req.body) updates.travelPayRate = travelPayRate != null ? String(travelPayRate) : null;
    if ("payType" in req.body) updates.payType = payType || "hourly";
    if ("role" in req.body) updates.role = role || "hourly";
    if ("growthPct" in req.body) updates.growthPct = growthPct != null ? String(growthPct) : "0";
    const [sub] = await db.update(subcontractorsTable).set(updates).where(eq(subcontractorsTable.id, id)).returning();
    if (!sub) return res.status(404).json({ error: "Subcontractor not found" });
    const ytd = await computeYtd(id, new Date().getFullYear());
    res.json(format(sub, ytd));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update subcontractor" });
  }
});

// POST /api/subcontractors/:id/settle — mark balance as settled
router.post("/:id/settle", async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const [sub] = await db
      .update(subcontractorsTable)
      .set({ balanceSettledAt: new Date() })
      .where(eq(subcontractorsTable.id, id))
      .returning();
    if (!sub) return res.status(404).json({ error: "Subcontractor not found" });
    res.json({ balanceSettled: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to settle balance" });
  }
});

// DELETE /api/subcontractors/:id/settle — reopen balance
router.delete("/:id/settle", async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const [sub] = await db
      .update(subcontractorsTable)
      .set({ balanceSettledAt: null })
      .where(eq(subcontractorsTable.id, id))
      .returning();
    if (!sub) return res.status(404).json({ error: "Subcontractor not found" });
    res.json({ balanceSettled: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to reopen balance" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const reassignedJobs = await db.transaction(async (tx) => {
      await tx.update(expensesTable).set({ subcontractorId: null }).where(eq(expensesTable.subcontractorId, id));
      await tx.update(paymentsTable).set({ subcontractorId: null }).where(eq(paymentsTable.subcontractorId, id));
      await tx.update(mileageLogsTable).set({ subcontractorId: null }).where(eq(mileageLogsTable.subcontractorId, id));
      await tx.update(generated1099sTable).set({ subcontractorId: null }).where(eq(generated1099sTable.subcontractorId, id));
      await tx.update(jobsTable).set({ subcontractorId: null }).where(eq(jobsTable.subcontractorId, id));
      const affectedJobs = await tx.select({
        jobId: jobMileageReimbursementsTable.jobId,
        jobTitle: jobsTable.title,
      })
        .from(jobMileageReimbursementsTable)
        .innerJoin(jobsTable, eq(jobMileageReimbursementsTable.jobId, jobsTable.id))
        .where(and(
          eq(jobMileageReimbursementsTable.recipientSubcontractorId, id),
          eq(jobMileageReimbursementsTable.recipientType, "subcontractor"),
        ));
      await tx.update(jobMileageReimbursementsTable)
        .set({
          recipientType: "owner",
          recipientName: "Business owner",
          recipientSubcontractorId: null,
        })
        .where(and(
          eq(jobMileageReimbursementsTable.recipientSubcontractorId, id),
          eq(jobMileageReimbursementsTable.recipientType, "subcontractor"),
        ));
      await tx.delete(subcontractorsTable).where(eq(subcontractorsTable.id, id));
      return affectedJobs;
    });
    res.json({ reassignedJobs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete subcontractor" });
  }
});

router.get("/payment-history/all", async (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year as string) : null;
    const businessLine = req.query.businessLine ? (req.query.businessLine as string) : null;
    const rows = await loadPaymentHistoryJobs();
    const jobs = filterPaymentHistoryJobs(rows, year, businessLine);

    if (req.query.format === "csv") {
      const filename = `subcontractors-payment-history-${year ?? "all-years"}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.send(paymentHistoryToCsv(jobs, { includeSubcontractor: true }));
    }

    res.json({ jobs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch payment history" });
  }
});

router.get("/:id/payment-history", async (req, res) => {
  try {
    const subId = parseInt(req.params.id);
    if (isNaN(subId)) return res.status(400).json({ error: "Invalid id" });

    const year = req.query.year ? parseInt(req.query.year as string) : null;
    const businessLine = req.query.businessLine ? (req.query.businessLine as string) : null;
    const allJobs = filterPaymentHistoryJobs(
      await loadPaymentHistoryJobs(subId),
      year,
      businessLine,
    );
    const jobs = allJobs.map(({ subcontractorId: _subcontractorId, subcontractorName: _subcontractorName, ...job }) => job);

    const totalOwed = jobs.reduce((s, j) => s + (j.amountOwed ?? 0), 0);
    const totalPaid = jobs.reduce((s, j) => s + j.amountPaid, 0);
    // ytdPaid = all dollars actually transferred (includes partial payments)
    const ytdPaid = totalPaid;

    // Collect distinct business lines across ALL jobs (unfiltered) for the filter dropdown
    const allBusinessLines = [...new Set(
      allJobs.map(job => job.businessLine).filter((bl): bl is string => !!bl)
    )].sort();

    if (req.query.format === "csv") {
      const filename = `subcontractor-${subId}-payment-history.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.send(paymentHistoryToCsv(jobs));
    }

    res.json({ jobs, ytdPaid, totalOwed, totalPaid, balance: totalOwed - totalPaid, allBusinessLines });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch payment history" });
  }
});

router.post("/:id/reset-portal-pin", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [sub] = await db
      .update(subcontractorsTable)
      .set({ portalPinHash: null, portalPinAttempts: 0, portalPinLockedUntil: null })
      .where(eq(subcontractorsTable.id, id))
      .returning();
    if (!sub) return res.status(404).json({ error: "Subcontractor not found" });
    res.json({ success: true, portalPinSet: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to reset portal PIN" });
  }
});

export default router;
