import { Router } from "express";
import { db } from "@workspace/db";
import { jobTypeBenchmarksTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

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

// Actuals aggregation — MUST be before /:id routes
router.get("/actuals", async (_req, res) => {
  try {
    const byJobType = await db.execute(sql`
      SELECT
        j.job_type                                            AS "groupKey",
        'job_type'                                            AS "groupBy",
        COUNT(DISTINCT j.id)::int                            AS "jobCount",
        ROUND(AVG(COALESCE(inv.revenue, 0))::numeric, 2)     AS "avgRevenue",
        ROUND(AVG(COALESCE(sp.cost, 0))::numeric, 2)         AS "avgCost",
        ROUND(AVG(COALESCE(inv.revenue, 0) - COALESCE(sp.cost, 0))::numeric, 2) AS "avgProfit",
        ROUND(AVG(
          CASE WHEN j.start_date IS NOT NULL AND j.end_date IS NOT NULL
            THEN (j.end_date::date - j.start_date::date) END
        )::numeric, 0) AS "avgDays",
        json_agg(
          json_build_object(
            'id', j.id, 'title', j.title,
            'startDate', j.start_date, 'endDate', j.end_date
          ) ORDER BY j.created_at DESC
        ) AS "jobs"
      FROM jobs j
      LEFT JOIN LATERAL (
        SELECT SUM(total::numeric) AS revenue FROM invoices WHERE job_id = j.id
      ) inv ON true
      LEFT JOIN LATERAL (
        SELECT SUM(COALESCE(amount_paid::numeric, 0)) AS cost
        FROM job_subcontractors WHERE job_id = j.id
      ) sp ON true
      WHERE j.status = 'completed' AND j.job_type IS NOT NULL
      GROUP BY j.job_type ORDER BY j.job_type
    `);

    const byHomeModel = await db.execute(sql`
      SELECT
        j.home_model                                          AS "groupKey",
        'home_model'                                          AS "groupBy",
        COUNT(DISTINCT j.id)::int                            AS "jobCount",
        ROUND(AVG(COALESCE(inv.revenue, 0))::numeric, 2)     AS "avgRevenue",
        ROUND(AVG(COALESCE(sp.cost, 0))::numeric, 2)         AS "avgCost",
        ROUND(AVG(COALESCE(inv.revenue, 0) - COALESCE(sp.cost, 0))::numeric, 2) AS "avgProfit",
        ROUND(AVG(
          CASE WHEN j.start_date IS NOT NULL AND j.end_date IS NOT NULL
            THEN (j.end_date::date - j.start_date::date) END
        )::numeric, 0) AS "avgDays",
        json_agg(
          json_build_object(
            'id', j.id, 'title', j.title,
            'startDate', j.start_date, 'endDate', j.end_date
          ) ORDER BY j.created_at DESC
        ) AS "jobs"
      FROM jobs j
      LEFT JOIN LATERAL (
        SELECT SUM(total::numeric) AS revenue FROM invoices WHERE job_id = j.id
      ) inv ON true
      LEFT JOIN LATERAL (
        SELECT SUM(COALESCE(amount_paid::numeric, 0)) AS cost
        FROM job_subcontractors WHERE job_id = j.id
      ) sp ON true
      WHERE j.status = 'completed'
        AND j.home_model IS NOT NULL AND j.home_model <> ''
      GROUP BY j.home_model ORDER BY j.home_model
    `);

    const parseRow = (r: Record<string, unknown>) => ({
      groupKey: r.groupKey as string,
      groupBy: r.groupBy as string,
      jobCount: Number(r.jobCount ?? 0),
      avgRevenue: r.avgRevenue != null ? parseFloat(String(r.avgRevenue)) : 0,
      avgCost: r.avgCost != null ? parseFloat(String(r.avgCost)) : 0,
      avgProfit: r.avgProfit != null ? parseFloat(String(r.avgProfit)) : 0,
      avgDays: r.avgDays != null ? Math.round(parseFloat(String(r.avgDays))) : null,
      jobs: Array.isArray(r.jobs) ? (r.jobs as { id: number; title: string; startDate: string | null; endDate: string | null }[]) : [],
    });

    res.json({
      byJobType: (byJobType.rows as Record<string, unknown>[]).map(parseRow),
      byHomeModel: (byHomeModel.rows as Record<string, unknown>[]).map(parseRow),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch actuals" });
  }
});

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
