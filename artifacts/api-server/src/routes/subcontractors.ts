import { Router } from "express";
import { db } from "@workspace/db";
import { subcontractorsTable, settingsTable, expensesTable, paymentsTable, generated1099sTable, mileageLogsTable, jobsTable, jobSubHoursTable, jobSubcontractorsTable } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";

const router = Router();

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

export async function computeYtd(subcontractorId: number, year: number): Promise<number> {
  const yearStr = String(year);

  const [expRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${expensesTable.amount}), 0)` })
    .from(expensesTable)
    .where(
      and(
        eq(expensesTable.subcontractorId, subcontractorId),
        sql`LOWER(${expensesTable.category}) = 'subcontractor'`,
        sql`${expensesTable.date} LIKE ${yearStr + "-%"}`
      )
    );

  const [payRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${paymentsTable.amount}), 0)` })
    .from(paymentsTable)
    .where(
      and(
        eq(paymentsTable.subcontractorId, subcontractorId),
        eq(paymentsTable.year, year)
      )
    );

  // NOTE: job_subcontractors.amount_paid is intentionally NOT included here.
  // Sub hours auto-create linked expenses in expensesTable (category="Subcontractor"),
  // so expRow already captures those payments. Adding amount_paid on top would
  // double-count the same dollars in YTD totals and 1099 calculations.

  return (
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

async function computeSubAggregates(subcontractorId: number) {
  const [hoursRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${jobSubHoursTable.hours}), 0)` })
    .from(jobSubHoursTable)
    .where(eq(jobSubHoursTable.subcontractorId, subcontractorId));

  // totalOwed: for each job link, use manual amountOwed if set, otherwise sum hours×rate_snapshot
  const owedRows = await db
    .select({
      jobId: jobSubcontractorsTable.jobId,
      amountOwed: jobSubcontractorsTable.amountOwed,
      amountPaid: jobSubcontractorsTable.amountPaid,
      computedOwed: sql<string>`COALESCE((
        SELECT SUM(h.hours * COALESCE(h.rate_snapshot, 0))
        FROM job_sub_hours h
        WHERE h.job_id = ${jobSubcontractorsTable.jobId}
          AND h.subcontractor_id = ${subcontractorId}
      ), 0)`,
    })
    .from(jobSubcontractorsTable)
    .where(eq(jobSubcontractorsTable.subcontractorId, subcontractorId));

  let totalOwed = 0;
  let totalPaid = 0;
  for (const row of owedRows) {
    const owed = row.amountOwed != null ? parseFloat(row.amountOwed) : parseFloat(row.computedOwed ?? "0");
    totalOwed += owed;
    totalPaid += row.amountPaid != null ? parseFloat(row.amountPaid) : 0;
  }

  return {
    totalHours: parseFloat(hoursRow?.total ?? "0"),
    totalOwed,
    totalPaid,
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
        computeSubAggregates(s.id),
      ]);
      return {
        ...format(s, ytd), hasLinkedRecords,
        totalTrackedHours: agg.totalHours,
        totalOwed: agg.totalOwed,
        totalPaid: agg.totalPaid,
        balance: agg.totalOwed - agg.totalPaid,
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
    const { name, email, phone, trade, licenseNumber, licenseExpiry, insuranceExpiry, w9OnFile, address, notes, payRate, payType, role, growthPct } = req.body;
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

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.transaction(async (tx) => {
      await tx.update(expensesTable).set({ subcontractorId: null }).where(eq(expensesTable.subcontractorId, id));
      await tx.update(paymentsTable).set({ subcontractorId: null }).where(eq(paymentsTable.subcontractorId, id));
      await tx.update(mileageLogsTable).set({ subcontractorId: null }).where(eq(mileageLogsTable.subcontractorId, id));
      await tx.update(generated1099sTable).set({ subcontractorId: null }).where(eq(generated1099sTable.subcontractorId, id));
      await tx.update(jobsTable).set({ subcontractorId: null }).where(eq(jobsTable.subcontractorId, id));
      await tx.delete(subcontractorsTable).where(eq(subcontractorsTable.id, id));
    });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete subcontractor" });
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
