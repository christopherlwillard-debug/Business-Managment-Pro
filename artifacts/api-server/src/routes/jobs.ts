import { Router } from "express";
import { db } from "@workspace/db";
import { jobsTable, clientsTable, jobSubcontractorsTable, subcontractorsTable, invoicesTable } from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";

const router = Router();

function formatJob(row: any): any {
  return {
    ...row,
    estimatedAmount: row.estimatedAmount ? parseFloat(row.estimatedAmount) : null,
    actualAmount: row.actualAmount ? parseFloat(row.actualAmount) : null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    subcontractorIds: row.subcontractorIds ?? [],
    subcontractorNames: row.subcontractorNames ?? [],
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
      estimatedAmount: jobsTable.estimatedAmount,
      actualAmount: jobsTable.actualAmount,
      notes: jobsTable.notes,
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
        estimatedAmount: jobsTable.estimatedAmount,
        actualAmount: jobsTable.actualAmount,
        notes: jobsTable.notes,
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

    const jobMap = new Map<number, any>();
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
    const { title, description, clientId, subcontractorIds = [], status, jobType, address, city, state, locationName, startDate, endDate, estimatedAmount, actualAmount, notes } = req.body;
    if (!title) return res.status(400).json({ error: "Title is required" });

    const [job] = await db.insert(jobsTable).values({
      title, description,
      clientId: clientId || null,
      status: status || "scheduled",
      jobType, address, city, state, locationName,
      startDate, endDate,
      estimatedAmount: estimatedAmount?.toString(),
      actualAmount: actualAmount?.toString(),
      notes,
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

router.get("/:id/invoice-draft", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const job = await getJobWithSubs(id);
    if (!job) return res.status(404).json({ error: "Job not found" });

    const [client] = job.clientId
      ? await db.select().from(clientsTable).where(eq(clientsTable.id, job.clientId))
      : [null];

    const draft = {
      clientId: job.clientId ?? null,
      clientName: job.clientName ?? null,
      clientEmail: (client as any)?.email ?? null,
      clientAddress: (client as any)?.address ?? null,
      clientPhone: (client as any)?.phone ?? null,
      clientCity: (client as any)?.city ?? null,
      clientState: (client as any)?.state ?? null,
      clientZip: (client as any)?.zip ?? null,
      jobId: job.id,
      jobTitle: job.title,
      locationName: job.locationName ?? null,
      city: job.city ?? null,
      state: job.state ?? null,
      lineItems: job.estimatedAmount
        ? [{ description: job.title, quantity: 1, unitPrice: job.estimatedAmount }]
        : [],
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
    const { title, description, clientId, subcontractorIds, status, jobType, address, city, state, locationName, startDate, endDate, estimatedAmount, actualAmount, notes } = req.body;

    const [job] = await db.update(jobsTable).set({
      title, description,
      clientId: clientId || null,
      status, jobType, address, city, state, locationName,
      startDate, endDate,
      estimatedAmount: estimatedAmount?.toString(),
      actualAmount: actualAmount?.toString(),
      notes,
    }).where(eq(jobsTable.id, id)).returning();
    if (!job) return res.status(404).json({ error: "Job not found" });

    if (Array.isArray(subcontractorIds)) {
      await replaceSubcontractors(id, subcontractorIds);
    }

    const result = await getJobWithSubs(id);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update job" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(jobsTable).where(eq(jobsTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete job" });
  }
});

export default router;
