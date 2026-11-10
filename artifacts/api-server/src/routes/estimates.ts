import { Router } from "express";
import { db } from "@workspace/db";
import { estimatesTable, clientsTable, jobsTable } from "@workspace/db/schema";
import { eq, asc, getTableColumns } from "drizzle-orm";
import {
  canonicalRecordBusiness,
  generalContractingBusiness,
  resolveMutationBusiness,
  type BusinessScope,
} from "../lib/business-scope.js";
import { calculateEstimateTotals, estimateLineAmount } from "../lib/estimate-totals.js";

const router = Router();

async function resolveLinkedJobOwner(jobId: number): Promise<
  | { ok: true; business: BusinessScope }
  | { ok: false; status: 400 | 409; error: string }
> {
  const [job] = await db.select({
    id: jobsTable.id,
    businessId: jobsTable.businessId,
    businessLine: jobsTable.businessLine,
  }).from(jobsTable).where(eq(jobsTable.id, jobId));
  if (!job) return { ok: false, status: 400, error: "Job not found" };

  const ownership = await canonicalRecordBusiness(job);
  if (ownership.state === "invalid") {
    return { ok: false, status: 409, error: "Linked job has invalid business ownership" };
  }
  const business = ownership.state === "resolved"
    ? ownership.business
    : await generalContractingBusiness();
  if (!business) {
    return { ok: false, status: 409, error: "General Contracting business was not found" };
  }
  return { ok: true, business };
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
      total: estimateLineAmount(li),
    })),
    createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
  };
}

function joinAddress(parts: Array<string | null | undefined>): string | null {
  const address = parts.map(part => part?.trim()).filter(Boolean).join(", ");
  return address || null;
}

async function resolveWorkAddress(
  workAddress: unknown,
  clientId: unknown,
  jobId: unknown,
): Promise<string | null> {
  if (typeof workAddress === "string" && workAddress.trim()) return workAddress.trim();
  if (jobId) {
    const [job] = await db.select({
      address: jobsTable.address,
      city: jobsTable.city,
      state: jobsTable.state,
    }).from(jobsTable).where(eq(jobsTable.id, Number(jobId)));
    const jobAddress = job ? joinAddress([job.address, job.city, job.state]) : null;
    if (jobAddress) return jobAddress;
  }
  if (clientId) {
    const [client] = await db.select({
      address: clientsTable.address,
      city: clientsTable.city,
      state: clientsTable.state,
      zip: clientsTable.zip,
    }).from(clientsTable).where(eq(clientsTable.id, Number(clientId)));
    return client ? joinAddress([client.address, client.city, client.state, client.zip]) : null;
  }
  return null;
}

router.get("/", async (req, res) => {
  try {
    const estimates = await db
      .select({ ...getTableColumns(estimatesTable), clientName: clientsTable.name, jobTitle: jobsTable.title })
      .from(estimatesTable)
      .leftJoin(clientsTable, eq(estimatesTable.clientId, clientsTable.id))
      .leftJoin(jobsTable, eq(estimatesTable.jobId, jobsTable.id))
      .orderBy(estimatesTable.createdAt);
    res.json(estimates.map(e => format(e as any, (e as any).clientName, (e as any).jobTitle)));
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
      .select({ ...getTableColumns(estimatesTable), clientName: clientsTable.name })
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
    const { title, clientId, template, status, markupPercent, contingencyPercent, jobType, notes, lineItems = [], jobId, workAddress } = req.body;
    if (!title) return res.status(400).json({ error: "Title is required" });
    const requestedOwner = await resolveMutationBusiness(req);
    if (!requestedOwner.ok) return res.status(400).json({ error: requestedOwner.error });

    let owner = requestedOwner.business;
    if (jobId) {
      const linkedOwner = await resolveLinkedJobOwner(Number(jobId));
      if (!linkedOwner.ok) return res.status(linkedOwner.status).json({ error: linkedOwner.error });
      if (requestedOwner.explicit && requestedOwner.business.id !== linkedOwner.business.id) {
        return res.status(409).json({ error: "Estimate business conflicts with the linked job" });
      }
      owner = linkedOwner.business;
    }

    const { subtotal, total } = calculateEstimateTotals(lineItems, markupPercent, contingencyPercent);
    const savedWorkAddress = await resolveWorkAddress(workAddress, clientId, jobId);

    const [estimate] = await db.insert(estimatesTable).values({
      title, clientId: clientId || null, template,
      status: status || "draft",
      subtotal: subtotal.toString(),
      markupPercent: markupPercent?.toString() ?? null,
      contingencyPercent: contingencyPercent?.toString() ?? null,
      total: total.toString(),
      jobType, notes, workAddress: savedWorkAddress,
      lineItems: lineItems.map((li: any, i: number) => ({ ...li, id: i + 1 })),
      jobId: jobId || null,
      businessId: owner.id,
      businessLine: owner.slug,
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
      .select({ ...getTableColumns(estimatesTable), clientName: clientsTable.name, jobTitle: jobsTable.title })
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
    const { title, clientId, template, status, markupPercent, contingencyPercent, jobType, notes, lineItems = [], jobId, workAddress } = req.body;
    const [currentEstimate] = await db.select({
      id: estimatesTable.id,
      businessId: estimatesTable.businessId,
      businessLine: estimatesTable.businessLine,
      jobId: estimatesTable.jobId,
      workAddress: estimatesTable.workAddress,
    }).from(estimatesTable).where(eq(estimatesTable.id, id));
    if (!currentEstimate) return res.status(404).json({ error: "Estimate not found" });

    const requestedOwner = await resolveMutationBusiness(req);
    if (!requestedOwner.ok) return res.status(400).json({ error: requestedOwner.error });
    const currentOwnership = await canonicalRecordBusiness(currentEstimate);
    if (currentOwnership.state === "invalid") {
      return res.status(409).json({ error: "Estimate has an unknown business owner" });
    }

    const effectiveJobId = jobId !== undefined ? (jobId || null) : currentEstimate.jobId;
    let owner: BusinessScope | null = requestedOwner.explicit
      ? requestedOwner.business
      : currentOwnership.state === "resolved"
        ? currentOwnership.business
        : null;
    if (effectiveJobId) {
      const linkedOwner = await resolveLinkedJobOwner(Number(effectiveJobId));
      if (!linkedOwner.ok) return res.status(linkedOwner.status).json({ error: linkedOwner.error });
      if (requestedOwner.explicit && requestedOwner.business.id !== linkedOwner.business.id) {
        return res.status(409).json({ error: "Estimate business conflicts with the linked job" });
      }
      owner = linkedOwner.business;
    }

    const { subtotal, total } = calculateEstimateTotals(lineItems, markupPercent, contingencyPercent);
    const savedWorkAddress = Object.prototype.hasOwnProperty.call(req.body, "workAddress")
      ? await resolveWorkAddress(workAddress, clientId, effectiveJobId)
      : currentEstimate.workAddress;

    await db.update(estimatesTable).set({
      title, clientId: clientId || null, template, status,
      subtotal: subtotal.toString(),
      markupPercent: markupPercent?.toString() ?? null,
      contingencyPercent: contingencyPercent?.toString() ?? null,
      total: total.toString(),
      jobType, notes, workAddress: savedWorkAddress,
      lineItems: lineItems.map((li: any, i: number) => ({ ...li, id: i + 1 })),
      jobId: jobId !== undefined ? (jobId || null) : undefined,
      businessId: owner?.id ?? null,
      businessLine: owner?.slug ?? null,
    }).where(eq(estimatesTable.id, id));

    const [e] = await db.select({ ...getTableColumns(estimatesTable), clientName: clientsTable.name }).from(estimatesTable).leftJoin(clientsTable, eq(estimatesTable.clientId, clientsTable.id)).where(eq(estimatesTable.id, id));
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
    const [estimate] = await db.select({ ...getTableColumns(estimatesTable), clientName: clientsTable.name }).from(estimatesTable).leftJoin(clientsTable, eq(estimatesTable.clientId, clientsTable.id)).where(eq(estimatesTable.id, parseInt(req.params.id)));
    if (!estimate) return res.status(404).json({ error: "Estimate not found" });
    const recordedOwnership = await canonicalRecordBusiness(estimate);
    if (recordedOwnership.state === "invalid") {
      return res.status(409).json({ error: "Estimate has an unknown business owner" });
    }
    const owner = recordedOwnership.state === "resolved"
      ? recordedOwnership.business
      : await generalContractingBusiness();
    if (!owner) return res.status(409).json({ error: "General Contracting business was not found" });

    const [job] = await db.insert(jobsTable).values({
      title: estimate.title,
      clientId: estimate.clientId,
      address: estimate.workAddress,
      status: "scheduled",
      jobType: estimate.jobType,
      notes: estimate.notes,
      businessId: owner.id,
      businessLine: owner.slug,
    }).returning();

    await db.update(estimatesTable).set({ status: "won" }).where(eq(estimatesTable.id, estimate.id));
    res.status(201).json({ ...job, createdAt: job.createdAt.toISOString(), clientName: estimate.clientName ?? null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to convert estimate to job" });
  }
});

export default router;
