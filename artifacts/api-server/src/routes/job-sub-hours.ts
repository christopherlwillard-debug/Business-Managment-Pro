import { Router } from "express";
import { db } from "@workspace/db";
import { jobSubHoursTable, subcontractorsTable, jobSubcontractorsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

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

router.get("/:jobId/sub-hours", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid job id" });
    const rows = await db
      .select({ ...jobSubHoursTable, subName: subcontractorsTable.name })
      .from(jobSubHoursTable)
      .leftJoin(subcontractorsTable, eq(jobSubHoursTable.subcontractorId, subcontractorsTable.id))
      .where(eq(jobSubHoursTable.jobId, jobId))
      .orderBy(jobSubHoursTable.date);
    res.json(rows.map(r => fmt(r)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch sub hours" });
  }
});

router.post("/:jobId/sub-hours", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid job id" });
    const { subcontractorId, date, hours, description, rateSnapshot } = req.body;
    if (!subcontractorId || !date || hours == null) {
      return res.status(400).json({ error: "subcontractorId, date, and hours are required" });
    }

    // Enforce: sub must be assigned to this job
    const [link] = await db.select({ jobId: jobSubcontractorsTable.jobId })
      .from(jobSubcontractorsTable)
      .where(and(
        eq(jobSubcontractorsTable.jobId, jobId),
        eq(jobSubcontractorsTable.subcontractorId, parseInt(subcontractorId))
      ));
    if (!link) {
      return res.status(400).json({ error: "Subcontractor is not assigned to this job" });
    }

    let resolvedRate = rateSnapshot != null ? String(rateSnapshot) : null;
    if (resolvedRate == null) {
      const [sub] = await db.select({ payRate: subcontractorsTable.payRate })
        .from(subcontractorsTable).where(eq(subcontractorsTable.id, parseInt(subcontractorId)));
      resolvedRate = sub?.payRate ?? null;
    }

    const [row] = await db.insert(jobSubHoursTable).values({
      jobId, subcontractorId: parseInt(subcontractorId),
      date, hours: String(hours), description: description || null,
      rateSnapshot: resolvedRate,
    }).returning();

    const [sub] = await db.select({ name: subcontractorsTable.name })
      .from(subcontractorsTable).where(eq(subcontractorsTable.id, row.subcontractorId));
    res.status(201).json(fmt({ ...row, subName: sub?.name ?? null }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create sub hours entry" });
  }
});

router.put("/sub-hours/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
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
    res.json(fmt({ ...row, subName: sub?.name ?? null }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update sub hours entry" });
  }
});

router.delete("/sub-hours/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(jobSubHoursTable).where(eq(jobSubHoursTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete sub hours entry" });
  }
});

export default router;
