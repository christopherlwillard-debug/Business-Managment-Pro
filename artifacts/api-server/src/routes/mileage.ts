import { Router } from "express";
import { db } from "@workspace/db";
import { mileageLogsTable, jobsTable, settingsTable, expensesTable } from "@workspace/db/schema";
import { eq, and, gte, lte, isNull } from "drizzle-orm";

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
    const { startDate, endDate, businessId } = req.query;
    if (!businessId) return res.status(400).json({ error: "businessId is required" });
    const bizId = parseInt(businessId as string);

    const baseConditions: any[] = [
      eq(mileageLogsTable.businessId, bizId),
      isNull(mileageLogsTable.subcontractorId),
    ];
    if (startDate) baseConditions.push(gte(mileageLogsTable.date, startDate as string));
    if (endDate) baseConditions.push(lte(mileageLogsTable.date, endDate as string));

    const all = await db
      .select()
      .from(mileageLogsTable)
      .where(and(...baseConditions));

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
    const { startDate, endDate, businessId } = req.query;
    if (!businessId) return res.status(400).json({ error: "businessId is required" });
    const bizId = parseInt(businessId as string);

    const conditions: any[] = [
      eq(mileageLogsTable.businessId, bizId),
      isNull(mileageLogsTable.subcontractorId),
    ];
    if (startDate) conditions.push(gte(mileageLogsTable.date, startDate as string));
    if (endDate) conditions.push(lte(mileageLogsTable.date, endDate as string));

    const logs = await db
      .select({ ...mileageLogsTable, jobTitle: jobsTable.title })
      .from(mileageLogsTable)
      .leftJoin(jobsTable, eq(mileageLogsTable.jobId, jobsTable.id))
      .where(and(...conditions))
      .orderBy(mileageLogsTable.date);

    res.json(logs.map(m => formatMileage(m, m.jobTitle)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch mileage logs" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { date, startLocation, endLocation, miles, purpose, jobId, businessId, classification, notes, source } = req.body;
    if (!date || miles == null) return res.status(400).json({ error: "Missing required fields" });
    const rate = await getRate();
    const milesNum = parseFloat(miles);
    const deductionAmount = classification === "business" ? milesNum * rate : 0;
    const bizId = businessId ? parseInt(businessId) : null;

    let expenseId: number | null = null;

    if (classification === "business" || classification == null) {
      const description = purpose
        ? `Mileage: ${purpose} (${milesNum.toFixed(2)} mi)`
        : `Mileage: Business trip (${milesNum.toFixed(2)} mi)`;
      const [expense] = await db.insert(expensesTable).values({
        date,
        description,
        vendor: "IRS Mileage",
        category: "mileage",
        amount: deductionAmount.toFixed(2),
        jobId: jobId || null,
        businessId: bizId,
        notes: `Auto-created. ${milesNum.toFixed(2)} mi × $${rate}/mi`,
      }).returning();
      expenseId = expense.id;
    }

    const [log] = await db.insert(mileageLogsTable).values({
      date, startLocation, endLocation,
      miles: miles.toString(),
      purpose, jobId: jobId || null,
      businessId: bizId,
      classification: classification || "business",
      ratePerMile: rate.toString(),
      deductionAmount: deductionAmount.toString(),
      notes,
      source: source || "gps",
      expenseId,
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
    const milesNum = parseFloat(miles);
    const deductionAmount = classification === "business" ? milesNum * rate : 0;

    const [existing] = await db.select().from(mileageLogsTable).where(eq(mileageLogsTable.id, id));

    if (existing?.expenseId) {
      await db.update(expensesTable).set({
        date,
        description: purpose
          ? `Mileage: ${purpose} (${milesNum.toFixed(2)} mi)`
          : `Mileage: Business trip (${milesNum.toFixed(2)} mi)`,
        amount: deductionAmount.toFixed(2),
        jobId: jobId || null,
        notes: `Auto-created. ${milesNum.toFixed(2)} mi × $${rate}/mi`,
      }).where(eq(expensesTable.id, existing.expenseId));
    }

    const [log] = await db.update(mileageLogsTable).set({
      date, startLocation, endLocation,
      miles: miles?.toString(),
      purpose, jobId: jobId || null,
      classification,
      ratePerMile: rate.toString(),
      deductionAmount: deductionAmount.toString(),
      notes,
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
    const id = parseInt(req.params.id);

    const [log] = await db.select().from(mileageLogsTable).where(eq(mileageLogsTable.id, id));
    if (log?.expenseId) {
      await db.delete(expensesTable).where(eq(expensesTable.id, log.expenseId));
    } else if (log) {
      console.warn(`Mileage log ${id} has no expenseId — skipping expense cleanup to avoid affecting other entries.`);
    }

    await db.delete(mileageLogsTable).where(eq(mileageLogsTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete mileage log" });
  }
});

export default router;
