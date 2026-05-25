import { Router } from "express";
import { db } from "@workspace/db";
import { jobTypeBenchmarksTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

function fmt(row: typeof jobTypeBenchmarksTable.$inferSelect) {
  return {
    ...row,
    estimatedHours: row.estimatedHours != null ? parseFloat(row.estimatedHours) : null,
    estimatedLaborCost: row.estimatedLaborCost != null ? parseFloat(row.estimatedLaborCost) : null,
    estimatedMaterialCost: row.estimatedMaterialCost != null ? parseFloat(row.estimatedMaterialCost) : null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  };
}

router.get("/", async (_req, res) => {
  try {
    const rows = await db.select().from(jobTypeBenchmarksTable).orderBy(jobTypeBenchmarksTable.jobType);
    res.json(rows.map(fmt));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch benchmarks" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { jobType, estimatedHours, estimatedLaborCost, estimatedMaterialCost, notes } = req.body;
    if (!jobType?.trim()) return res.status(400).json({ error: "jobType is required" });
    const [row] = await db.insert(jobTypeBenchmarksTable).values({
      jobType: jobType.trim(),
      estimatedHours: estimatedHours != null ? String(estimatedHours) : null,
      estimatedLaborCost: estimatedLaborCost != null ? String(estimatedLaborCost) : null,
      estimatedMaterialCost: estimatedMaterialCost != null ? String(estimatedMaterialCost) : null,
      notes: notes || null,
    }).returning();
    res.status(201).json(fmt(row));
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === "23505") return res.status(409).json({ error: "A benchmark for this job type already exists" });
    console.error(err);
    res.status(500).json({ error: "Failed to create benchmark" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { jobType, estimatedHours, estimatedLaborCost, estimatedMaterialCost, notes } = req.body;
    const updates: Record<string, unknown> = {};
    if (jobType !== undefined) updates.jobType = jobType.trim();
    if (estimatedHours !== undefined) updates.estimatedHours = estimatedHours != null ? String(estimatedHours) : null;
    if (estimatedLaborCost !== undefined) updates.estimatedLaborCost = estimatedLaborCost != null ? String(estimatedLaborCost) : null;
    if (estimatedMaterialCost !== undefined) updates.estimatedMaterialCost = estimatedMaterialCost != null ? String(estimatedMaterialCost) : null;
    if (notes !== undefined) updates.notes = notes || null;
    const [row] = await db.update(jobTypeBenchmarksTable).set(updates).where(eq(jobTypeBenchmarksTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Benchmark not found" });
    res.json(fmt(row));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update benchmark" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await db.delete(jobTypeBenchmarksTable).where(eq(jobTypeBenchmarksTable.id, parseInt(req.params.id)));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete benchmark" });
  }
});

export default router;
