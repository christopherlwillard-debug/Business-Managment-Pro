import { Router } from "express";
import { db } from "@workspace/db";
import { jobsTable, clientsTable, jobSubcontractorsTable, subcontractorsTable, dailyLogsTable, expensesTable, mileageLogsTable, recurringExpensesTable, estimatesTable, materialListsTable, materialListItemsTable, invoicesTable, jobSubHoursTable, phaseItemSchema, permitChecklistItemSchema } from "@workspace/db/schema";
import { eq, and, count, inArray, sql, isNull } from "drizzle-orm";
import { syncMaterialsToJobInvoice } from "./material-lists";
import { z } from "zod/v4";

const router = Router();

// Shared helper — recompute and persist jobs.sub_paid from per-sub payment/hour data.
// Call this any time sub_hours or sub_payments change for a job.
export async function recomputeSubPaid(jobId: number): Promise<boolean> {
  const allRows = await db.select({
    amountOwed: jobSubcontractorsTable.amountOwed,
    amountPaid: jobSubcontractorsTable.amountPaid,
    computedOwed: sql<string>`COALESCE((
      SELECT SUM(h.hours * COALESCE(h.rate_snapshot, 0))
      FROM job_sub_hours h
      WHERE h.job_id = ${jobId} AND h.subcontractor_id = ${jobSubcontractorsTable.subcontractorId}
    ), 0)`,
  }).from(jobSubcontractorsTable).where(eq(jobSubcontractorsTable.jobId, jobId));

  const allPaid = allRows.length > 0 && allRows.every(r => {
    const owed = r.amountOwed != null ? parseFloat(r.amountOwed) : parseFloat(r.computedOwed ?? "0");
    const paid = r.amountPaid != null ? parseFloat(r.amountPaid) : 0;
    return owed <= 0 || paid >= owed;
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
  status: string;
  jobType: string | null;
  homeModel: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  locationName: string | null;
  startDate: string | null;
  endDate: string | null;
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
      status: jobsTable.status,
      jobType: jobsTable.jobType,
      homeModel: jobsTable.homeModel,
      address: jobsTable.address,
      city: jobsTable.city,
      state: jobsTable.state,
      locationName: jobsTable.locationName,
      startDate: jobsTable.startDate,
      endDate: jobsTable.endDate,
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
        status: jobsTable.status,
        jobType: jobsTable.jobType,
        address: jobsTable.address,
        city: jobsTable.city,
        state: jobsTable.state,
        locationName: jobsTable.locationName,
        startDate: jobsTable.startDate,
        endDate: jobsTable.endDate,
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
    const { title, description, clientId, subcontractorIds = [], status, jobType, homeModel, address, city, state, locationName, startDate, endDate, notes, businessLine, sqFt, coats, phases, permitChecklist } = req.body;
    if (!title) return res.status(400).json({ error: "Title is required" });
    if (sqFt != null && (isNaN(parseInt(sqFt)) || parseInt(sqFt) < 0)) return res.status(400).json({ error: "sqFt must be a non-negative integer" });
    if (coats != null && ![1, 2].includes(parseInt(coats))) return res.status(400).json({ error: "coats must be 1 or 2" });

    let parsedPhases;
    try { parsedPhases = parsePhases(phases); } catch (e: unknown) { return res.status(400).json({ error: e instanceof Error ? e.message : "Invalid phases" }); }

    let parsedPermitChecklist;
    try { parsedPermitChecklist = parsePermitChecklist(permitChecklist); } catch (e: unknown) { return res.status(400).json({ error: e instanceof Error ? e.message : "Invalid permitChecklist" }); }

    const [job] = await db.insert(jobsTable).values({
      title, description,
      clientId: clientId || null,
      status: status || "scheduled",
      jobType, homeModel: homeModel || null, address, city, state, locationName,
      startDate, endDate,
      notes,
      businessLine: businessLine || null,
      sqFt: sqFt != null ? parseInt(sqFt) : null,
      coats: coats != null ? parseInt(coats) : null,
      phases: parsedPhases,
      permitChecklist: parsedPermitChecklist,
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

    const [invRows, expRows] = await Promise.all([
      db.select({ total: invoicesTable.total, status: invoicesTable.status })
        .from(invoicesTable).where(eq(invoicesTable.jobId, id)),
      // Fetch all expenses not auto-linked to a sub-hours row.
      // Subcontractor-category expenses are moved into the sub labor bucket below
      // so they never double-count with hours-based sub labor cost.
      db.select({ amount: expensesTable.amount, category: expensesTable.category })
        .from(expensesTable).where(and(eq(expensesTable.jobId, id), isNull(expensesTable.jobSubHoursId))),
    ]);

    let grossInvoiced = 0;
    let collected = 0;
    for (const inv of invRows) {
      const t = parseFloat(inv.total ?? "0");
      grossInvoiced += t;
      if (inv.status === "paid") collected += t;
    }
    let jobExpenses = 0;
    let flatSubCost = 0; // Subcontractor-category expenses not linked to hours
    for (const exp of expRows) {
      if (exp.category === "Owner Draw") continue;
      if (exp.category === "Subcontractor") {
        // Keep sub costs in the sub labor bucket, not in general job expenses
        flatSubCost += parseFloat(exp.amount ?? "0");
      } else {
        jobExpenses += parseFloat(exp.amount ?? "0");
      }
    }

    const [subHoursRow] = await db
      .select({ total: sql<string>`COALESCE(SUM(${jobSubHoursTable.hours} * COALESCE(${jobSubHoursTable.rateSnapshot}, 0)), 0)` })
      .from(jobSubHoursTable)
      .where(eq(jobSubHoursTable.jobId, id));
    const hoursLaborCost = parseFloat(subHoursRow?.total ?? "0");

    const [subHoursSum] = await db
      .select({ total: sql<string>`COALESCE(SUM(${jobSubHoursTable.hours}), 0)` })
      .from(jobSubHoursTable)
      .where(eq(jobSubHoursTable.jobId, id));
    const totalSubHours = parseFloat(subHoursSum?.total ?? "0");

    // If hours are tracked, those expenses are the authoritative sub cost (auto-expenses
    // from hours carry jobSubHoursId and were already excluded above). If no hours exist,
    // fall back to flat sub expenses so flat-rate subs still show up.
    const subLaborCost = hoursLaborCost > 0 ? hoursLaborCost : flatSubCost;

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

    const [invRows, expRows] = await Promise.all([
      db.select({ jobId: invoicesTable.jobId, total: invoicesTable.total, status: invoicesTable.status })
        .from(invoicesTable).where(inArray(invoicesTable.jobId, jobIds)),
      // Exclude auto-linked sub-hour expenses; Subcontractor category goes into sub labor bucket
      db.select({ jobId: expensesTable.jobId, amount: expensesTable.amount, category: expensesTable.category })
        .from(expensesTable).where(and(inArray(expensesTable.jobId, jobIds), isNull(expensesTable.jobSubHoursId))),
    ]);

    const result: Record<number, { grossInvoiced: number; collected: number; jobExpenses: number; netProfit: number }> = {};
    for (const id of jobIds) result[id] = { grossInvoiced: 0, collected: 0, jobExpenses: 0, netProfit: 0 };

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
      if (exp.category === "Subcontractor") continue; // sub costs shown in Sub Labor Cost, not here
      r.jobExpenses += parseFloat(exp.amount ?? "0");
    }
    for (const id of jobIds) result[id].netProfit = result[id].collected - result[id].jobExpenses;

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch profit summary" });
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
    const { title, description, clientId, subcontractorIds, status, jobType, homeModel, address, city, state, locationName, startDate, endDate, notes, businessLine, subPaid, sqFt, coats, phases, permitChecklist } = req.body;
    if (sqFt != null && (isNaN(parseInt(sqFt)) || parseInt(sqFt) < 0)) return res.status(400).json({ error: "sqFt must be a non-negative integer" });
    if (coats != null && ![1, 2].includes(parseInt(coats))) return res.status(400).json({ error: "coats must be 1 or 2" });

    // Only include fields that were explicitly sent in the request body
    // to avoid wiping existing values (e.g. clientId when only status changes)
    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if ("clientId" in req.body) updates.clientId = clientId || null;
    if (status !== undefined) updates.status = status;
    if (jobType !== undefined) updates.jobType = jobType;
    if ("homeModel" in req.body) updates.homeModel = homeModel || null;
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
    const { amountOwed, amountPaid, paidDate, paidNotes } = req.body;
    const updates: Record<string, unknown> = {};
    if (amountOwed !== undefined) updates.amountOwed = amountOwed != null ? String(amountOwed) : null;
    if (amountPaid !== undefined) updates.amountPaid = amountPaid != null ? String(amountPaid) : null;
    if (paidDate !== undefined) updates.paidDate = paidDate || null;
    if (paidNotes !== undefined) updates.paidNotes = paidNotes || null;
    const [row] = await db.update(jobSubcontractorsTable)
      .set(updates)
      .where(and(eq(jobSubcontractorsTable.jobId, jobId), eq(jobSubcontractorsTable.subcontractorId, subId)))
      .returning();
    if (!row) return res.status(404).json({ error: "Sub-job link not found" });

    const allPaid = await recomputeSubPaid(jobId);

    res.json({
      jobId: row.jobId, subcontractorId: row.subcontractorId,
      amountOwed: row.amountOwed != null ? parseFloat(row.amountOwed) : null,
      amountPaid: row.amountPaid != null ? parseFloat(row.amountPaid) : null,
      paidDate: row.paidDate, paidNotes: row.paidNotes,
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
    res.json(rows.map(r => {
      const computedOwed = parseFloat(r.computedOwed ?? "0");
      const manualOverride = r.amountOwedOverride != null ? parseFloat(r.amountOwedOverride) : null;
      const amountOwed = manualOverride != null ? manualOverride : computedOwed;
      return {
        subcontractorId: r.subcontractorId,
        subName: r.subName,
        amountOwed,
        computedOwed,
        amountOwedIsManual: manualOverride != null,
        amountPaid: r.amountPaid != null ? parseFloat(r.amountPaid) : null,
        paidDate: r.paidDate,
        paidNotes: r.paidNotes,
        payRate: r.payRate != null ? parseFloat(r.payRate) : null,
        payType: r.payType,
        totalHours: parseFloat(r.totalHours ?? "0"),
      };
    }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch sub payments" });
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

export default router;
