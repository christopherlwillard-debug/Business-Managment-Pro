import { Router } from "express";
import { db } from "@workspace/db";
import { subcontractorsTable, jobsTable, expensesTable, mileageLogsTable, settingsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

const router = Router();

async function getSubByToken(token: string) {
  const [sub] = await db.select().from(subcontractorsTable).where(eq(subcontractorsTable.portalToken, token));
  return sub ?? null;
}

async function getRate() {
  const [s] = await db.select().from(settingsTable).limit(1);
  return parseFloat(s?.mileageRate ?? "0.725");
}

router.post("/generate/:subId", async (req, res) => {
  try {
    const id = parseInt(req.params.subId);
    const token = crypto.randomUUID();
    const [sub] = await db.update(subcontractorsTable).set({ portalToken: token }).where(eq(subcontractorsTable.id, id)).returning();
    if (!sub) return res.status(404).json({ error: "Subcontractor not found" });
    res.json({ portalToken: token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate portal token" });
  }
});

router.get("/:token", async (req, res) => {
  try {
    const sub = await getSubByToken(req.params.token);
    if (!sub) return res.status(404).json({ error: "Invalid portal link" });

    const jobs = await db.select().from(jobsTable).where(eq(jobsTable.subcontractorId, sub.id));
    const expenses = await db.select().from(expensesTable).where(eq(expensesTable.subcontractorId, sub.id));
    const mileage = await db.select().from(mileageLogsTable).where(eq(mileageLogsTable.subcontractorId, sub.id));

    const totalExpenses = expenses.reduce((s, e) => s + parseFloat(e.amount), 0);
    const totalMiles = mileage.filter(m => m.classification === "business").reduce((s, m) => s + parseFloat(m.miles), 0);
    const rate = await getRate();

    res.json({
      subcontractor: {
        id: sub.id,
        name: sub.name,
        trade: sub.trade,
        ytdPayments: parseFloat(sub.ytdPayments ?? "0"),
      },
      jobs: jobs.map(j => ({
        id: j.id,
        title: j.title,
        status: j.status,
        city: j.city,
        state: j.state,
        startDate: j.startDate,
        endDate: j.endDate,
        description: j.description,
      })),
      stats: {
        ytdPayments: parseFloat(sub.ytdPayments ?? "0"),
        totalExpenses,
        totalMiles,
        mileageDeduction: totalMiles * rate,
        ratePerMile: rate,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load portal" });
  }
});

router.get("/:token/expenses", async (req, res) => {
  try {
    const sub = await getSubByToken(req.params.token);
    if (!sub) return res.status(404).json({ error: "Invalid portal link" });
    const expenses = await db.select().from(expensesTable).where(eq(expensesTable.subcontractorId, sub.id)).orderBy(expensesTable.date);
    res.json(expenses.map(e => ({ ...e, amount: parseFloat(e.amount) })));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch expenses" });
  }
});

router.post("/:token/expenses", async (req, res) => {
  try {
    const sub = await getSubByToken(req.params.token);
    if (!sub) return res.status(404).json({ error: "Invalid portal link" });
    const { description, amount, category, date, vendor, jobId, notes } = req.body;
    if (!description || !amount || !category || !date) return res.status(400).json({ error: "Missing required fields" });
    const [expense] = await db.insert(expensesTable).values({
      description, amount: amount.toString(), category, date,
      vendor, jobId: jobId || null, notes,
      subcontractorId: sub.id,
    }).returning();
    res.status(201).json({ ...expense, amount: parseFloat(expense.amount) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create expense" });
  }
});

router.delete("/:token/expenses/:id", async (req, res) => {
  try {
    const sub = await getSubByToken(req.params.token);
    if (!sub) return res.status(404).json({ error: "Invalid portal link" });
    await db.delete(expensesTable).where(and(eq(expensesTable.id, parseInt(req.params.id)), eq(expensesTable.subcontractorId, sub.id)));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Failed to delete expense" });
  }
});

router.get("/:token/mileage", async (req, res) => {
  try {
    const sub = await getSubByToken(req.params.token);
    if (!sub) return res.status(404).json({ error: "Invalid portal link" });
    const logs = await db.select().from(mileageLogsTable).where(eq(mileageLogsTable.subcontractorId, sub.id)).orderBy(mileageLogsTable.date);
    res.json(logs.map(m => ({ ...m, miles: parseFloat(m.miles), deductionAmount: parseFloat(m.deductionAmount), ratePerMile: parseFloat(m.ratePerMile) })));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch mileage" });
  }
});

router.post("/:token/mileage", async (req, res) => {
  try {
    const sub = await getSubByToken(req.params.token);
    if (!sub) return res.status(404).json({ error: "Invalid portal link" });
    const { date, miles, startLocation, endLocation, purpose, jobId, classification, notes } = req.body;
    if (!date || miles == null) return res.status(400).json({ error: "Missing required fields" });
    const rate = await getRate();
    const deductionAmount = classification === "business" ? parseFloat(miles) * rate : 0;
    const [log] = await db.insert(mileageLogsTable).values({
      date, miles: miles.toString(), startLocation, endLocation,
      purpose, jobId: jobId || null, classification: classification || "business",
      ratePerMile: rate.toString(), deductionAmount: deductionAmount.toString(),
      notes, subcontractorId: sub.id,
    }).returning();
    res.status(201).json({ ...log, miles: parseFloat(log.miles), deductionAmount: parseFloat(log.deductionAmount), ratePerMile: parseFloat(log.ratePerMile) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create mileage log" });
  }
});

router.delete("/:token/mileage/:id", async (req, res) => {
  try {
    const sub = await getSubByToken(req.params.token);
    if (!sub) return res.status(404).json({ error: "Invalid portal link" });
    await db.delete(mileageLogsTable).where(and(eq(mileageLogsTable.id, parseInt(req.params.id)), eq(mileageLogsTable.subcontractorId, sub.id)));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Failed to delete mileage log" });
  }
});

export default router;
