import { Router } from "express";
import { db } from "@workspace/db";
import { businessTripsTable, expensesTable, jobsTable } from "@workspace/db/schema";
import { eq, and, desc, isNull, asc, sql } from "drizzle-orm";

const router = Router();

function formatTrip(t: any) {
  return {
    ...t,
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
    closedAt: t.closedAt instanceof Date ? t.closedAt.toISOString() : (t.closedAt ?? null),
  };
}

function formatTripWithStats(t: any) {
  return {
    ...formatTrip(t),
    jobTitle: t.jobTitle ?? null,
    receiptCount: Number(t.receiptCount ?? 0),
    totalAmount: parseFloat(t.totalAmount ?? "0"),
    mealTotal: parseFloat(t.mealTotal ?? "0"),
    deductibleMeals: parseFloat(t.deductibleMeals ?? "0"),
    missingReceipts: Number(t.missingReceipts ?? 0),
    hotelTotal: parseFloat(t.hotelTotal ?? "0"),
    airfareTotal: parseFloat(t.airfareTotal ?? "0"),
    transportTotal: parseFloat(t.transportTotal ?? "0"),
    mealsHaveOvernightAnswered: Number(t.mealsHaveOvernightAnswered ?? 0),
    mealsCount: Number(t.mealsCount ?? 0),
  };
}

const tripStatsSelect = {
  id: businessTripsTable.id,
  destination: businessTripsTable.destination,
  businessPurpose: businessTripsTable.businessPurpose,
  startDate: businessTripsTable.startDate,
  endDate: businessTripsTable.endDate,
  jobId: businessTripsTable.jobId,
  status: businessTripsTable.status,
  closedAt: businessTripsTable.closedAt,
  closedBy: businessTripsTable.closedBy,
  createdAt: businessTripsTable.createdAt,
  jobTitle: jobsTable.title,
  receiptCount: sql<string>`COUNT(${expensesTable.id})`,
  totalAmount: sql<string>`COALESCE(SUM(${expensesTable.amount}), 0)`,
  mealTotal: sql<string>`COALESCE(SUM(CASE WHEN LOWER(${expensesTable.category}) = 'meals' THEN ${expensesTable.amount} ELSE 0 END), 0)`,
  deductibleMeals: sql<string>`COALESCE(SUM(CASE WHEN LOWER(${expensesTable.category}) = 'meals' THEN COALESCE(${expensesTable.deductibleAmount}::numeric, ${expensesTable.amount}::numeric * 0.5) ELSE 0 END), 0)`,
  missingReceipts: sql<string>`COUNT(CASE WHEN ${expensesTable.receiptStatus} = 'missing' THEN 1 END)`,
  hotelTotal: sql<string>`COALESCE(SUM(CASE WHEN LOWER(${expensesTable.category}) LIKE '%hotel%' OR LOWER(${expensesTable.category}) LIKE '%lodging%' THEN ${expensesTable.amount} ELSE 0 END), 0)`,
  airfareTotal: sql<string>`COALESCE(SUM(CASE WHEN LOWER(${expensesTable.category}) LIKE '%airfare%' OR LOWER(${expensesTable.category}) LIKE '%flight%' THEN ${expensesTable.amount} ELSE 0 END), 0)`,
  transportTotal: sql<string>`COALESCE(SUM(CASE WHEN LOWER(${expensesTable.category}) LIKE '%rental%' OR LOWER(${expensesTable.category}) LIKE '%taxi%' OR LOWER(${expensesTable.category}) LIKE '%rideshare%' THEN ${expensesTable.amount} ELSE 0 END), 0)`,
  mealsHaveOvernightAnswered: sql<string>`COUNT(CASE WHEN LOWER(${expensesTable.category}) = 'meals' AND ${expensesTable.overnightTravel} IS NOT NULL THEN 1 END)`,
  mealsCount: sql<string>`COUNT(CASE WHEN LOWER(${expensesTable.category}) = 'meals' THEN 1 END)`,
};

function buildTripsQuery() {
  return db
    .select(tripStatsSelect)
    .from(businessTripsTable)
    .leftJoin(jobsTable, eq(businessTripsTable.jobId, jobsTable.id))
    .leftJoin(expensesTable, eq(expensesTable.tripId, businessTripsTable.id))
    .groupBy(
      businessTripsTable.id,
      businessTripsTable.destination,
      businessTripsTable.businessPurpose,
      businessTripsTable.startDate,
      businessTripsTable.endDate,
      businessTripsTable.jobId,
      businessTripsTable.status,
      businessTripsTable.closedAt,
      businessTripsTable.closedBy,
      businessTripsTable.createdAt,
      jobsTable.title,
    );
}

router.get("/", async (req, res) => {
  try {
    const { status, jobId, year } = req.query;
    const conditions: any[] = [];
    if (status) conditions.push(eq(businessTripsTable.status, status as string));
    if (jobId) conditions.push(eq(businessTripsTable.jobId, parseInt(jobId as string)));
    if (year) {
      const y = year as string;
      conditions.push(sql`(
        ${businessTripsTable.startDate} LIKE ${y + "-%"} OR
        ${businessTripsTable.endDate} LIKE ${y + "-%"} OR
        (${businessTripsTable.startDate} IS NULL AND ${businessTripsTable.endDate} IS NULL)
      )`);
    }

    const rows = await buildTripsQuery()
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(businessTripsTable.startDate), desc(businessTripsTable.createdAt));

    res.json(rows.map(formatTripWithStats));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch trips" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [row] = await buildTripsQuery().where(eq(businessTripsTable.id, id));
    if (!row) return res.status(404).json({ error: "Trip not found" });
    res.json(formatTripWithStats(row));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch trip" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { destination, businessPurpose, startDate, endDate, jobId } = req.body;
    if (!destination?.trim()) return res.status(400).json({ error: "destination is required" });

    const [trip] = await db.insert(businessTripsTable).values({
      destination: destination.trim(),
      businessPurpose: businessPurpose || null,
      startDate: startDate || null,
      endDate: endDate || null,
      jobId: jobId ? parseInt(jobId) : null,
      status: "open",
    }).returning();

    const [withStats] = await buildTripsQuery().where(eq(businessTripsTable.id, trip.id));
    res.status(201).json(formatTripWithStats(withStats ?? trip));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create trip" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { destination, businessPurpose, startDate, endDate, jobId, status, closedBy } = req.body;

    const updateData: Record<string, any> = {};
    if (destination !== undefined) updateData.destination = destination;
    if (businessPurpose !== undefined) updateData.businessPurpose = businessPurpose || null;
    if (startDate !== undefined) updateData.startDate = startDate || null;
    if (endDate !== undefined) updateData.endDate = endDate || null;
    if (jobId !== undefined) updateData.jobId = jobId ? parseInt(jobId) : null;
    if (status !== undefined) {
      updateData.status = status;
      if (status === "completed" || status === "archived") {
        updateData.closedAt = new Date();
        updateData.closedBy = closedBy || null;
      } else if (status === "open") {
        updateData.closedAt = null;
        updateData.closedBy = null;
      }
    }

    const [updated] = await db.update(businessTripsTable)
      .set(updateData)
      .where(eq(businessTripsTable.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Trip not found" });

    const [withStats] = await buildTripsQuery().where(eq(businessTripsTable.id, updated.id));
    res.json(formatTripWithStats(withStats ?? updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update trip" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.update(expensesTable).set({ tripId: null }).where(eq(expensesTable.tripId, id));
    await db.delete(businessTripsTable).where(eq(businessTripsTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete trip" });
  }
});

router.get("/:id/receipts", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const receipts = await db
      .select({
        id: expensesTable.id,
        description: expensesTable.description,
        amount: expensesTable.amount,
        category: expensesTable.category,
        date: expensesTable.date,
        vendor: expensesTable.vendor,
        receiptUrl: expensesTable.receiptUrl,
        receiptStatus: expensesTable.receiptStatus,
        receiptMissingExplanation: expensesTable.receiptMissingExplanation,
        notes: expensesTable.notes,
        paidBy: expensesTable.paidBy,
        numPeople: expensesTable.numPeople,
        mealTotal: expensesTable.mealTotal,
        deductibleAmount: expensesTable.deductibleAmount,
        nonDeductibleAmount: expensesTable.nonDeductibleAmount,
        tipAmount: expensesTable.tipAmount,
        taxAmount: expensesTable.taxAmount,
        overnightTravel: expensesTable.overnightTravel,
        isPotentiallyNondeductible: expensesTable.isPotentiallyNondeductible,
        countsTowardJobProfit: expensesTable.countsTowardJobProfit,
        businessPurpose: sql<string | null>`COALESCE(NULLIF(${expensesTable.notes}, ''), ${businessTripsTable.businessPurpose})`,
        jobTitle: jobsTable.title,
      })
      .from(expensesTable)
      .leftJoin(jobsTable, eq(expensesTable.jobId, jobsTable.id))
      .leftJoin(businessTripsTable, eq(expensesTable.tripId, businessTripsTable.id))
      .where(eq(expensesTable.tripId, id))
      .orderBy(asc(expensesTable.date));

    const toServingUrl = (raw: string | null | undefined) => {
      if (!raw) return null;
      if (raw.startsWith("/objects/")) return `/api/storage/objects/${raw.slice("/objects/".length)}`;
      if (raw.startsWith("/uploads/")) return `/api${raw}`;
      return raw;
    };

    res.json(receipts.map(r => ({
      ...r,
      amount: parseFloat(r.amount ?? "0"),
      mealTotal: r.mealTotal ? parseFloat(r.mealTotal) : null,
      deductibleAmount: r.deductibleAmount ? parseFloat(r.deductibleAmount) : null,
      nonDeductibleAmount: r.nonDeductibleAmount ? parseFloat(r.nonDeductibleAmount) : null,
      tipAmount: r.tipAmount ? parseFloat(r.tipAmount) : null,
      taxAmount: r.taxAmount ? parseFloat(r.taxAmount) : null,
      receiptUrl: toServingUrl(r.receiptUrl),
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch trip receipts" });
  }
});

export default router;
