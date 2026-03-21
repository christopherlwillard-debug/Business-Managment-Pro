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

// Generate portal token for a sub
router.post("/generate/:subId", async (req, res) => {
  try {
    const id = parseInt(req.params.subId);
    const token = crypto.randomUUID();
    const [sub] = await db
      .update(subcontractorsTable)
      .set({ portalToken: token })
      .where(eq(subcontractorsTable.id, id))
      .returning();
    if (!sub) return res.status(404).json({ error: "Subcontractor not found" });
    res.json({ portalToken: token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate portal token" });
  }
});

// Get full portal data
router.get("/:token", async (req, res) => {
  try {
    const sub = await getSubByToken(req.params.token);
    if (!sub) return res.status(404).json({ error: "Invalid portal link" });

    const [jobs, expenses, mileage] = await Promise.all([
      db.select().from(jobsTable).where(eq(jobsTable.subcontractorId, sub.id)),
      db.select().from(expensesTable).where(eq(expensesTable.subcontractorId, sub.id)),
      db.select().from(mileageLogsTable).where(eq(mileageLogsTable.subcontractorId, sub.id)),
    ]);

    const totalExpenses = expenses.reduce((s, e) => s + parseFloat(e.amount), 0);
    const businessMileage = mileage.filter(m => m.classification === "business");
    const totalMiles = businessMileage.reduce((s, m) => s + parseFloat(m.miles), 0);
    const rate = await getRate();

    const features: string[] = Array.isArray(sub.portalFeatures)
      ? (sub.portalFeatures as string[])
      : ["payments", "jobs", "expenses", "mileage", "w9"];

    res.json({
      subcontractor: {
        id: sub.id,
        name: sub.name,
        email: sub.email,
        phone: sub.phone,
        trade: sub.trade,
        ytdPayments: parseFloat(sub.ytdPayments ?? "0"),
        w9OnFile: sub.w9OnFile,
        // W-9 data (masked TIN)
        w9LegalName: sub.w9LegalName,
        w9BusinessName: sub.w9BusinessName,
        w9TaxClassification: sub.w9TaxClassification,
        w9LlcType: sub.w9LlcType,
        w9Address: sub.w9Address,
        w9City: sub.w9City,
        w9State: sub.w9State,
        w9Zip: sub.w9Zip,
        w9TaxIdType: sub.w9TaxIdType,
        w9TaxIdMasked: sub.w9TaxId ? maskTaxId(sub.w9TaxId) : null,
        w9Signature: sub.w9Signature,
        w9SignedAt: sub.w9SignedAt,
        w9Complete: !!sub.w9Signature,
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
        expenseCount: expenses.length,
        mileageCount: mileage.length,
      },
      features,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load portal" });
  }
});

function maskTaxId(id: string): string {
  if (id.length <= 4) return "***-" + id;
  return "***-**-" + id.slice(-4);
}

// Save W-9 data
router.put("/:token/w9", async (req, res) => {
  try {
    const sub = await getSubByToken(req.params.token);
    if (!sub) return res.status(404).json({ error: "Invalid portal link" });

    const {
      w9LegalName, w9BusinessName, w9TaxClassification, w9LlcType,
      w9Address, w9City, w9State, w9Zip,
      w9TaxIdType, w9TaxId, w9Signature,
    } = req.body;

    if (!w9LegalName || !w9TaxClassification || !w9Address || !w9City || !w9State || !w9Zip || !w9TaxIdType || !w9TaxId || !w9Signature) {
      return res.status(400).json({ error: "All W-9 fields are required" });
    }

    const signedAt = new Date().toISOString().split("T")[0];

    const [updated] = await db
      .update(subcontractorsTable)
      .set({
        w9LegalName, w9BusinessName, w9TaxClassification, w9LlcType,
        w9Address, w9City, w9State, w9Zip,
        w9TaxIdType, w9TaxId, w9Signature, w9SignedAt: signedAt,
        w9OnFile: true,
      })
      .where(eq(subcontractorsTable.id, sub.id))
      .returning();

    res.json({ success: true, w9SignedAt: signedAt, w9OnFile: true, w9TaxIdMasked: maskTaxId(w9TaxId) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save W-9" });
  }
});

// Save portal feature preferences
router.put("/:token/features", async (req, res) => {
  try {
    const sub = await getSubByToken(req.params.token);
    if (!sub) return res.status(404).json({ error: "Invalid portal link" });

    const { features } = req.body;
    if (!Array.isArray(features)) return res.status(400).json({ error: "features must be an array" });

    await db
      .update(subcontractorsTable)
      .set({ portalFeatures: features })
      .where(eq(subcontractorsTable.id, sub.id));

    res.json({ success: true, features });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save features" });
  }
});

// Expenses
router.get("/:token/expenses", async (req, res) => {
  try {
    const sub = await getSubByToken(req.params.token);
    if (!sub) return res.status(404).json({ error: "Invalid portal link" });
    const expenses = await db
      .select()
      .from(expensesTable)
      .where(eq(expensesTable.subcontractorId, sub.id))
      .orderBy(expensesTable.date);
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
    await db.delete(expensesTable).where(
      and(eq(expensesTable.id, parseInt(req.params.id)), eq(expensesTable.subcontractorId, sub.id))
    );
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Failed to delete expense" });
  }
});

// Mileage
router.get("/:token/mileage", async (req, res) => {
  try {
    const sub = await getSubByToken(req.params.token);
    if (!sub) return res.status(404).json({ error: "Invalid portal link" });
    const logs = await db
      .select()
      .from(mileageLogsTable)
      .where(eq(mileageLogsTable.subcontractorId, sub.id))
      .orderBy(mileageLogsTable.date);
    res.json(logs.map(m => ({
      ...m,
      miles: parseFloat(m.miles),
      deductionAmount: parseFloat(m.deductionAmount),
      ratePerMile: parseFloat(m.ratePerMile),
    })));
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
    const milesNum = parseFloat(miles);
    const deductionAmount = classification === "business" ? milesNum * rate : 0;
    const [log] = await db.insert(mileageLogsTable).values({
      date, miles: milesNum.toString(), startLocation, endLocation,
      purpose, jobId: jobId || null, classification: classification || "business",
      ratePerMile: rate.toString(), deductionAmount: deductionAmount.toString(),
      notes, subcontractorId: sub.id,
    }).returning();
    res.status(201).json({
      ...log,
      miles: parseFloat(log.miles),
      deductionAmount: parseFloat(log.deductionAmount),
      ratePerMile: parseFloat(log.ratePerMile),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create mileage log" });
  }
});

router.delete("/:token/mileage/:id", async (req, res) => {
  try {
    const sub = await getSubByToken(req.params.token);
    if (!sub) return res.status(404).json({ error: "Invalid portal link" });
    await db.delete(mileageLogsTable).where(
      and(eq(mileageLogsTable.id, parseInt(req.params.id)), eq(mileageLogsTable.subcontractorId, sub.id))
    );
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Failed to delete mileage log" });
  }
});

export default router;
