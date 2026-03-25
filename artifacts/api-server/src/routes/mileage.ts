import { Router } from "express";
import { db } from "@workspace/db";
import { mileageLogsTable, jobsTable, settingsTable } from "@workspace/db/schema";
import { eq, and, gte, lte, sum } from "drizzle-orm";

const router = Router();

function formatMileage(m: any, jobTitle?: string | null) {
  return {
    ...m,
    jobTitle: jobTitle ?? null,
    miles: parseFloat(m.miles ?? "0"),
    ratePerMile: parseFloat(m.ratePerMile ?? "0.725"),
    deductionAmount: parseFloat(m.deductionAmount ?? "0"),
    createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
  };
}

async function getRate() {
  const [settings] = await db.select().from(settingsTable).limit(1);
  return parseFloat(settings?.mileageRate ?? "0.725");
}

router.get("/summary", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const conditions: any[] = [eq(mileageLogsTable.classification, "business")];
    if (startDate) conditions.push(gte(mileageLogsTable.date, startDate as string));
    if (endDate) conditions.push(lte(mileageLogsTable.date, endDate as string));

    const allConditions: any[] = [];
    if (startDate) allConditions.push(gte(mileageLogsTable.date, startDate as string));
    if (endDate) allConditions.push(lte(mileageLogsTable.date, endDate as string));

    const all = await db.select().from(mileageLogsTable).where(allConditions.length ? and(...allConditions) : undefined);
    const rate = await getRate();
    const businessMiles = all.filter(m => m.classification === "business").reduce((s, m) => s + parseFloat(m.miles), 0);
    const personalMiles = all.filter(m => m.classification === "personal").reduce((s, m) => s + parseFloat(m.miles), 0);

    res.json({
      totalMiles: businessMiles + personalMiles,
      businessMiles,
      personalMiles,
      totalDeduction: businessMiles * rate,
      ratePerMile: rate,
      tripCount: all.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get mileage summary" });
  }
});

router.get("/", async (req, res) => {
  try {
    const { startDate, endDate, classified } = req.query;
    const conditions: any[] = [];
    if (startDate) conditions.push(gte(mileageLogsTable.date, startDate as string));
    if (endDate) conditions.push(lte(mileageLogsTable.date, endDate as string));

    const logs = await db
      .select({ ...mileageLogsTable, jobTitle: jobsTable.title })
      .from(mileageLogsTable)
      .leftJoin(jobsTable, eq(mileageLogsTable.jobId, jobsTable.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(mileageLogsTable.date);

    res.json(logs.map(m => formatMileage(m, m.jobTitle)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch mileage logs" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { date, startLocation, endLocation, miles, purpose, jobId, classification, notes, source } = req.body;
    if (!date || miles == null) return res.status(400).json({ error: "Missing required fields" });
    const rate = await getRate();
    const deductionAmount = classification === "business" ? parseFloat(miles) * rate : 0;

    const [log] = await db.insert(mileageLogsTable).values({
      date, startLocation, endLocation,
      miles: miles.toString(),
      purpose, jobId: jobId || null,
      classification: classification || "business",
      ratePerMile: rate.toString(),
      deductionAmount: deductionAmount.toString(),
      notes,
      source: source || "gps",
    }).returning();

    let jobTitle = null;
    if (log.jobId) {
      const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, log.jobId));
      jobTitle = job?.title;
    }
    res.status(201).json(formatMileage(log, jobTitle));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create mileage log" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { date, startLocation, endLocation, miles, purpose, jobId, classification, notes } = req.body;
    const rate = await getRate();
    const deductionAmount = classification === "business" ? parseFloat(miles) * rate : 0;

    const [log] = await db.update(mileageLogsTable).set({
      date, startLocation, endLocation,
      miles: miles?.toString(),
      purpose, jobId: jobId || null,
      classification,
      ratePerMile: rate.toString(),
      deductionAmount: deductionAmount.toString(),
      notes
    }).where(eq(mileageLogsTable.id, id)).returning();
    if (!log) return res.status(404).json({ error: "Mileage log not found" });

    let jobTitle = null;
    if (log.jobId) {
      const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, log.jobId));
      jobTitle = job?.title;
    }
    res.json(formatMileage(log, jobTitle));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update mileage log" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await db.delete(mileageLogsTable).where(eq(mileageLogsTable.id, parseInt(req.params.id)));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete mileage log" });
  }
});

export default router;
