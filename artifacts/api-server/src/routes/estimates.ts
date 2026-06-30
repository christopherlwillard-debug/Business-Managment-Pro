import { Router } from "express";
import { db } from "@workspace/db";
import { estimatesTable, clientsTable, jobsTable } from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";

const router = Router();

function calcTotals(lineItems: any[], markupPercent: number | null, contingencyPercent: number | null) {
  const subtotal = lineItems.reduce((s, li) => s + parseFloat(li.quantity) * parseFloat(li.unitCost), 0);
  const withMarkup = markupPercent ? subtotal * (1 + markupPercent / 100) : subtotal;
  const total = contingencyPercent ? withMarkup * (1 + contingencyPercent / 100) : withMarkup;
  return { subtotal, total };
}

function format(e: any, clientName?: string | null, jobTitle?: string | null) {
  const lineItems = Array.isArray(e.lineItems) ? e.lineItems : [];
  return {
    ...e,
    clientName: clientName ?? null,
    jobTitle: jobTitle ?? null,
    subtotal: parseFloat(e.subtotal ?? "0"),
    markupPercent: e.markupPercent ? parseFloat(e.markupPercent) : null,
    contingencyPercent: e.contingencyPercent ? parseFloat(e.contingencyPercent) : null,
    total: parseFloat(e.total ?? "0"),
    lineItems: lineItems.map((li: any, i: number) => ({
      id: li.id ?? i + 1,
      category: li.category,
      description: li.description,
      quantity: parseFloat(li.quantity),
      unit: li.unit ?? null,
      unitCost: parseFloat(li.unitCost),
      total: parseFloat(li.quantity) * parseFloat(li.unitCost),
    })),
    createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
  };
}

router.get("/", async (req, res) => {
  try {
    const estimates = await db
      .select({ ...estimatesTable, clientName: clientsTable.name, jobTitle: jobsTable.title })
      .from(estimatesTable)
      .leftJoin(clientsTable, eq(estimatesTable.clientId, clientsTable.id))
      .leftJoin(jobsTable, eq(estimatesTable.jobId, jobsTable.id))
      .orderBy(estimatesTable.createdAt);
    res.json(estimates.map(e => format(e, e.clientName, e.jobTitle)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch estimates" });
  }
});

router.get("/by-job/:jobId", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid jobId" });
    const estimates = await db
      .select({ ...estimatesTable, clientName: clientsTable.name })
      .from(estimatesTable)
      .leftJoin(clientsTable, eq(estimatesTable.clientId, clientsTable.id))
      .where(eq(estimatesTable.jobId, jobId))
      .orderBy(asc(estimatesTable.createdAt));
    res.json(estimates.map(e => format(e, e.clientName)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch estimates" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { title, clientId, template, status, markupPercent, contingencyPercent, jobType, notes, lineItems = [], jobId, businessLine } = req.body;
    if (!title) return res.status(400).json({ error: "Title is required" });
    const { subtotal, total } = calcTotals(lineItems, markupPercent, contingencyPercent);

    const [estimate] = await db.insert(estimatesTable).values({
      title, clientId: clientId || null, template,
      status: status || "draft",
      subtotal: subtotal.toString(),
      markupPercent: markupPercent?.toString() ?? null,
      contingencyPercent: contingencyPercent?.toString() ?? null,
      total: total.toString(),
      jobType, notes,
      lineItems: lineItems.map((li: any, i: number) => ({ ...li, id: i + 1 })),
      jobId: jobId || null,
      businessLine: businessLine || null,
    }).returning();

    let clientName = null;
    if (estimate.clientId) {
      const [c] = await db.select().from(clientsTable).where(eq(clientsTable.id, estimate.clientId));
      clientName = c?.name;
    }
    res.status(201).json(format(estimate, clientName));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create estimate" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const [e] = await db
      .select({ ...estimatesTable, clientName: clientsTable.name, jobTitle: jobsTable.title })
      .from(estimatesTable)
      .leftJoin(clientsTable, eq(estimatesTable.clientId, clientsTable.id))
      .leftJoin(jobsTable, eq(estimatesTable.jobId, jobsTable.id))
      .where(eq(estimatesTable.id, parseInt(req.params.id)));
    if (!e) return res.status(404).json({ error: "Estimate not found" });
    res.json(format(e, e.clientName, e.jobTitle));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch estimate" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { title, clientId, template, status, markupPercent, contingencyPercent, jobType, notes, lineItems = [], jobId, businessLine } = req.body;
    const { subtotal, total } = calcTotals(lineItems, markupPercent, contingencyPercent);

    await db.update(estimatesTable).set({
      title, clientId: clientId || null, template, status,
      subtotal: subtotal.toString(),
      markupPercent: markupPercent?.toString() ?? null,
      contingencyPercent: contingencyPercent?.toString() ?? null,
      total: total.toString(),
      jobType, notes,
      lineItems: lineItems.map((li: any, i: number) => ({ ...li, id: i + 1 })),
      jobId: jobId !== undefined ? (jobId || null) : undefined,
      ...(businessLine !== undefined ? { businessLine: businessLine || null } : {}),
    }).where(eq(estimatesTable.id, id));

    const [e] = await db.select({ ...estimatesTable, clientName: clientsTable.name }).from(estimatesTable).leftJoin(clientsTable, eq(estimatesTable.clientId, clientsTable.id)).where(eq(estimatesTable.id, id));
    if (!e) return res.status(404).json({ error: "Estimate not found" });
    res.json(format(e, e.clientName));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update estimate" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await db.delete(estimatesTable).where(eq(estimatesTable.id, parseInt(req.params.id)));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete estimate" });
  }
});

router.post("/:id/convert-to-job", async (req, res) => {
  try {
    const [estimate] = await db.select({ ...estimatesTable, clientName: clientsTable.name }).from(estimatesTable).leftJoin(clientsTable, eq(estimatesTable.clientId, clientsTable.id)).where(eq(estimatesTable.id, parseInt(req.params.id)));
    if (!estimate) return res.status(404).json({ error: "Estimate not found" });

    const [job] = await db.insert(jobsTable).values({
      title: estimate.title,
      clientId: estimate.clientId,
      status: "scheduled",
      jobType: estimate.jobType,
      notes: estimate.notes,
    }).returning();

    await db.update(estimatesTable).set({ status: "won" }).where(eq(estimatesTable.id, estimate.id));
    res.status(201).json({ ...job, createdAt: job.createdAt.toISOString(), clientName: estimate.clientName ?? null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to convert estimate to job" });
  }
});

export default router;
