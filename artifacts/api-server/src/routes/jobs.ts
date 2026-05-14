import { Router } from "express";
import { db } from "@workspace/db";
import { jobsTable, clientsTable, jobSubcontractorsTable, subcontractorsTable, dailyLogsTable, expensesTable, mileageLogsTable, recurringExpensesTable, estimatesTable, materialListsTable, materialListItemsTable, invoicesTable } from "@workspace/db/schema";
import { eq, and, count, inArray } from "drizzle-orm";
import { syncMaterialsToJobInvoice } from "./material-lists";

const router = Router();

type JobRow = {
  id: number;
  title: string;
  description: string | null;
  clientId: number | null;
  clientName: string | null;
  status: string;
  jobType: string | null;
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
  await db.delete(jobSubcontractorsTable).where(eq(jobSubcontractorsTable.jobId, jobId));
  if (ids.length > 0) {
    await db.insert(jobSubcontractorsTable).values(
      ids.map(sid => ({ jobId, subcontractorId: sid }))
    );
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
    const { title, description, clientId, subcontractorIds = [], status, jobType, address, city, state, locationName, startDate, endDate, notes, businessLine, sqFt, coats } = req.body;
    if (!title) return res.status(400).json({ error: "Title is required" });
    if (sqFt != null && (isNaN(parseInt(sqFt)) || parseInt(sqFt) < 0)) return res.status(400).json({ error: "sqFt must be a non-negative integer" });
    if (coats != null && ![1, 2].includes(parseInt(coats))) return res.status(400).json({ error: "coats must be 1 or 2" });

    const [job] = await db.insert(jobsTable).values({
      title, description,
      clientId: clientId || null,
      status: status || "scheduled",
      jobType, address, city, state, locationName,
      startDate, endDate,
      notes,
      businessLine: businessLine || null,
      sqFt: sqFt != null ? parseInt(sqFt) : null,
      coats: coats != null ? parseInt(coats) : null,
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
      db.select({ amount: expensesTable.amount, category: expensesTable.category })
        .from(expensesTable).where(eq(expensesTable.jobId, id)),
    ]);

    let grossInvoiced = 0;
    let collected = 0;
    for (const inv of invRows) {
      const t = parseFloat(inv.total ?? "0");
      grossInvoiced += t;
      if (inv.status === "paid") collected += t;
    }
    let jobExpenses = 0;
    for (const exp of expRows) {
      if (exp.category !== "Owner Draw") jobExpenses += parseFloat(exp.amount ?? "0");
    }

    res.json({ grossInvoiced, collected, jobExpenses, netProfit: collected - jobExpenses });
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
      db.select({ jobId: expensesTable.jobId, amount: expensesTable.amount, category: expensesTable.category })
        .from(expensesTable).where(inArray(expensesTable.jobId, jobIds)),
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
    const { title, description, clientId, subcontractorIds, status, jobType, address, city, state, locationName, startDate, endDate, notes, businessLine, subPaid, sqFt, coats } = req.body;
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
