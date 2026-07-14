import { Router } from "express";
import { db } from "@workspace/db";
import { dailyLogsTable, jobsTable } from "@workspace/db/schema";
import { eq, and, gte, lte, type SQL, getTableColumns } from "drizzle-orm";

const router = Router();

type DailyLogRow = typeof dailyLogsTable.$inferSelect & { jobTitle?: string | null };

function format(log: DailyLogRow) {
  return {
    ...log,
    jobTitle: log.jobTitle ?? null,
    hoursWorked: log.hoursWorked ? parseFloat(log.hoursWorked) : null,
    photoUrls: Array.isArray(log.photoUrls) ? log.photoUrls : [],
    createdAt: log.createdAt instanceof Date ? log.createdAt.toISOString() : log.createdAt,
  };
}

router.get("/", async (req, res) => {
  try {
    const { jobId, startDate, endDate } = req.query;
    const conditions: SQL[] = [];
    if (jobId) conditions.push(eq(dailyLogsTable.jobId, parseInt(jobId as string)));
    if (startDate) conditions.push(gte(dailyLogsTable.date, startDate as string));
    if (endDate) conditions.push(lte(dailyLogsTable.date, endDate as string));

    const logs = await db
      .select({ ...getTableColumns(dailyLogsTable), jobTitle: jobsTable.title })
      .from(dailyLogsTable)
      .leftJoin(jobsTable, eq(dailyLogsTable.jobId, jobsTable.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(dailyLogsTable.date);

    res.json(logs.map(l => format(l as any)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch daily logs" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { jobId, date, weather, crewCount, workCompleted, issues, materialsUsed, hoursWorked, notes, photoUrls, materialListId, authorName } = req.body;
    if (!date) return res.status(400).json({ error: "Date is required" });

    const [log] = await db.insert(dailyLogsTable).values({
      jobId: jobId || null, date, weather,
      crewCount: crewCount ?? null,
      workCompleted, issues, materialsUsed,
      hoursWorked: hoursWorked?.toString() ?? null,
      notes,
      photoUrls: photoUrls ?? [],
      materialListId: materialListId || null,
      authorName: authorName || null,
    }).returning();

    let jobTitle: string | null = null;
    if (log.jobId) {
      const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, log.jobId));
      jobTitle = job?.title ?? null;
    }
    res.status(201).json(format({ ...log, jobTitle }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create daily log" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const [log] = await db
      .select({ ...getTableColumns(dailyLogsTable), jobTitle: jobsTable.title })
      .from(dailyLogsTable)
      .leftJoin(jobsTable, eq(dailyLogsTable.jobId, jobsTable.id))
      .where(eq(dailyLogsTable.id, parseInt(req.params.id)));
    if (!log) return res.status(404).json({ error: "Daily log not found" });
    res.json(format(log as any));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch daily log" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { jobId, date, weather, crewCount, workCompleted, issues, materialsUsed, hoursWorked, notes, photoUrls, materialListId } = req.body;
    const [log] = await db.update(dailyLogsTable).set({
      jobId: jobId || null, date, weather,
      crewCount: crewCount ?? null,
      workCompleted, issues, materialsUsed,
      hoursWorked: hoursWorked?.toString() ?? null,
      notes,
      photoUrls: photoUrls ?? [],
      materialListId: materialListId || null,
    }).where(eq(dailyLogsTable.id, id)).returning();
    if (!log) return res.status(404).json({ error: "Daily log not found" });

    let jobTitle: string | null = null;
    if (log.jobId) {
      const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, log.jobId));
      jobTitle = job?.title ?? null;
    }
    res.json(format({ ...log, jobTitle }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update daily log" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await db.delete(dailyLogsTable).where(eq(dailyLogsTable.id, parseInt(req.params.id)));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete daily log" });
  }
});

export default router;
