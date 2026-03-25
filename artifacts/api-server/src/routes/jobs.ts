import { Router } from "express";
import { db } from "@workspace/db";
import { jobsTable, clientsTable, subcontractorsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";

const router = Router();

const jobSelect = {
  id: jobsTable.id,
  title: jobsTable.title,
  description: jobsTable.description,
  clientId: jobsTable.clientId,
  clientName: clientsTable.name,
  subcontractorId: jobsTable.subcontractorId,
  subcontractorName: subcontractorsTable.name,
  status: jobsTable.status,
  jobType: jobsTable.jobType,
  address: jobsTable.address,
  city: jobsTable.city,
  state: jobsTable.state,
  startDate: jobsTable.startDate,
  endDate: jobsTable.endDate,
  estimatedAmount: jobsTable.estimatedAmount,
  actualAmount: jobsTable.actualAmount,
  notes: jobsTable.notes,
  createdAt: jobsTable.createdAt,
};

router.get("/", async (req, res) => {
  try {
    const { status, clientId, subcontractorId } = req.query;
    const conditions = [];
    if (status) conditions.push(eq(jobsTable.status, status as string));
    if (clientId) conditions.push(eq(jobsTable.clientId, parseInt(clientId as string)));
    if (subcontractorId) conditions.push(eq(jobsTable.subcontractorId, parseInt(subcontractorId as string)));

    const jobs = await db
      .select(jobSelect)
      .from(jobsTable)
      .leftJoin(clientsTable, eq(jobsTable.clientId, clientsTable.id))
      .leftJoin(subcontractorsTable, eq(jobsTable.subcontractorId, subcontractorsTable.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(jobsTable.createdAt);

    res.json(jobs.map(j => ({ ...j, createdAt: j.createdAt.toISOString() })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { title, description, clientId, subcontractorId, status, jobType, address, city, state, startDate, endDate, estimatedAmount, actualAmount, notes } = req.body;
    if (!title) return res.status(400).json({ error: "Title is required" });

    const [job] = await db.insert(jobsTable).values({
      title, description,
      clientId: clientId || null,
      subcontractorId: subcontractorId || null,
      status: status || "scheduled",
      jobType, address, city, state, startDate, endDate,
      estimatedAmount: estimatedAmount?.toString(),
      actualAmount: actualAmount?.toString(),
      notes
    }).returning();

    const [withRels] = await db
      .select(jobSelect)
      .from(jobsTable)
      .leftJoin(clientsTable, eq(jobsTable.clientId, clientsTable.id))
      .leftJoin(subcontractorsTable, eq(jobsTable.subcontractorId, subcontractorsTable.id))
      .where(eq(jobsTable.id, job.id));

    res.status(201).json({ ...withRels, createdAt: withRels.createdAt.toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create job" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [job] = await db
      .select(jobSelect)
      .from(jobsTable)
      .leftJoin(clientsTable, eq(jobsTable.clientId, clientsTable.id))
      .leftJoin(subcontractorsTable, eq(jobsTable.subcontractorId, subcontractorsTable.id))
      .where(eq(jobsTable.id, id));
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json({ ...job, createdAt: job.createdAt.toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch job" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { title, description, clientId, subcontractorId, status, jobType, address, city, state, startDate, endDate, estimatedAmount, actualAmount, notes } = req.body;

    const [job] = await db.update(jobsTable).set({
      title, description,
      clientId: clientId || null,
      subcontractorId: subcontractorId || null,
      status, jobType, address, city, state, startDate, endDate,
      estimatedAmount: estimatedAmount?.toString(),
      actualAmount: actualAmount?.toString(),
      notes
    }).where(eq(jobsTable.id, id)).returning();
    if (!job) return res.status(404).json({ error: "Job not found" });

    const [withRels] = await db
      .select(jobSelect)
      .from(jobsTable)
      .leftJoin(clientsTable, eq(jobsTable.clientId, clientsTable.id))
      .leftJoin(subcontractorsTable, eq(jobsTable.subcontractorId, subcontractorsTable.id))
      .where(eq(jobsTable.id, id));

    res.json({ ...withRels, createdAt: withRels.createdAt.toISOString() });
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
