import { Router } from "express";
import { db } from "@workspace/db";
import {
  jobLaborEntriesTable,
  jobKnowledgeRecordsTable,
  jobsTable,
  invoicesTable,
  expensesTable,
  mfhModelsTable,
  mfhManufacturersTable,
} from "@workspace/db/schema";
import { eq, sql, and, inArray } from "drizzle-orm";

const router = Router();

// ── helpers ────────────────────────────────────────────────────────────────────

function parseDaysOnSite(startDate: string | null | undefined, endDate: string | null | undefined): number {
  if (!startDate || !endDate) return 1;
  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diff = Math.round((end.getTime() - start.getTime()) / 86400000);
    return Math.max(1, diff + 1);
  } catch { return 1; }
}

async function computeDraft(jobId: number) {
  const [job] = await db.select({
    startDate: jobsTable.startDate,
    endDate: jobsTable.endDate,
    mfhModelId: jobsTable.mfhModelId,
    mfhManufacturerId: jobsTable.mfhManufacturerId,
  }).from(jobsTable).where(eq(jobsTable.id, jobId));

  const [laborAgg] = await db.select({
    productiveHours: sql<string>`COALESCE(SUM(productive_hours::numeric), 0)`,
    travelHours: sql<string>`COALESCE(SUM(travel_hours::numeric), 0)`,
    crewSize: sql<number>`COUNT(*)`,
  }).from(jobLaborEntriesTable).where(eq(jobLaborEntriesTable.jobId, jobId));

  const [invoiceAgg] = await db.select({
    total: sql<string>`COALESCE(SUM(total::numeric), 0)`,
  }).from(invoicesTable).where(
    and(eq(invoicesTable.jobId, jobId), sql`status NOT IN ('draft','void')`)
  );

  const expenseRows = await db.select({
    category: expensesTable.category,
    total: sql<string>`SUM(amount::numeric)`,
  }).from(expensesTable)
    .where(eq(expensesTable.jobId, jobId))
    .groupBy(expensesTable.category);

  let materialCost = 0;
  let consumablesCost = 0;
  let totalExpenses = 0;
  for (const r of expenseRows) {
    const amt = parseFloat(r.total ?? "0");
    totalExpenses += amt;
    const cat = (r.category ?? "").toLowerCase();
    if (cat.includes("material")) materialCost += amt;
    else if (cat.includes("consumable")) consumablesCost += amt;
  }

  const invoiceAmount = parseFloat(invoiceAgg?.total ?? "0");
  const grossProfit = invoiceAmount - materialCost - consumablesCost;
  const netProfit = invoiceAmount - totalExpenses;

  let builderNameSnapshot: string | null = null;
  let modelNameSnapshot: string | null = null;
  if (job?.mfhModelId) {
    const [modelRow] = await db.select({
      name: mfhModelsTable.name,
      mfgName: mfhManufacturersTable.name,
    }).from(mfhModelsTable)
      .leftJoin(mfhManufacturersTable, eq(mfhModelsTable.manufacturerId, mfhManufacturersTable.id))
      .where(eq(mfhModelsTable.id, job.mfhModelId));
    builderNameSnapshot = modelRow?.mfgName ?? null;
    modelNameSnapshot = modelRow?.name ?? null;
  }

  return {
    isDraft: true,
    jobId,
    mfhModelId: job?.mfhModelId ?? null,
    builderId: job?.mfhManufacturerId ?? null,
    builderNameSnapshot,
    modelNameSnapshot,
    status: "draft",
    taughtAt: null,
    productiveHours: parseFloat(laborAgg?.productiveHours ?? "0"),
    travelHours: parseFloat(laborAgg?.travelHours ?? "0"),
    crewSize: Number(laborAgg?.crewSize ?? 0),
    daysOnSite: parseDaysOnSite(job?.startDate, job?.endDate),
    invoiceAmount: invoiceAmount || null,
    materialCost: materialCost || null,
    consumablesCost: consumablesCost || null,
    grossProfit: grossProfit || null,
    netProfit: netProfit || null,
    callbacks: 0,
    warrantyVisit: false,
    missingMaterialsNotes: null,
    factoryDefectNotes: null,
    originalProductiveHours: null,
    editReason: null,
    editedAt: null,
  };
}

// ── Labor Entries ──────────────────────────────────────────────────────────────

// GET /jobs/:jobId/labor-entries
router.get("/:jobId/labor-entries", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid jobId" });

    const entries = await db.select().from(jobLaborEntriesTable)
      .where(eq(jobLaborEntriesTable.jobId, jobId))
      .orderBy(jobLaborEntriesTable.createdAt);

    const [agg] = await db.select({
      totalProductiveHours: sql<string>`COALESCE(SUM(productive_hours::numeric), 0)`,
      totalTravelHours: sql<string>`COALESCE(SUM(travel_hours::numeric), 0)`,
      crewCount: sql<number>`COUNT(*)`,
    }).from(jobLaborEntriesTable).where(eq(jobLaborEntriesTable.jobId, jobId));

    res.json({
      entries,
      summary: {
        crewCount: Number(agg?.crewCount ?? 0),
        totalProductiveHours: parseFloat(agg?.totalProductiveHours ?? "0"),
        totalTravelHours: parseFloat(agg?.totalTravelHours ?? "0"),
        totalHours: parseFloat(agg?.totalProductiveHours ?? "0") + parseFloat(agg?.totalTravelHours ?? "0"),
      },
    });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

// POST /jobs/:jobId/labor-entries
router.post("/:jobId/labor-entries", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid jobId" });

    const { personName, workerType, linkedSubcontractorId, productiveHours, travelHours } = req.body;
    if (!personName) return res.status(400).json({ error: "personName required" });

    const [entry] = await db.insert(jobLaborEntriesTable).values({
      jobId,
      personName: String(personName),
      workerType: workerType || "sub",
      linkedSubcontractorId: linkedSubcontractorId ? parseInt(linkedSubcontractorId) : null,
      productiveHours: String(parseFloat(productiveHours ?? "0") || 0),
      travelHours: String(parseFloat(travelHours ?? "0") || 0),
    }).returning();

    res.status(201).json(entry);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

// PATCH /jobs/:jobId/labor-entries/:entryId
router.patch("/:jobId/labor-entries/:entryId", async (req, res) => {
  try {
    const entryId = parseInt(req.params.entryId);
    if (isNaN(entryId)) return res.status(400).json({ error: "Invalid entryId" });

    const { personName, workerType, linkedSubcontractorId, productiveHours, travelHours } = req.body;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (personName !== undefined) updates.personName = String(personName);
    if (workerType !== undefined) updates.workerType = workerType;
    if ("linkedSubcontractorId" in req.body) updates.linkedSubcontractorId = linkedSubcontractorId ? parseInt(linkedSubcontractorId) : null;
    if (productiveHours !== undefined) updates.productiveHours = String(parseFloat(productiveHours) || 0);
    if (travelHours !== undefined) updates.travelHours = String(parseFloat(travelHours) || 0);

    const [entry] = await db.update(jobLaborEntriesTable).set(updates).where(eq(jobLaborEntriesTable.id, entryId)).returning();
    if (!entry) return res.status(404).json({ error: "Not found" });
    res.json(entry);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

// DELETE /jobs/:jobId/labor-entries/:entryId
router.delete("/:jobId/labor-entries/:entryId", async (req, res) => {
  try {
    const entryId = parseInt(req.params.entryId);
    if (isNaN(entryId)) return res.status(400).json({ error: "Invalid entryId" });
    await db.delete(jobLaborEntriesTable).where(eq(jobLaborEntriesTable.id, entryId));
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

// ── Knowledge Record ───────────────────────────────────────────────────────────

// GET /jobs/:jobId/knowledge-record — returns existing record or a computed draft
router.get("/:jobId/knowledge-record", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid jobId" });

    const [existing] = await db.select().from(jobKnowledgeRecordsTable)
      .where(eq(jobKnowledgeRecordsTable.jobId, jobId));

    if (existing) {
      res.json({ ...existing, isDraft: false });
      return;
    }

    const draft = await computeDraft(jobId);
    res.json(draft);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

// PUT /jobs/:jobId/knowledge-record — create or update
router.put("/:jobId/knowledge-record", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid jobId" });

    const draft = await computeDraft(jobId);

    const {
      status, productiveHours, travelHours, crewSize, daysOnSite,
      invoiceAmount, materialCost, consumablesCost, grossProfit, netProfit,
      callbacks, warrantyVisit, missingMaterialsNotes, factoryDefectNotes, editReason,
    } = req.body;

    const now = new Date();
    const prodHours = productiveHours != null ? parseFloat(productiveHours) : draft.productiveHours;

    const originalProductiveHours = (productiveHours != null && parseFloat(productiveHours) !== draft.productiveHours)
      ? String(draft.productiveHours)
      : null;
    const editedAt = originalProductiveHours ? now : null;

    const values = {
      jobId,
      mfhModelId: draft.mfhModelId,
      builderId: draft.builderId,
      builderNameSnapshot: draft.builderNameSnapshot,
      modelNameSnapshot: draft.modelNameSnapshot,
      status: status ?? "reviewed",
      productiveHours: String(prodHours),
      travelHours: String(travelHours != null ? parseFloat(travelHours) : draft.travelHours),
      crewSize: crewSize != null ? parseInt(crewSize) : draft.crewSize,
      daysOnSite: daysOnSite != null ? parseInt(daysOnSite) : draft.daysOnSite,
      invoiceAmount: invoiceAmount != null ? String(parseFloat(invoiceAmount)) : (draft.invoiceAmount != null ? String(draft.invoiceAmount) : null),
      materialCost: materialCost != null ? String(parseFloat(materialCost)) : (draft.materialCost != null ? String(draft.materialCost) : null),
      consumablesCost: consumablesCost != null ? String(parseFloat(consumablesCost)) : (draft.consumablesCost != null ? String(draft.consumablesCost) : null),
      grossProfit: grossProfit != null ? String(parseFloat(grossProfit)) : (draft.grossProfit != null ? String(draft.grossProfit) : null),
      netProfit: netProfit != null ? String(parseFloat(netProfit)) : (draft.netProfit != null ? String(draft.netProfit) : null),
      callbacks: callbacks != null ? parseInt(callbacks) : 0,
      warrantyVisit: warrantyVisit === true || warrantyVisit === "true",
      missingMaterialsNotes: missingMaterialsNotes || null,
      factoryDefectNotes: factoryDefectNotes || null,
      originalProductiveHours,
      editReason: editReason || null,
      editedAt,
      updatedAt: now,
    };

    const [existing] = await db.select({ id: jobKnowledgeRecordsTable.id }).from(jobKnowledgeRecordsTable)
      .where(eq(jobKnowledgeRecordsTable.jobId, jobId));

    let record;
    if (existing) {
      [record] = await db.update(jobKnowledgeRecordsTable).set(values).where(eq(jobKnowledgeRecordsTable.id, existing.id)).returning();
    } else {
      [record] = await db.insert(jobKnowledgeRecordsTable).values(values).returning();
    }

    res.json({ ...record, isDraft: false });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

// POST /jobs/:jobId/knowledge-record/accept — mark as accepted (teaches KB)
router.post("/:jobId/knowledge-record/accept", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid jobId" });

    const [existing] = await db.select({ id: jobKnowledgeRecordsTable.id }).from(jobKnowledgeRecordsTable)
      .where(eq(jobKnowledgeRecordsTable.jobId, jobId));

    if (!existing) return res.status(404).json({ error: "No knowledge record — save it first" });

    const [record] = await db.update(jobKnowledgeRecordsTable)
      .set({ status: "accepted", taughtAt: new Date(), updatedAt: new Date() })
      .where(eq(jobKnowledgeRecordsTable.id, existing.id))
      .returning();

    res.json({ ...record, isDraft: false });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

// POST /jobs/:jobId/knowledge-record/exclude — mark as excluded (save without teaching)
router.post("/:jobId/knowledge-record/exclude", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid jobId" });

    const [existing] = await db.select({ id: jobKnowledgeRecordsTable.id }).from(jobKnowledgeRecordsTable)
      .where(eq(jobKnowledgeRecordsTable.jobId, jobId));

    if (!existing) return res.status(404).json({ error: "No knowledge record — save it first" });

    const [record] = await db.update(jobKnowledgeRecordsTable)
      .set({ status: "excluded", updatedAt: new Date() })
      .where(eq(jobKnowledgeRecordsTable.id, existing.id))
      .returning();

    res.json({ ...record, isDraft: false });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

// PATCH /jobs/:jobId/knowledge-record — partial field update (for Learning History edits)
router.patch("/:jobId/knowledge-record", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid jobId" });

    const [existing] = await db.select().from(jobKnowledgeRecordsTable)
      .where(eq(jobKnowledgeRecordsTable.jobId, jobId));
    if (!existing) return res.status(404).json({ error: "Not found" });

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const fields = [
      "status", "productiveHours", "travelHours", "crewSize", "daysOnSite",
      "invoiceAmount", "materialCost", "consumablesCost", "grossProfit", "netProfit",
      "callbacks", "warrantyVisit", "missingMaterialsNotes", "factoryDefectNotes", "editReason",
    ];
    for (const f of fields) {
      if (f in req.body) {
        const v = req.body[f];
        if (f === "crewSize" || f === "daysOnSite" || f === "callbacks") updates[f] = v != null ? parseInt(v) : null;
        else if (f === "warrantyVisit") updates[f] = v === true || v === "true";
        else if (["productiveHours", "travelHours", "invoiceAmount", "materialCost", "consumablesCost", "grossProfit", "netProfit"].includes(f)) {
          updates[f] = v != null ? String(parseFloat(v)) : null;
        } else {
          updates[f] = v || null;
        }
      }
    }

    if ("status" in req.body && req.body.status === "accepted" && existing.status !== "accepted") {
      updates.taughtAt = new Date();
    }
    if ("productiveHours" in req.body && req.body.productiveHours !== existing.productiveHours) {
      updates.editedAt = new Date();
    }

    const [record] = await db.update(jobKnowledgeRecordsTable).set(updates).where(eq(jobKnowledgeRecordsTable.id, existing.id)).returning();
    res.json({ ...record, isDraft: false });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

export default router;
