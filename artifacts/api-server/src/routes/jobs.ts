import { Router } from "express";
import { db } from "@workspace/db";
import { jobsTable, clientsTable, jobSubcontractorsTable, subcontractorsTable, dailyLogsTable, expensesTable, mileageLogsTable, recurringExpensesTable, estimatesTable, materialListsTable, materialListItemsTable, invoicesTable, jobSubHoursTable, phaseItemSchema, permitChecklistItemSchema, subPaymentRecordsTable } from "@workspace/db/schema";
import { eq, and, count, inArray, sql, isNull, desc } from "drizzle-orm";
import { syncMaterialsToJobInvoice } from "./material-lists";
import { computeAllocationSplitPool, computeSubOwed } from "../lib/allocation.js";
import { z } from "zod/v4";

const router = Router();

// Shared helper — recompute and persist jobs.sub_paid from per-sub payment/hour data.
// Call this any time sub_hours or sub_payments change for a job.
export async function recomputeSubPaid(jobId: number): Promise<boolean> {
  const allRows = await db.select({
    compensationType: jobSubcontractorsTable.compensationType,
    fixedAmount: jobSubcontractorsTable.fixedAmount,
    allocationPct: jobSubcontractorsTable.allocationPct,
    paymentStatus: jobSubcontractorsTable.paymentStatus,
    amountOwed: jobSubcontractorsTable.amountOwed,
    amountPaid: jobSubcontractorsTable.amountPaid,
    computedOwed: sql<string>`COALESCE((
      SELECT SUM(h.hours * COALESCE(h.rate_snapshot, 0))
      FROM job_sub_hours h
      WHERE h.job_id = ${jobId} AND h.subcontractor_id = ${jobSubcontractorsTable.subcontractorId}
    ), 0)`,
  }).from(jobSubcontractorsTable).where(eq(jobSubcontractorsTable.jobId, jobId));

  // Fetch split pool once if any allocation sub needs it
  const hasAllocation = allRows.some(r => (r.compensationType ?? "hourly") === "allocation");
  const splitPool = hasAllocation ? (await computeAllocationSplitPool(jobId)).splitPool : 0;

  const allPaid = allRows.length > 0 && allRows.every(r => {
    // paymentStatus='paid' is authoritative — set by pay-worker endpoint
    if (r.paymentStatus === "paid") return true;
    // partial is explicitly not paid
    if (r.paymentStatus === "partial") return false;
    const paid = r.amountPaid != null ? parseFloat(r.amountPaid) : 0;
    const owed = computeSubOwed(r, splitPool);
    if (owed === null) return false; // owed unknown → treat as unpaid
    return owed <= 0 || paid >= owed - 0.01;
  });
  await db.update(jobsTable).set({ subPaid: allPaid }).where(eq(jobsTable.id, jobId));
  return allPaid;
}

const phasesInputSchema = z.array(phaseItemSchema).nullable().optional();
const permitChecklistInputSchema = z.array(permitChecklistItemSchema).nullable().optional();

function parsePhases(raw: unknown) {
  if (raw === null || raw === undefined) return null;
  const result = phasesInputSchema.safeParse(raw);
  if (!result.success) throw new Error("phases must be an array of { name: string, completed: boolean }");
  return result.data ?? null;
}

function parsePermitChecklist(raw: unknown) {
  if (raw === null || raw === undefined) return null;
  const result = permitChecklistInputSchema.safeParse(raw);
  if (!result.success) throw new Error("permitChecklist must be an array of { label: string, checked: boolean }");
  return result.data ?? null;
}

type PhaseItem = { name: string; completed: boolean };
type PermitChecklistItem = { label: string; checked: boolean };

type JobRow = {
  id: number;
  title: string;
  description: string | null;
  clientId: number | null;
  clientName: string | null;
  clientEmail: string | null;
  status: string;
  jobType: string | null;
  homeModel: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  locationName: string | null;
  startDate: string | null;
  endDate: string | null;
  closedAt: string | null;
  notes: string | null;
  businessLine: string | null;
  subPaid: boolean;
  sqFt: number | null;
  coats: number | null;
  phases: PhaseItem[] | null;
  permitChecklist: PermitChecklistItem[] | null;
  createdAt: Date;
  subcontractorId?: number | null;
  subcontractorName?: string | null;
};

type FormattedJob = Omit<JobRow, "createdAt" | "subcontractorId" | "subcontractorName"> & {
  createdAt: string;
  subcontractorIds: number[];
  subcontractorNames: string[];
};

function formatJob(row: JobRow & { subcontractorIds: number[]; subcontractorNames: string[] }): FormattedJob {
  const { subcontractorId: _sid, subcontractorName: _sname, ...rest } = row;
  return {
    ...rest,
    createdAt: rest.createdAt instanceof Date ? rest.createdAt.toISOString() : rest.createdAt,
    subcontractorIds: row.subcontractorIds,
    subcontractorNames: row.subcontractorNames,
  };
}

async function getJobWithSubs(jobId: number) {
  const rows = await db
    .select({
      id: jobsTable.id,
      title: jobsTable.title,
      description: jobsTable.description,
      clientId: jobsTable.clientId,
      clientName: clientsTable.name,
      clientEmail: clientsTable.email,
      status: jobsTable.status,
      jobType: jobsTable.jobType,
      homeModel: jobsTable.homeModel,
      address: jobsTable.address,
      city: jobsTable.city,
      state: jobsTable.state,
      locationName: jobsTable.locationName,
      startDate: jobsTable.startDate,
      endDate: jobsTable.endDate,
      closedAt: jobsTable.closedAt,
      notes: jobsTable.notes,
      businessLine: jobsTable.businessLine,
      subPaid: jobsTable.subPaid,
      sqFt: jobsTable.sqFt,
      coats: jobsTable.coats,
      phases: jobsTable.phases,
      permitChecklist: jobsTable.permitChecklist,
      createdAt: jobsTable.createdAt,
      subcontractorId: jobSubcontractorsTable.subcontractorId,
      subcontractorName: subcontractorsTable.name,
    })
    .from(jobsTable)
    .leftJoin(clientsTable, eq(jobsTable.clientId, clientsTable.id))
    .leftJoin(jobSubcontractorsTable, eq(jobsTable.id, jobSubcontractorsTable.jobId))
    .leftJoin(subcontractorsTable, eq(jobSubcontractorsTable.subcontractorId, subcontractorsTable.id))
    .where(eq(jobsTable.id, jobId));

  if (!rows.length) return null;

  const base = rows[0];
  const subcontractorIds: number[] = [];
  const subcontractorNames: string[] = [];
  for (const r of rows) {
    if (r.subcontractorId && !subcontractorIds.includes(r.subcontractorId)) {
      subcontractorIds.push(r.subcontractorId);
      if (r.subcontractorName) subcontractorNames.push(r.subcontractorName);
    }
  }

  return formatJob({ ...base, subcontractorIds, subcontractorNames });
}

async function replaceSubcontractors(jobId: number, ids: number[]) {
  // Differential update: only insert new links and delete removed ones.
  // This preserves existing payment/hours data on unchanged job_subcontractors rows.
  const existing = await db
    .select({ subcontractorId: jobSubcontractorsTable.subcontractorId })
    .from(jobSubcontractorsTable)
    .where(eq(jobSubcontractorsTable.jobId, jobId));
  const existingIds = existing.map(r => r.subcontractorId);

  const toAdd = ids.filter(id => !existingIds.includes(id));
  const toRemove = existingIds.filter(id => !ids.includes(id));

  if (toAdd.length > 0) {
    await db.insert(jobSubcontractorsTable).values(
      toAdd.map(sid => ({ jobId, subcontractorId: sid }))
    );
  }
  if (toRemove.length > 0) {
    await db.delete(jobSubcontractorsTable).where(
      and(
        eq(jobSubcontractorsTable.jobId, jobId),
        inArray(jobSubcontractorsTable.subcontractorId, toRemove)
      )
    );
  }
  // Keep sub_paid in sync whenever the sub assignment changes
  if (toAdd.length > 0 || toRemove.length > 0) {
    await recomputeSubPaid(jobId).catch(() => {});
  }
}

router.get("/", async (req, res) => {
  try {
    const { status, clientId } = req.query;
    const conditions = [];
    if (status) conditions.push(eq(jobsTable.status, status as string));
    if (clientId) conditions.push(eq(jobsTable.clientId, parseInt(clientId as string)));

    const rows = await db
      .select({
        id: jobsTable.id,
        title: jobsTable.title,
        description: jobsTable.description,
        clientId: jobsTable.clientId,
        clientName: clientsTable.name,
        clientEmail: clientsTable.email,
        status: jobsTable.status,
        jobType: jobsTable.jobType,
        address: jobsTable.address,
        city: jobsTable.city,
        state: jobsTable.state,
        locationName: jobsTable.locationName,
        startDate: jobsTable.startDate,
        endDate: jobsTable.endDate,
        closedAt: jobsTable.closedAt,
        notes: jobsTable.notes,
        businessLine: jobsTable.businessLine,
        subPaid: jobsTable.subPaid,
        sqFt: jobsTable.sqFt,
        coats: jobsTable.coats,
        phases: jobsTable.phases,
        permitChecklist: jobsTable.permitChecklist,
        homeModel: jobsTable.homeModel,
        createdAt: jobsTable.createdAt,
        subcontractorId: jobSubcontractorsTable.subcontractorId,
        subcontractorName: subcontractorsTable.name,
      })
      .from(jobsTable)
      .leftJoin(clientsTable, eq(jobsTable.clientId, clientsTable.id))
      .leftJoin(jobSubcontractorsTable, eq(jobsTable.id, jobSubcontractorsTable.jobId))
      .leftJoin(subcontractorsTable, eq(jobSubcontractorsTable.subcontractorId, subcontractorsTable.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(jobsTable.createdAt);

    const jobMap = new Map<number, JobRow & { subcontractorIds: number[]; subcontractorNames: string[] }>();
    for (const r of rows) {
      if (!jobMap.has(r.id)) {
        jobMap.set(r.id, { ...r, subcontractorIds: [], subcontractorNames: [] });
      }
      const job = jobMap.get(r.id)!;
      if (r.subcontractorId && !job.subcontractorIds.includes(r.subcontractorId)) {
        job.subcontractorIds.push(r.subcontractorId);
        if (r.subcontractorName) job.subcontractorNames.push(r.subcontractorName);
      }
    }

    res.json(Array.from(jobMap.values()).map(formatJob));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { title, description, clientId, subcontractorIds = [], status, jobType, homeModel, mfhManufacturerId, mfhModelId, mfhModelYear, address, city, state, locationName, startDate, endDate, notes, businessLine, sqFt, coats, phases, permitChecklist } = req.body;
    if (!title) return res.status(400).json({ error: "Title is required" });
    if (sqFt != null && (isNaN(parseInt(sqFt)) || parseInt(sqFt) < 0)) return res.status(400).json({ error: "sqFt must be a non-negative integer" });
    if (coats != null && ![1, 2].includes(parseInt(coats))) return res.status(400).json({ error: "coats must be 1 or 2" });

    let parsedPhases;
    try { parsedPhases = parsePhases(phases); } catch (e: unknown) { return res.status(400).json({ error: e instanceof Error ? e.message : "Invalid phases" }); }

    let parsedPermitChecklist;
    try { parsedPermitChecklist = parsePermitChecklist(permitChecklist); } catch (e: unknown) { return res.status(400).json({ error: e instanceof Error ? e.message : "Invalid permitChecklist" }); }

    // Assign the next sequential job number (max existing + 1, gap-free)
    const [{ maxNum }] = await db.select({ maxNum: sql<number>`COALESCE(MAX(job_number), 0)` }).from(jobsTable);
    const nextJobNumber = (maxNum ?? 0) + 1;

    const [job] = await db.insert(jobsTable).values({
      title, description,
      clientId: clientId || null,
      status: status || "scheduled",
      jobType, homeModel: homeModel || null, address, city, state, locationName,
      mfhManufacturerId: mfhManufacturerId != null ? parseInt(mfhManufacturerId) : null,
      mfhModelId: mfhModelId != null ? parseInt(mfhModelId) : null,
      mfhModelYear: mfhModelYear != null ? parseInt(mfhModelYear) : null,
      startDate, endDate,
      notes,
      businessLine: businessLine || null,
      sqFt: sqFt != null ? parseInt(sqFt) : null,
      coats: coats != null ? parseInt(coats) : null,
      phases: parsedPhases,
      permitChecklist: parsedPermitChecklist,
      jobNumber: nextJobNumber,
    }).returning();

    if (Array.isArray(subcontractorIds) && subcontractorIds.length > 0) {
      await replaceSubcontractors(job.id, subcontractorIds);
    }

    const result = await getJobWithSubs(job.id);
    res.status(201).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create job" });
  }
});

// Per-job profit: GET /:id/profit
// NOTE: this route must be registered before /:id so it is not shadowed
router.get("/:id/profit", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid job id" });

    const [invRows, expRows, sprRow, subHoursRow, subHoursSum] = await Promise.all([
      db.select({ total: invoicesTable.total, status: invoicesTable.status })
        .from(invoicesTable).where(eq(invoicesTable.jobId, id)),
      // Fetch all expenses not auto-linked to a sub-hours row.
      // Subcontractor-category expenses are moved into the sub labor bucket below
      // so they never double-count with hours-based sub labor cost.
      db.select({ amount: expensesTable.amount, category: expensesTable.category })
        .from(expensesTable).where(and(eq(expensesTable.jobId, id), isNull(expensesTable.jobSubHoursId))),
      // sub_payment_records is the authoritative ledger for fixed/allocation sub payments
      // (pay-worker stopped writing to expenses in Task #892).
      // Only include non-hourly subs — hourly costs are already captured via job_sub_hours.
      db.select({ total: sql<string>`COALESCE(SUM(${subPaymentRecordsTable.amount}), 0)` })
        .from(subPaymentRecordsTable)
        .innerJoin(jobSubcontractorsTable, and(
          eq(jobSubcontractorsTable.jobId, subPaymentRecordsTable.jobId),
          eq(jobSubcontractorsTable.subcontractorId, subPaymentRecordsTable.subcontractorId),
        ))
        .where(and(
          eq(subPaymentRecordsTable.jobId, id),
          sql`${subPaymentRecordsTable.isReversal} IS NOT TRUE`,
          sql`${jobSubcontractorsTable.compensationType} = 'fixed'`,
        )),
      db.select({ total: sql<string>`COALESCE(SUM(${jobSubHoursTable.hours} * COALESCE(${jobSubHoursTable.rateSnapshot}, 0)), 0)` })
        .from(jobSubHoursTable).where(eq(jobSubHoursTable.jobId, id)),
      db.select({ total: sql<string>`COALESCE(SUM(${jobSubHoursTable.hours}), 0)` })
        .from(jobSubHoursTable).where(eq(jobSubHoursTable.jobId, id)),
    ]);

    let grossInvoiced = 0;
    let collected = 0;
    for (const inv of invRows) {
      const t = parseFloat(inv.total ?? "0");
      grossInvoiced += t;
      if (inv.status === "paid") collected += t;
    }
    let jobExpenses = 0;
    let flatSubCost = 0; // Subcontractor-category expenses not linked to hours (legacy fallback)
    for (const exp of expRows) {
      if (exp.category === "Owner Draw") continue;
      if (exp.category === "Subcontractor") {
        flatSubCost += parseFloat(exp.amount ?? "0");
      } else {
        jobExpenses += parseFloat(exp.amount ?? "0");
      }
    }

    const hoursLaborCost = parseFloat(subHoursRow?.total ?? "0");
    const totalSubHours = parseFloat(subHoursSum?.total ?? "0");
    // Non-hourly (fixed/allocation) sub cost: prefer sub_payment_records (new ledger),
    // fall back to flat Subcontractor expenses for legacy data pre-Task #892.
    const sprNonHoursCost = parseFloat(sprRow?.[0]?.total ?? "0");
    const nonHoursCost = sprNonHoursCost > 0 ? sprNonHoursCost : flatSubCost;
    // Total sub labor: hourly (hours × rate) + fixed/allocation (cash paid)
    const subLaborCost = hoursLaborCost + nonHoursCost;

    res.json({ grossInvoiced, collected, jobExpenses, subLaborCost, totalSubHours, netProfit: collected - jobExpenses - subLaborCost });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch job profit" });
  }
});

// Batch profit summary: GET /profit-summary?jobIds=1,2,3
router.get("/profit-summary", async (req, res) => {
  try {
    const { jobIds: jobIdsParam } = req.query;
    if (!jobIdsParam || typeof jobIdsParam !== "string") return res.json({});
    const jobIds = jobIdsParam.split(",").map(Number).filter(n => !isNaN(n) && n > 0);
    if (jobIds.length === 0) return res.json({});

    const [invRows, expRows, hoursRows, sprNonHoursRows] = await Promise.all([
      db.select({ jobId: invoicesTable.jobId, total: invoicesTable.total, status: invoicesTable.status })
        .from(invoicesTable).where(inArray(invoicesTable.jobId, jobIds)),
      // Exclude auto-linked sub-hour expenses; Subcontractor category goes into sub labor bucket
      db.select({ jobId: expensesTable.jobId, amount: expensesTable.amount, category: expensesTable.category })
        .from(expensesTable).where(and(inArray(expensesTable.jobId, jobIds), isNull(expensesTable.jobSubHoursId))),
      db.select({
        jobId: jobSubHoursTable.jobId,
        total: sql<string>`COALESCE(SUM(${jobSubHoursTable.hours} * COALESCE(${jobSubHoursTable.rateSnapshot}, 0)), 0)`,
      })
        .from(jobSubHoursTable)
        .where(inArray(jobSubHoursTable.jobId, jobIds))
        .groupBy(jobSubHoursTable.jobId),
      // sub_payment_records for non-hourly (fixed/allocation) subs — new ledger since Task #892
      db.select({
        jobId: subPaymentRecordsTable.jobId,
        total: sql<string>`COALESCE(SUM(${subPaymentRecordsTable.amount}), 0)`,
      })
        .from(subPaymentRecordsTable)
        .innerJoin(jobSubcontractorsTable, and(
          eq(jobSubcontractorsTable.jobId, subPaymentRecordsTable.jobId),
          eq(jobSubcontractorsTable.subcontractorId, subPaymentRecordsTable.subcontractorId),
        ))
        .where(and(
          inArray(subPaymentRecordsTable.jobId, jobIds),
          sql`${subPaymentRecordsTable.isReversal} IS NOT TRUE`,
          sql`${jobSubcontractorsTable.compensationType} = 'fixed'`,
        ))
        .groupBy(subPaymentRecordsTable.jobId),
    ]);

    const hoursMap = new Map(hoursRows.map(r => [r.jobId, parseFloat(r.total ?? "0")]));
    const sprNonHoursMap = new Map(sprNonHoursRows.map(r => [r.jobId, parseFloat(r.total ?? "0")]));
    const flatSubCostMap: Record<number, number> = {};
    for (const id of jobIds) flatSubCostMap[id] = 0;

    const result: Record<number, { grossInvoiced: number; collected: number; jobExpenses: number; subLaborCost: number; netProfit: number }> = {};
    for (const id of jobIds) result[id] = { grossInvoiced: 0, collected: 0, jobExpenses: 0, subLaborCost: 0, netProfit: 0 };

    for (const inv of invRows) {
      if (inv.jobId == null) continue;
      const r = result[inv.jobId];
      if (!r) continue;
      const t = parseFloat(inv.total ?? "0");
      r.grossInvoiced += t;
      if (inv.status === "paid") r.collected += t;
    }
    for (const exp of expRows) {
      if (exp.jobId == null) continue;
      const r = result[exp.jobId];
      if (!r) continue;
      if (exp.category === "Owner Draw") continue;
      if (exp.category === "Subcontractor") {
        flatSubCostMap[exp.jobId] = (flatSubCostMap[exp.jobId] ?? 0) + parseFloat(exp.amount ?? "0");
        continue;
      }
      r.jobExpenses += parseFloat(exp.amount ?? "0");
    }
    for (const id of jobIds) {
      const hoursLaborCost = hoursMap.get(id) ?? 0;
      const sprNonHoursCost = sprNonHoursMap.get(id) ?? 0;
      // Prefer sub_payment_records (new ledger); fall back to flat expense entries (legacy)
      const nonHoursCost = sprNonHoursCost > 0 ? sprNonHoursCost : (flatSubCostMap[id] ?? 0);
      result[id].subLaborCost = hoursLaborCost + nonHoursCost;
      result[id].netProfit = result[id].collected - result[id].jobExpenses - result[id].subLaborCost;
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch profit summary" });
  }
});

// Payment-category expenses for a job (not auto-linked to hours).
// Covers both "Subcontractor" (allocation pay-worker, manual entries) and
// "Labor" (hourly/fixed pay-worker). Used by the Sub Payments tab to determine
// whether "Reset Payment Record" is safe — disabled whenever any row exists here.
router.get("/:id/sub-expenses", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid job id" });
    const rows = await db
      .select({
        id: expensesTable.id,
        subcontractorId: expensesTable.subcontractorId,
        subName: subcontractorsTable.name,
        amount: expensesTable.amount,
        date: expensesTable.date,
        description: expensesTable.description,
      })
      .from(expensesTable)
      .leftJoin(subcontractorsTable, eq(subcontractorsTable.id, expensesTable.subcontractorId))
      .where(and(
        eq(expensesTable.jobId, id),
        inArray(expensesTable.category, ["Subcontractor", "Labor"]),
        isNull(expensesTable.jobSubHoursId),
      ));
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch sub expenses" });
  }
});

router.get("/:id/invoice-draft", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const job = await getJobWithSubs(id);
    if (!job) return res.status(404).json({ error: "Job not found" });

    type ClientRow = typeof clientsTable.$inferSelect;
    const clientResult: ClientRow | null = job.clientId
      ? (await db.select().from(clientsTable).where(eq(clientsTable.id, job.clientId)))[0] ?? null
      : null;

    // Fetch estimates linked to this job and expand their line items
    const estimates = await db.select().from(estimatesTable).where(eq(estimatesTable.jobId, id));

    type InvoiceLine = { description: string; quantity: number; unitPrice: number };
    // Shape of each line item stored in the estimates.line_items jsonb column
    type EstimateLineItem = {
      description?: string;
      quantity?: string | number;
      unitCost?: string | number;
      unitPrice?: string | number;
    };
    function isEstimateLineItem(v: unknown): v is EstimateLineItem {
      return typeof v === "object" && v !== null;
    }
    let lineItems: InvoiceLine[] = [];

    for (const est of estimates) {
      const rawLines = Array.isArray(est.lineItems) ? est.lineItems : [];
      const estLines: EstimateLineItem[] = rawLines.filter(isEstimateLineItem);
      if (estLines.length > 0) {
        // Scale each unit cost by markup × contingency so the expanded line items
        // sum to the same total as the estimate.
        const markup = parseFloat(est.markupPercent ?? "0");
        const contingency = parseFloat(est.contingencyPercent ?? "0");
        const scaleFactor = (1 + markup / 100) * (1 + contingency / 100);
        for (const li of estLines) {
          if (!String(li.description ?? "").trim()) continue;
          const rawUnit = parseFloat(String(li.unitCost ?? li.unitPrice ?? "0"));
          const qty = parseFloat(String(li.quantity ?? "1"));
          lineItems.push({
            description: li.description ?? est.title,
            quantity: qty,
            unitPrice: parseFloat((rawUnit * scaleFactor).toFixed(2)),
          });
        }
      } else {
        // Estimate has no line items — use a single summary line at the estimate total
        lineItems.push({ description: est.title, quantity: 1, unitPrice: parseFloat(est.total ?? "0") });
      }
    }

    // Fall back to a blank line item when no estimates exist
    if (lineItems.length === 0) {
      const locationParts = [job.locationName, job.address, job.city, job.state].filter(Boolean);
      const locationSuffix = locationParts.length ? ` — ${locationParts.join(", ")}` : "";
      lineItems.push({ description: `${job.title}${locationSuffix}`, quantity: 1, unitPrice: 0 });
    }

    // Fetch material lists for this job and compute total with per-list markup
    const lists = await db.select().from(materialListsTable).where(eq(materialListsTable.jobId, id));
    if (lists.length > 0) {
      const listIds = lists.map(l => l.id);
      const allItems = await db.select().from(materialListItemsTable).where(inArray(materialListItemsTable.listId, listIds));
      const itemsByList: Record<number, typeof allItems> = {};
      for (const item of allItems) {
        if (!itemsByList[item.listId]) itemsByList[item.listId] = [];
        itemsByList[item.listId].push(item);
      }
      let materialsTotal = 0;
      for (const list of lists) {
        const markupMult = parseFloat(list.markup ?? "40") / 100 + 1;
        for (const item of itemsByList[list.id] ?? []) {
          materialsTotal += parseFloat(item.unitCostSnapshot ?? "0") * parseFloat(item.qty ?? "1") * markupMult;
        }
      }
      if (materialsTotal > 0) {
        lineItems.push({ description: "Materials", quantity: 1, unitPrice: parseFloat(materialsTotal.toFixed(2)) });
      }
    }

    const draft = {
      clientId: job.clientId ?? null,
      clientName: job.clientName ?? null,
      clientEmail: clientResult?.email ?? null,
      clientAddress: clientResult?.address ?? null,
      clientPhone: clientResult?.phone ?? null,
      clientCity: clientResult?.city ?? null,
      clientState: clientResult?.state ?? null,
      clientZip: clientResult?.zip ?? null,
      jobId: job.id,
      jobTitle: job.title,
      locationName: job.locationName ?? null,
      city: job.city ?? null,
      state: job.state ?? null,
      businessLine: job.businessLine ?? null,
      lineItems,
    };

    res.json(draft);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to build invoice draft" });
  }
});

// Distinct home models for autocomplete — must be before /:id
router.get("/distinct-home-models", async (_req, res) => {
  try {
    const rows = await db
      .selectDistinct({ homeModel: jobsTable.homeModel })
      .from(jobsTable)
      .where(sql`home_model IS NOT NULL AND home_model <> ''`)
      .orderBy(jobsTable.homeModel);
    res.json(rows.map(r => r.homeModel).filter(Boolean));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch home models" });
  }
});

// Batch outstanding-sub check: GET /outstanding-sub-balances?jobIds=1,2,3
// Returns Record<jobId, boolean> — true means job has outstanding fixed/allocation sub balance
router.get("/outstanding-sub-balances", async (req, res) => {
  try {
    const { jobIds: jobIdsParam } = req.query;
    if (!jobIdsParam || typeof jobIdsParam !== "string") return res.json({});
    const jobIds = jobIdsParam.split(",").map(Number).filter(n => !isNaN(n) && n > 0);
    if (jobIds.length === 0) return res.json({});

    const rows = await db.select({ jobId: jobSubcontractorsTable.jobId })
      .from(jobSubcontractorsTable)
      .where(and(
        inArray(jobSubcontractorsTable.jobId, jobIds),
        inArray(jobSubcontractorsTable.paymentStatus, ["unpaid", "partial"]),
        inArray(jobSubcontractorsTable.compensationType, ["fixed", "allocation"]),
      ))
      .groupBy(jobSubcontractorsTable.jobId);

    const hasOutstanding = new Set(rows.map(r => r.jobId).filter((id): id is number => id != null));
    const result: Record<number, boolean> = {};
    for (const id of jobIds) result[id] = hasOutstanding.has(id);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch outstanding sub balances" });
  }
});

// Batch photo counts: GET /photo-counts?jobIds=1,2,3  →  Record<number, number>
// Photos are stored as JSONB arrays in daily_logs.photo_urls
router.get("/photo-counts", async (req, res) => {
  try {
    const { jobIds: jobIdsParam } = req.query;
    if (!jobIdsParam || typeof jobIdsParam !== "string") return res.json({});
    const jobIds = jobIdsParam.split(",").map(Number).filter(n => !isNaN(n) && n > 0);
    if (jobIds.length === 0) return res.json({});

    const rows = await db.select({
      jobId: dailyLogsTable.jobId,
      photoCount: sql<number>`COALESCE(SUM(jsonb_array_length(COALESCE(photo_urls, '[]'::jsonb))), 0)::int`,
    }).from(dailyLogsTable)
      .where(inArray(dailyLogsTable.jobId, jobIds))
      .groupBy(dailyLogsTable.jobId);

    const result: Record<number, number> = {};
    for (const id of jobIds) result[id] = 0;
    for (const row of rows) {
      if (row.jobId != null) result[row.jobId] = row.photoCount;
    }
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch photo counts" });
  }
});

// Closed-jobs CSV export: GET /closed/export
// Must be registered before /:id so "closed" is not parsed as a numeric id.
router.get("/closed/export", async (req, res) => {
  try {
    const { from, to, businessLine } = req.query as Record<string, string | undefined>;

    const conditions: ReturnType<typeof eq>[] = [eq(jobsTable.status, "closed") as ReturnType<typeof eq>];
    if (from) conditions.push(sql`COALESCE(${jobsTable.closedAt}, ${jobsTable.endDate}) >= ${from}` as unknown as ReturnType<typeof eq>);
    if (to)   conditions.push(sql`COALESCE(${jobsTable.closedAt}, ${jobsTable.endDate}) <= ${to}` as unknown as ReturnType<typeof eq>);
    if (businessLine && businessLine !== "all") conditions.push(eq(jobsTable.businessLine, businessLine) as ReturnType<typeof eq>);

    const jobs = await db.select({
      id: jobsTable.id,
      title: jobsTable.title,
      clientName: clientsTable.name,
      address: jobsTable.address,
      city: jobsTable.city,
      state: jobsTable.state,
      locationName: jobsTable.locationName,
      startDate: jobsTable.startDate,
      closedAt: jobsTable.closedAt,
      endDate: jobsTable.endDate,
      businessLine: jobsTable.businessLine,
      subPaid: jobsTable.subPaid,
    })
      .from(jobsTable)
      .leftJoin(clientsTable, eq(jobsTable.clientId, clientsTable.id))
      .where(and(...conditions))
      .orderBy(desc(sql`COALESCE(${jobsTable.closedAt}, ${jobsTable.endDate})`));

    if (jobs.length === 0) {
      return res.json({ rows: [], totals: { revenue: 0, materials: 0, labor: 0, netProfit: 0, count: 0 } });
    }

    const jobIds = jobs.map(j => j.id);

    const [invoiceRows, expenseRows] = await Promise.all([
      db.select({ jobId: invoicesTable.jobId, total: invoicesTable.total, status: invoicesTable.status })
        .from(invoicesTable)
        .where(inArray(invoicesTable.jobId, jobIds)),
      db.select({ jobId: expensesTable.jobId, amount: expensesTable.amount, category: expensesTable.category })
        .from(expensesTable)
        .where(and(inArray(expensesTable.jobId, jobIds), isNull(expensesTable.jobSubHoursId))),
    ]);

    // Best invoice status: paid > overdue > sent > draft
    const STATUS_RANK: Record<string, number> = { paid: 4, overdue: 3, sent: 2, draft: 1 };
    const invoiceByJob = new Map<number, { status: string; revenue: number }>();
    for (const inv of invoiceRows) {
      if (inv.jobId == null) continue;
      const existing = invoiceByJob.get(inv.jobId) ?? { status: "draft", revenue: 0 };
      if ((STATUS_RANK[inv.status] ?? 0) > (STATUS_RANK[existing.status] ?? 0)) existing.status = inv.status;
      if (inv.status === "paid") existing.revenue += parseFloat(inv.total ?? "0");
      invoiceByJob.set(inv.jobId, existing);
    }

    const expensesByJob = new Map<number, { materials: number; labor: number; otherOpex: number }>();
    for (const exp of expenseRows) {
      if (exp.jobId == null) continue;
      const existing = expensesByJob.get(exp.jobId) ?? { materials: 0, labor: 0, otherOpex: 0 };
      const amt = parseFloat(exp.amount ?? "0");
      const cat = (exp.category ?? "").toLowerCase();
      // mileage and owner draw are tracked separately / excluded from operational net profit
      if (cat === "mileage" || cat === "owner draw") { expensesByJob.set(exp.jobId, existing); continue; }
      if (cat === "materials") existing.materials += amt;
      else if (cat === "subcontractor" || cat === "labor") existing.labor += amt;
      else existing.otherOpex += amt;
      expensesByJob.set(exp.jobId, existing);
    }

    const rows = jobs.map(job => {
      const inv = invoiceByJob.get(job.id) ?? { status: "draft", revenue: 0 };
      const exp = expensesByJob.get(job.id) ?? { materials: 0, labor: 0, otherOpex: 0 };

      const dateOpened = job.startDate ?? "";
      const dateClosed = job.closedAt ?? job.endDate ?? "";
      let daysOpen = 0;
      if (dateOpened && dateClosed) {
        daysOpen = Math.max(0, Math.round(
          (new Date(dateClosed).getTime() - new Date(dateOpened).getTime()) / (1000 * 60 * 60 * 24)
        ));
      }

      const revenue = inv.revenue;
      const materials = exp.materials;
      const labor = exp.labor;
      const netProfit = revenue - materials - labor - exp.otherOpex;
      const location = [job.locationName, job.city, job.state].filter(Boolean).join(", ");

      return {
        dateOpened,
        dateClosed,
        daysOpen,
        jobNumber: job.jobNumber ?? job.id,
        businessLine: job.businessLine ?? "",
        jobName: job.title,
        customer: job.clientName ?? "",
        location,
        revenue,
        materials,
        labor,
        netProfit,
        invoiceStatus: inv.status,
        subStatus: job.subPaid ? "Settled" : "Outstanding",
      };
    });

    const totals = rows.reduce(
      (acc, r) => ({ revenue: acc.revenue + r.revenue, materials: acc.materials + r.materials, labor: acc.labor + r.labor, netProfit: acc.netProfit + r.netProfit, count: acc.count + 1 }),
      { revenue: 0, materials: 0, labor: 0, netProfit: 0, count: 0 }
    );

    res.json({ rows, totals });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to export closed jobs" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const job = await getJobWithSubs(id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json(job);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch job" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { title, description, clientId, subcontractorIds, status, jobType, homeModel, mfhManufacturerId, mfhModelId, mfhModelYear, address, city, state, locationName, startDate, endDate, notes, businessLine, subPaid, sqFt, coats, phases, permitChecklist } = req.body;
    if (sqFt != null && (isNaN(parseInt(sqFt)) || parseInt(sqFt) < 0)) return res.status(400).json({ error: "sqFt must be a non-negative integer" });
    if (coats != null && ![1, 2].includes(parseInt(coats))) return res.status(400).json({ error: "coats must be 1 or 2" });

    // Only include fields that were explicitly sent in the request body
    // to avoid wiping existing values (e.g. clientId when only status changes)
    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if ("clientId" in req.body) updates.clientId = clientId || null;
    if (status !== undefined) updates.status = status;
    // Auto-manage closed_at: set when archiving, clear when reopening
    if (status === "closed") {
      const [cur] = await db.select({ closedAt: jobsTable.closedAt }).from(jobsTable).where(eq(jobsTable.id, id));
      if (!cur?.closedAt) updates.closedAt = new Date().toISOString().split("T")[0];
    } else if (status !== undefined) {
      updates.closedAt = null;
    }
    if (jobType !== undefined) updates.jobType = jobType;
    if ("homeModel" in req.body) updates.homeModel = homeModel || null;
    if ("mfhManufacturerId" in req.body) updates.mfhManufacturerId = mfhManufacturerId != null ? parseInt(mfhManufacturerId) : null;
    if ("mfhModelId" in req.body) updates.mfhModelId = mfhModelId != null ? parseInt(mfhModelId) : null;
    if ("mfhModelYear" in req.body) updates.mfhModelYear = mfhModelYear != null ? parseInt(mfhModelYear) : null;
    if (address !== undefined) updates.address = address;
    if (city !== undefined) updates.city = city;
    if (state !== undefined) updates.state = state;
    if (locationName !== undefined) updates.locationName = locationName;
    if (startDate !== undefined) updates.startDate = startDate;
    if (endDate !== undefined) updates.endDate = endDate;
    if (notes !== undefined) updates.notes = notes;
    if ("businessLine" in req.body) updates.businessLine = businessLine || null;
    if ("subPaid" in req.body) updates.subPaid = subPaid === true;
    if ("sqFt" in req.body) updates.sqFt = sqFt != null ? parseInt(sqFt) : null;
    if ("coats" in req.body) updates.coats = coats != null ? parseInt(coats) : null;
    if ("phases" in req.body) {
      try { updates.phases = parsePhases(phases); } catch (e: unknown) { return res.status(400).json({ error: e instanceof Error ? e.message : "Invalid phases" }); }
    }
    if ("permitChecklist" in req.body) {
      try { updates.permitChecklist = parsePermitChecklist(permitChecklist); } catch (e: unknown) { return res.status(400).json({ error: e instanceof Error ? e.message : "Invalid permitChecklist" }); }
    }

    const [job] = await db.update(jobsTable).set(updates).where(eq(jobsTable.id, id)).returning();
    if (!job) return res.status(404).json({ error: "Job not found" });

    if (Array.isArray(subcontractorIds)) {
      await replaceSubcontractors(id, subcontractorIds);
    }

    // When a job is marked completed, ensure the draft invoice includes the
    // latest materials totals so it's ready to review without extra steps.
    if (status === "completed" || status === "invoiced") {
      await syncMaterialsToJobInvoice(id);
    }

    const result = await getJobWithSubs(id);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update job" });
  }
});

router.put("/:jobId/sub-payments/:subId", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const subId = parseInt(req.params.subId);
    if (isNaN(jobId) || isNaN(subId)) return res.status(400).json({ error: "Invalid ids" });
    // Strip paymentStatus — it is always derived server-side from the numbers, never accepted from the client.
    const { amountOwed, amountPaid, paidDate, paidNotes, compensationType, hourlyRate, fixedAmount, allocationPct } = req.body;
    const updates: Record<string, unknown> = {};
    if (amountOwed !== undefined) updates.amountOwed = amountOwed != null ? String(amountOwed) : null;
    if (amountPaid !== undefined) updates.amountPaid = amountPaid != null ? String(amountPaid) : null;
    if (paidDate !== undefined) updates.paidDate = paidDate || null;
    if (paidNotes !== undefined) updates.paidNotes = paidNotes || null;
    if (compensationType !== undefined) updates.compensationType = compensationType || "hourly";
    if (hourlyRate !== undefined) updates.hourlyRate = hourlyRate != null ? String(hourlyRate) : null;
    if (fixedAmount !== undefined) updates.fixedAmount = fixedAmount != null ? String(fixedAmount) : null;
    if (allocationPct !== undefined) updates.allocationPct = allocationPct != null ? String(allocationPct) : null;
    // Upsert: creates the sub-job link if it doesn't exist yet, then updates payment fields.
    // This allows recording a payment even when the sub was never formally assigned to the job.
    const [row] = await db.insert(jobSubcontractorsTable)
      .values({ jobId, subcontractorId: subId, ...updates })
      .onConflictDoUpdate({
        target: [jobSubcontractorsTable.jobId, jobSubcontractorsTable.subcontractorId],
        set: updates,
      })
      .returning();

    // Derive paymentStatus from the four-rule formula — status is never accepted from the client.
    //   amountPaid = null/0  → "unpaid"
    //   0 < paid < owed      → "partial"
    //   paid = owed          → "paid"
    //   paid > owed          → "paid" + isOverpaid flag
    const paidNum = row.amountPaid != null ? parseFloat(row.amountPaid) : null;
    const compType = row.compensationType ?? "hourly";

    let effectiveOwed: number | null = null;
    if (row.amountOwed != null) {
      effectiveOwed = parseFloat(row.amountOwed);
    } else if (compType === "fixed" && row.fixedAmount != null) {
      effectiveOwed = parseFloat(row.fixedAmount);
    } else if (compType === "hourly") {
      const [hoursRow] = await db
        .select({ total: sql<string>`COALESCE(SUM(${jobSubHoursTable.hours} * COALESCE(${jobSubHoursTable.rateSnapshot}, 0)), 0)` })
        .from(jobSubHoursTable)
        .where(and(eq(jobSubHoursTable.jobId, jobId), eq(jobSubHoursTable.subcontractorId, subId)));
      const hoursTotal = parseFloat(hoursRow?.total ?? "0");
      if (hoursTotal > 0) effectiveOwed = hoursTotal;
    } else if (compType === "allocation" && row.allocationPct != null) {
      const pool = await computeAllocationSplitPool(jobId);
      effectiveOwed = pool.splitPool * (parseFloat(row.allocationPct) / 100);
    }

    let newStatus: string;
    let isOverpaid = false;
    let overpaidBy = 0;

    if (paidNum == null || paidNum <= 0) {
      newStatus = "unpaid";
    } else if (effectiveOwed == null || effectiveOwed <= 0) {
      newStatus = "partial";
    } else if (paidNum >= effectiveOwed - 0.005) {
      newStatus = "paid";
      if (paidNum > effectiveOwed + 0.005) {
        isOverpaid = true;
        overpaidBy = parseFloat((paidNum - effectiveOwed).toFixed(2));
      }
    } else {
      newStatus = "partial";
    }

    await db.update(jobSubcontractorsTable)
      .set({ paymentStatus: newStatus })
      .where(and(eq(jobSubcontractorsTable.jobId, jobId), eq(jobSubcontractorsTable.subcontractorId, subId)));

    const allPaid = await recomputeSubPaid(jobId);

    res.json({
      jobId: row.jobId, subcontractorId: row.subcontractorId,
      amountOwed: row.amountOwed != null ? parseFloat(row.amountOwed) : null,
      amountPaid: row.amountPaid != null ? parseFloat(row.amountPaid) : null,
      paidDate: row.paidDate, paidNotes: row.paidNotes,
      paymentStatus: newStatus,
      isOverpaid,
      overpaidBy,
      allSubsPaid: allPaid,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update sub payment" });
  }
});

router.get("/:id/sub-payments", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid job id" });
    const rows = await db
      .select({
        subcontractorId: jobSubcontractorsTable.subcontractorId,
        subName: subcontractorsTable.name,
        amountOwedOverride: jobSubcontractorsTable.amountOwed,
        amountPaid: jobSubcontractorsTable.amountPaid,
        paidDate: jobSubcontractorsTable.paidDate,
        paidNotes: jobSubcontractorsTable.paidNotes,
        payRate: subcontractorsTable.payRate,
        payType: subcontractorsTable.payType,
        role: subcontractorsTable.role,
        growthPct: subcontractorsTable.growthPct,
        compensationType: jobSubcontractorsTable.compensationType,
        hourlyRate: jobSubcontractorsTable.hourlyRate,
        fixedAmount: jobSubcontractorsTable.fixedAmount,
        allocationPct: jobSubcontractorsTable.allocationPct,
        paymentStatus: jobSubcontractorsTable.paymentStatus,
        paidAt: jobSubcontractorsTable.paidAt,
        lastPaidAt: jobSubcontractorsTable.lastPaidAt,
        computedOwed: sql<string>`COALESCE((
          SELECT SUM(${jobSubHoursTable.hours} * COALESCE(${jobSubHoursTable.rateSnapshot}, 0))
          FROM ${jobSubHoursTable}
          WHERE ${jobSubHoursTable.jobId} = ${id}
            AND ${jobSubHoursTable.subcontractorId} = ${jobSubcontractorsTable.subcontractorId}
        ), 0)`,
        totalHours: sql<string>`COALESCE((
          SELECT SUM(${jobSubHoursTable.hours})
          FROM ${jobSubHoursTable}
          WHERE ${jobSubHoursTable.jobId} = ${id}
            AND ${jobSubHoursTable.subcontractorId} = ${jobSubcontractorsTable.subcontractorId}
        ), 0)`,
      })
      .from(jobSubcontractorsTable)
      .leftJoin(subcontractorsTable, eq(jobSubcontractorsTable.subcontractorId, subcontractorsTable.id))
      .where(eq(jobSubcontractorsTable.jobId, id));
    // Fetch all individual payment records for this job in one query,
    // newest first. Grouped by sub so each row can include its history.
    const paymentRecords = await db
      .select({
        subcontractorId: subPaymentRecordsTable.subcontractorId,
        paymentDate: subPaymentRecordsTable.paymentDate,
        amount: subPaymentRecordsTable.amount,
      })
      .from(subPaymentRecordsTable)
      .where(eq(subPaymentRecordsTable.jobId, id))
      .orderBy(desc(subPaymentRecordsTable.paymentDate), desc(subPaymentRecordsTable.id));

    const historyMap: Record<number, { date: string; amount: number }[]> = {};
    for (const rec of paymentRecords) {
      const subId = rec.subcontractorId;
      if (subId == null) continue;
      if (!historyMap[subId]) historyMap[subId] = [];
      historyMap[subId].push({ date: rec.paymentDate ?? "", amount: parseFloat(rec.amount ?? "0") });
    }

    res.json(rows.map(r => {
      const computedOwed = parseFloat(r.computedOwed ?? "0");
      const manualOverride = r.amountOwedOverride != null ? parseFloat(r.amountOwedOverride) : null;
      const compType = r.compensationType ?? "hourly";
      // For fixed/allocation, amountOwed is null unless manually overridden —
      // their owed amounts are fixedAmount / allocationPct×pool, resolved in the UI.
      // For hourly, fall back to computedOwed (hours × rate) when no override.
      const amountOwed = manualOverride != null
        ? manualOverride
        : compType === "hourly"
          ? computedOwed
          : null;
      const amountPaid = r.amountPaid != null ? parseFloat(r.amountPaid) : null;
      const balance = amountOwed != null && amountPaid != null ? Math.max(0, amountOwed - amountPaid) : null;
      const percentComplete = amountOwed != null && amountOwed > 0 && amountPaid != null
        ? Math.min(100, Math.round((amountPaid / amountOwed) * 100))
        : null;
      return {
        subcontractorId: r.subcontractorId,
        subName: r.subName,
        amountOwed,
        computedOwed,
        amountOwedIsManual: manualOverride != null,
        amountPaid,
        balance,
        percentComplete,
        paidDate: r.paidDate,
        paidNotes: r.paidNotes,
        payRate: r.payRate != null ? parseFloat(r.payRate) : null,
        payType: r.payType,
        role: r.role ?? "hourly",
        growthPct: r.growthPct != null ? parseFloat(r.growthPct) : 0,
        compensationType: r.compensationType ?? "hourly",
        hourlyRate: r.hourlyRate != null ? parseFloat(r.hourlyRate) : null,
        fixedAmount: r.fixedAmount != null ? parseFloat(r.fixedAmount) : null,
        allocationPct: r.allocationPct != null ? parseFloat(r.allocationPct) : null,
        paymentStatus: r.paymentStatus ?? "unpaid",
        paidAt: r.paidAt ?? null,
        lastPaidAt: r.lastPaidAt ?? null,
        totalHours: parseFloat(r.totalHours ?? "0"),
        paymentHistory: historyMap[r.subcontractorId ?? -1] ?? [],
      };
    }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch sub payments" });
  }
});

router.post("/:id/pay-worker/:subId", async (req, res) => {
  // Declared at handler scope so the catch block can reference it for idempotency race recovery
  const idempotencyKey: string | null = req.body.idempotencyKey ? String(req.body.idempotencyKey) : null;
  try {
    const jobId = parseInt(req.params.id);
    const subId = parseInt(req.params.subId);
    if (isNaN(jobId) || isNaN(subId)) return res.status(400).json({ error: "Invalid ids" });

    const [job] = await db.select({ businessLine: jobsTable.businessLine }).from(jobsTable).where(eq(jobsTable.id, jobId));
    if (!job) return res.status(404).json({ error: "Job not found" });

    // Payment amount validated before entering transaction
    const paymentAmount = parseFloat(String(req.body.amount ?? "0"));
    if (paymentAmount <= 0) return res.status(400).json({ error: "No amount to pay" });

    const today = new Date().toISOString();
    const paymentDateStr = today.split("T")[0]; // YYYY-MM-DD for sub_payment_records
    const subName = String(req.body.subName ?? `Sub #${subId}`);
    const clientAgreedOwed = req.body.agreedOwed != null ? parseFloat(String(req.body.agreedOwed)) : null;

    // Idempotency fast-path — check outside transaction for known-processed keys
    if (idempotencyKey) {
      const [existing] = await db.select({ id: subPaymentRecordsTable.id, amount: subPaymentRecordsTable.amount })
        .from(subPaymentRecordsTable)
        .where(eq(subPaymentRecordsTable.idempotencyKey, idempotencyKey));
      if (existing) {
        return res.json({ ok: true, duplicate: true, paymentId: existing.id, amount: parseFloat(existing.amount), accumulated: 0, status: "duplicate" });
      }
    }

    // All state reads and writes happen inside a single transaction with a row-level lock
    // (SELECT FOR UPDATE) so concurrent payment calls cannot both read stale prevPaid
    // and overwrite each other's accumulated total.
    let txResult: { ok: true; paymentId: number; amount: number; accumulated: number; status: string } | null = null;
    await db.transaction(async (tx) => {
      // Lock the row for this transaction — prevents concurrent pay-worker calls
      // from reading stale amountPaid and computing the wrong accumulated total.
      const [subRow] = await tx.select({
        compensationType: jobSubcontractorsTable.compensationType,
        fixedAmount: jobSubcontractorsTable.fixedAmount,
        allocationPct: jobSubcontractorsTable.allocationPct,
        amountOwed: jobSubcontractorsTable.amountOwed,
        amountPaid: jobSubcontractorsTable.amountPaid,
        paymentStatus: jobSubcontractorsTable.paymentStatus,
        paidAt: jobSubcontractorsTable.paidAt,
      }).from(jobSubcontractorsTable).where(and(
        eq(jobSubcontractorsTable.jobId, jobId),
        eq(jobSubcontractorsTable.subcontractorId, subId)
      )).for("update");

      if (!subRow) throw Object.assign(new Error("NOT_FOUND"), { notFound: true });
      if (subRow.paymentStatus === "paid") throw Object.assign(new Error("ALREADY_PAID"), { alreadyPaid: true });

      const compType = subRow.compensationType ?? "hourly";
      const typeLabel = compType === "allocation" ? "Allocation Pay" : compType === "fixed" ? "Fixed Pay" : "Labor Pay";

      // Agreed owed: DB override → client-supplied → fixedAmount (fixed only)
      const dbOwedOverride = subRow.amountOwed != null ? parseFloat(subRow.amountOwed) : null;
      const agreedOwed = dbOwedOverride
        ?? clientAgreedOwed
        ?? (compType === "fixed" ? parseFloat(subRow.fixedAmount ?? "0") : null);

      // Accumulate — prevPaid is read inside the lock, safe from concurrent mutation
      const prevPaid = subRow.amountPaid != null ? parseFloat(subRow.amountPaid) : 0;
      const newAccumulated = prevPaid + paymentAmount;

      // Status: "paid" if accumulated >= agreed owed
      const newStatus: "paid" | "partial" =
        agreedOwed != null && newAccumulated < agreedOwed - 0.005 ? "partial" : "paid";

      // paidAt = first payment date (set once); lastPaidAt = most recent
      const newPaidAt = subRow.paidAt ?? today;

      // Lock the agreed owed amount on first payment so future revenue changes
      // cannot shift the balance. Only set when no override exists yet and the
      // client supplied an agreedOwed value. Hourly subs don't send agreedOwed
      // — their obligation is hours × rate and doesn't drift.
      const lockAmountOwed =
        dbOwedOverride == null && clientAgreedOwed != null && clientAgreedOwed > 0
          ? clientAgreedOwed.toFixed(2)
          : undefined;

      await tx.update(jobSubcontractorsTable).set({
        paymentStatus: newStatus,
        paidAt: newPaidAt,
        lastPaidAt: today,
        amountPaid: newAccumulated.toFixed(2),
        ...(lockAmountOwed !== undefined ? { amountOwed: lockAmountOwed } : {}),
      }).where(and(
        eq(jobSubcontractorsTable.jobId, jobId),
        eq(jobSubcontractorsTable.subcontractorId, subId),
      ));

      const [spr] = await tx.insert(subPaymentRecordsTable).values({
        jobId,
        subcontractorId: subId,
        businessLine: job.businessLine,
        amount: paymentAmount.toFixed(2),
        paymentDate: paymentDateStr,
        description: `${subName} — ${typeLabel}`,
        createdFrom: "pay-worker",
        ...(idempotencyKey ? { idempotencyKey } : {}),
        ...(agreedOwed != null ? { agreedOwedSnapshot: agreedOwed.toFixed(2) } : {}),
      }).returning({ id: subPaymentRecordsTable.id });

      txResult = { ok: true, paymentId: spr.id, amount: paymentAmount, accumulated: newAccumulated, status: newStatus };
    });

    await recomputeSubPaid(jobId);
    res.json(txResult ?? { ok: true });
  } catch (err: any) {
    if (err?.alreadyPaid) return res.json({ ok: true, alreadyPaid: true });
    if (err?.notFound) return res.status(404).json({ error: "Sub not assigned to this job" });
    // Idempotency: unique constraint violation on idempotency_key from a race — fetch and return existing
    if ((err?.code === "23505" || err?.constraint?.includes("idempotency_key")) && idempotencyKey) {
      const [existing] = await db.select({ id: subPaymentRecordsTable.id, amount: subPaymentRecordsTable.amount })
        .from(subPaymentRecordsTable)
        .where(eq(subPaymentRecordsTable.idempotencyKey, idempotencyKey));
      if (existing) return res.json({ ok: true, duplicate: true, paymentId: existing.id, amount: parseFloat(existing.amount), accumulated: 0, status: "duplicate" });
    }
    console.error(err);
    res.status(500).json({ error: "Failed to record payment" });
  }
});

router.post("/:id/record-owner-draw", async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid job id" });
    const amount = parseFloat(String(req.body.amount ?? "0"));
    if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: "Invalid amount" });
    const [job] = await db.select({ businessLine: jobsTable.businessLine }).from(jobsTable).where(eq(jobsTable.id, jobId));
    const today = new Date().toISOString().split("T")[0];
    const description = String(req.body.description ?? `Owner Draw — Job ${jobId}`);

    // Idempotency: return existing draw if same job/description/date/amount already recorded
    const [existing] = await db.select({ id: expensesTable.id })
      .from(expensesTable)
      .where(and(
        eq(expensesTable.jobId, jobId),
        eq(expensesTable.category, "Owner Draw"),
        eq(expensesTable.date, today),
        eq(expensesTable.description, description),
      ));
    if (existing) return res.json({ ok: true, expenseId: existing.id, alreadyExists: true });

    const [exp] = await db.insert(expensesTable).values({
      description,
      amount: String(amount),
      category: "Owner Draw",
      date: today,
      jobId,
      businessLine: job?.businessLine,
    }).returning();
    res.status(201).json({ ok: true, expenseId: exp.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to record owner draw" });
  }
});

// Record expense entries for unpaid fixed/allocation subs without changing paymentStatus.
// Used by "Complete Job & Keep As Outstanding" flow so costs land in the books immediately.
// Amounts and categories are derived server-side to match pay-worker accounting rules:
//   fixed → category "Labor", amount = fixedAmount
//   allocation → category "Subcontractor", amount = allocationPct * toSplit
router.post("/:id/record-sub-expenses", async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid job id" });

    // 1. Fetch all unpaid/partial fixed/allocation subs from DB
    const unpaidSubs = await db.select({
      subcontractorId: jobSubcontractorsTable.subcontractorId,
      compensationType: jobSubcontractorsTable.compensationType,
      fixedAmount: jobSubcontractorsTable.fixedAmount,
      allocationPct: jobSubcontractorsTable.allocationPct,
    })
      .from(jobSubcontractorsTable)
      .where(and(
        eq(jobSubcontractorsTable.jobId, jobId),
        inArray(jobSubcontractorsTable.paymentStatus, ["unpaid", "partial"]),
        inArray(jobSubcontractorsTable.compensationType, ["fixed", "allocation"]),
      ));
    if (unpaidSubs.length === 0) return res.json({ ok: true, created: 0 });

    const [jobRow] = await db.select({ businessLine: jobsTable.businessLine }).from(jobsTable).where(eq(jobsTable.id, jobId));
    const today = new Date().toISOString().split("T")[0];

    // 2. Compute toSplit for allocation subs — shared helper (allocation.ts)
    let toSplit = 0;
    const hasAllocation = unpaidSubs.some(s => s.compensationType === "allocation");
    if (hasAllocation) {
      const pool = await computeAllocationSplitPool(jobId);
      toSplit = pool.splitPool;
    }

    // 3. Fetch sub names
    const subIds = unpaidSubs.map(s => s.subcontractorId);
    const subNameRows = await db.select({ id: subcontractorsTable.id, name: subcontractorsTable.name })
      .from(subcontractorsTable).where(inArray(subcontractorsTable.id, subIds));
    const nameMap = new Map(subNameRows.map(s => [s.id, s.name ?? `Sub #${s.id}`]));

    // 4. Create expense entries — category and amount mirror pay-worker exactly
    let created = 0;
    for (const sub of unpaidSubs) {
      const compType = sub.compensationType ?? "fixed";
      // Mirror pay-worker: fixed → Labor, allocation → Subcontractor
      const category = compType === "fixed" ? "Labor" : "Subcontractor";
      let amount = 0;
      if (compType === "fixed") {
        amount = parseFloat(sub.fixedAmount ?? "0");
      } else if (compType === "allocation") {
        amount = toSplit * (parseFloat(sub.allocationPct ?? "0") / 100);
      }
      if (amount <= 0) continue; // skip allocation subs with no invoice yet

      // Idempotent: skip if non-hours-linked expense already exists for this sub+job+category
      const [existing] = await db.select({ id: expensesTable.id })
        .from(expensesTable)
        .where(and(
          eq(expensesTable.jobId, jobId),
          eq(expensesTable.subcontractorId, sub.subcontractorId),
          eq(expensesTable.category, category),
          isNull(expensesTable.jobSubHoursId),
        ));
      if (existing) continue;

      const subName = nameMap.get(sub.subcontractorId) ?? `Sub #${sub.subcontractorId}`;
      const typeLabel = compType === "allocation" ? "Allocation Pay" : "Fixed Pay";
      await db.insert(expensesTable).values({
        description: `${subName} — ${typeLabel} (outstanding)`,
        amount: amount.toFixed(2),
        category,
        date: today,
        jobId,
        subcontractorId: sub.subcontractorId,
        businessLine: jobRow?.businessLine,
      });
      created++;
    }
    res.json({ ok: true, created });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to record sub expenses" });
  }
});

// PATCH /:id/sub-payments/:subId — update (or clear) agreed owed override on job_subcontractors.
// Send { amountOwed: number } to set an override, or { amountOwed: null } to clear it
// (falling back to the computed/fixedAmount value).
router.patch("/:id/sub-payments/:subId", async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    const subId = parseInt(req.params.subId);
    if (isNaN(jobId) || isNaN(subId)) return res.status(400).json({ error: "Invalid ids" });
    const { amountOwed } = req.body;

    let newValue: string | null;
    if (amountOwed === null || amountOwed === undefined) {
      newValue = null; // clear override — fall back to fixedAmount / computed
    } else {
      const parsed = parseFloat(String(amountOwed));
      if (isNaN(parsed) || parsed < 0) return res.status(400).json({ error: "amountOwed must be a non-negative number or null" });
      newValue = parsed.toFixed(2);
    }

    // Fetch current paid amount so we can recompute paymentStatus after the owed change
    const [current] = await db.select({
      amountPaid: jobSubcontractorsTable.amountPaid,
      fixedAmount: jobSubcontractorsTable.fixedAmount,
      compensationType: jobSubcontractorsTable.compensationType,
    }).from(jobSubcontractorsTable).where(and(
      eq(jobSubcontractorsTable.jobId, jobId),
      eq(jobSubcontractorsTable.subcontractorId, subId),
    ));
    if (!current) return res.status(404).json({ error: "Sub not found on this job" });

    const paid = current.amountPaid != null ? parseFloat(current.amountPaid) : 0;
    // Effective new owed: override ?? fixedAmount (allocation falls back to null — not recomputable here)
    const effectiveOwed = newValue != null
      ? parseFloat(newValue)
      : current.compensationType === "fixed" && current.fixedAmount != null
        ? parseFloat(current.fixedAmount)
        : null;

    let newStatus: "unpaid" | "partial" | "paid";
    if (effectiveOwed != null) {
      if (paid >= effectiveOwed - 0.005) newStatus = "paid";
      else if (paid > 0) newStatus = "partial";
      else newStatus = "unpaid";
    } else {
      // No owed baseline to compare against — use paid amount as indicator
      newStatus = paid > 0 ? "partial" : "unpaid";
    }

    await db.update(jobSubcontractorsTable).set({
      amountOwed: newValue,
      paymentStatus: newStatus,
    }).where(and(
      eq(jobSubcontractorsTable.jobId, jobId),
      eq(jobSubcontractorsTable.subcontractorId, subId),
    ));
    res.json({ ok: true, amountOwed: newValue, paymentStatus: newStatus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update agreed owed" });
  }
});

// Outstanding unpaid fixed/allocation subs for a single job — used by the job card banner
router.get("/:id/outstanding-sub-payments", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid job id" });
    const rows = await db.select({
      subcontractorId: jobSubcontractorsTable.subcontractorId,
      subName: subcontractorsTable.name,
      compensationType: jobSubcontractorsTable.compensationType,
      fixedAmount: jobSubcontractorsTable.fixedAmount,
      allocationPct: jobSubcontractorsTable.allocationPct,
      amountOwed: jobSubcontractorsTable.amountOwed,
      amountPaid: jobSubcontractorsTable.amountPaid,
      paymentStatus: jobSubcontractorsTable.paymentStatus,
    })
      .from(jobSubcontractorsTable)
      .leftJoin(subcontractorsTable, eq(jobSubcontractorsTable.subcontractorId, subcontractorsTable.id))
      .where(and(
        eq(jobSubcontractorsTable.jobId, id),
        inArray(jobSubcontractorsTable.paymentStatus, ["unpaid", "partial"]),
        inArray(jobSubcontractorsTable.compensationType, ["fixed", "allocation"]),
      ));
    res.json(rows.map(r => ({
      subcontractorId: r.subcontractorId,
      subName: r.subName ?? `Sub #${r.subcontractorId}`,
      compensationType: r.compensationType ?? "fixed",
      fixedAmount: r.fixedAmount != null ? parseFloat(r.fixedAmount) : null,
      allocationPct: r.allocationPct != null ? parseFloat(r.allocationPct) : null,
      amountOwed: r.amountOwed != null ? parseFloat(r.amountOwed) : null,
      amountPaid: r.amountPaid != null ? parseFloat(r.amountPaid) : 0,
      paymentStatus: r.paymentStatus ?? "unpaid",
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch outstanding sub payments" });
  }
});

router.get("/:id/related-counts", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid job id" });
    const [[dl], [ex], [ml], [re], [inv]] = await Promise.all([
      db.select({ n: count() }).from(dailyLogsTable).where(eq(dailyLogsTable.jobId, id)),
      db.select({ n: count() }).from(expensesTable).where(eq(expensesTable.jobId, id)),
      db.select({ n: count() }).from(mileageLogsTable).where(eq(mileageLogsTable.jobId, id)),
      db.select({ n: count() }).from(recurringExpensesTable).where(eq(recurringExpensesTable.jobId, id)),
      db.select({ n: count() }).from(invoicesTable).where(eq(invoicesTable.jobId, id)),
    ]);
    res.json({
      dailyLogs: dl.n,
      expenses: ex.n,
      mileageLogs: ml.n,
      recurringExpenses: re.n,
      invoices: inv.n,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch related counts" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid job id" });
    await db.transaction(async (tx) => {
      await tx.delete(dailyLogsTable).where(eq(dailyLogsTable.jobId, id));
      await tx.delete(mileageLogsTable).where(eq(mileageLogsTable.jobId, id));
      await tx.delete(recurringExpensesTable).where(eq(recurringExpensesTable.jobId, id));
      await tx.delete(expensesTable).where(eq(expensesTable.jobId, id));
      await tx.delete(jobSubcontractorsTable).where(eq(jobSubcontractorsTable.jobId, id));
      await tx.update(estimatesTable).set({ jobId: null }).where(eq(estimatesTable.jobId, id));
      await tx.update(invoicesTable).set({ jobId: null }).where(eq(invoicesTable.jobId, id));
      await tx.delete(jobsTable).where(eq(jobsTable.id, id));
    });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete job" });
  }
});

// ─── Toggle owner pay inclusion per job ──────────────────────────────────────
router.patch("/:id/owner-pay-included", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid job id" });
    const { included } = req.body as { included: boolean };
    if (typeof included !== "boolean") return res.status(400).json({ error: "included must be boolean" });
    await db.update(jobsTable).set({ ownerPayIncluded: included }).where(eq(jobsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update" });
  }
});

export default router;
