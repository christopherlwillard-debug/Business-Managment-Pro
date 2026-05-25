import { Router } from "express";
import { db } from "@workspace/db";
import { jobSubHoursTable, subcontractorsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { recomputeSubPaid } from "./jobs";

const router = Router();

function fmt(row: typeof jobSubHoursTable.$inferSelect & { subName?: string | null }) {
  return {
    ...row,
    hours: parseFloat(row.hours ?? "0"),
    rateSnapshot: row.rateSnapshot != null ? parseFloat(row.rateSnapshot) : null,
    subName: row.subName ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  };
}

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const { date, hours, description, rateSnapshot } = req.body;
    const updates: Record<string, unknown> = {};
    if (date !== undefined) updates.date = date;
    if (hours !== undefined) updates.hours = String(hours);
    if (description !== undefined) updates.description = description || null;
    if (rateSnapshot !== undefined) updates.rateSnapshot = rateSnapshot != null ? String(rateSnapshot) : null;

    const [row] = await db.update(jobSubHoursTable).set(updates).where(eq(jobSubHoursTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Entry not found" });

    const [sub] = await db.select({ name: subcontractorsTable.name })
      .from(subcontractorsTable).where(eq(subcontractorsTable.id, row.subcontractorId));
    await recomputeSubPaid(row.jobId).catch(() => {});
    res.json(fmt({ ...row, subName: sub?.name ?? null }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update sub hours entry" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const [deleted] = await db.delete(jobSubHoursTable).where(eq(jobSubHoursTable.id, id)).returning();
    if (deleted) await recomputeSubPaid(deleted.jobId).catch(() => {});
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete sub hours entry" });
  }
});

export default router;
