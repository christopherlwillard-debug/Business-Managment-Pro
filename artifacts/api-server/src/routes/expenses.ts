import { Router } from "express";
import { db } from "@workspace/db";
import { expensesTable, jobsTable } from "@workspace/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = Router();

const uploadsDir = path.resolve("uploads/receipts");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

function formatExpense(e: any, jobTitle?: string | null) {
  return {
    ...e,
    jobTitle: jobTitle ?? null,
    amount: parseFloat(e.amount ?? "0"),
    createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
  };
}

router.get("/", async (req, res) => {
  try {
    const { category, jobId, startDate, endDate } = req.query;
    const conditions: any[] = [];
    if (category) conditions.push(eq(expensesTable.category, category as string));
    if (jobId) conditions.push(eq(expensesTable.jobId, parseInt(jobId as string)));
    if (startDate) conditions.push(gte(expensesTable.date, startDate as string));
    if (endDate) conditions.push(lte(expensesTable.date, endDate as string));

    const expenses = await db
      .select({ ...expensesTable, jobTitle: jobsTable.title })
      .from(expensesTable)
      .leftJoin(jobsTable, eq(expensesTable.jobId, jobsTable.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(expensesTable.date);

    res.json(expenses.map(e => formatExpense(e, e.jobTitle)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch expenses" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { description, amount, category, date, vendor, jobId, receiptUrl, notes } = req.body;
    if (!description || !amount || !category || !date) return res.status(400).json({ error: "Missing required fields" });

    const [expense] = await db.insert(expensesTable).values({
      description, amount: amount.toString(), category, date,
      vendor, jobId: jobId || null, receiptUrl, notes
    }).returning();

    let jobTitle = null;
    if (expense.jobId) {
      const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, expense.jobId));
      jobTitle = job?.title;
    }
    res.status(201).json(formatExpense(expense, jobTitle));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create expense" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [expense] = await db.select({ ...expensesTable, jobTitle: jobsTable.title }).from(expensesTable).leftJoin(jobsTable, eq(expensesTable.jobId, jobsTable.id)).where(eq(expensesTable.id, id));
    if (!expense) return res.status(404).json({ error: "Expense not found" });
    res.json(formatExpense(expense, expense.jobTitle));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch expense" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { description, amount, category, date, vendor, jobId, receiptUrl, notes } = req.body;

    const [expense] = await db.update(expensesTable).set({
      description, amount: amount?.toString(), category, date,
      vendor, jobId: jobId || null, receiptUrl, notes
    }).where(eq(expensesTable.id, id)).returning();
    if (!expense) return res.status(404).json({ error: "Expense not found" });

    let jobTitle = null;
    if (expense.jobId) {
      const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, expense.jobId));
      jobTitle = job?.title;
    }
    res.json(formatExpense(expense, jobTitle));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update expense" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await db.delete(expensesTable).where(eq(expensesTable.id, parseInt(req.params.id)));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete expense" });
  }
});

router.post("/:id/receipt", upload.single("receipt"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const receiptUrl = `/api/uploads/receipts/${req.file.filename}`;
    const [expense] = await db.update(expensesTable).set({ receiptUrl }).where(eq(expensesTable.id, id)).returning();
    if (!expense) return res.status(404).json({ error: "Expense not found" });

    let jobTitle = null;
    if (expense.jobId) {
      const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, expense.jobId));
      jobTitle = job?.title;
    }
    res.json(formatExpense(expense, jobTitle));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to upload receipt" });
  }
});

export default router;
