import { Router } from "express";
import { db } from "@workspace/db";
import { expensesTable, jobsTable, subcontractorsTable } from "@workspace/db/schema";
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

function formatExpense(e: any, jobTitle?: string | null, subcontractorName?: string | null) {
  return {
    ...e,
    jobTitle: jobTitle ?? null,
    subcontractorName: subcontractorName ?? null,
    amount: parseFloat(e.amount ?? "0"),
    createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
  };
}

const expenseSelect = {
  ...expensesTable,
  jobTitle: jobsTable.title,
  subcontractorName: subcontractorsTable.name,
};

function buildExpenseQuery() {
  return db
    .select(expenseSelect)
    .from(expensesTable)
    .leftJoin(jobsTable, eq(expensesTable.jobId, jobsTable.id))
    .leftJoin(subcontractorsTable, eq(expensesTable.subcontractorId, subcontractorsTable.id));
}

router.get("/", async (req, res) => {
  try {
    const { category, jobId, startDate, endDate } = req.query;
    const conditions: any[] = [];
    if (category) conditions.push(eq(expensesTable.category, category as string));
    if (jobId) conditions.push(eq(expensesTable.jobId, parseInt(jobId as string)));
    if (startDate) conditions.push(gte(expensesTable.date, startDate as string));
    if (endDate) conditions.push(lte(expensesTable.date, endDate as string));

    const expenses = await buildExpenseQuery()
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(expensesTable.date);

    res.json(expenses.map(e => formatExpense(e, e.jobTitle, e.subcontractorName)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch expenses" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { description, amount, category, date, vendor, jobId, subcontractorId, receiptUrl, notes } = req.body;
    if (!description || !amount || !category || !date) return res.status(400).json({ error: "Missing required fields" });

    const [expense] = await db.insert(expensesTable).values({
      description, amount: amount.toString(), category, date,
      vendor, jobId: jobId || null, subcontractorId: subcontractorId || null, receiptUrl, notes
    }).returning();

    const [joined] = await buildExpenseQuery().where(eq(expensesTable.id, expense.id));
    res.status(201).json(formatExpense(joined ?? expense, joined?.jobTitle, joined?.subcontractorName));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create expense" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [expense] = await buildExpenseQuery().where(eq(expensesTable.id, id));
    if (!expense) return res.status(404).json({ error: "Expense not found" });
    res.json(formatExpense(expense, expense.jobTitle, expense.subcontractorName));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch expense" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { description, amount, category, date, vendor, jobId, subcontractorId, receiptUrl, notes } = req.body;

    const [updated] = await db.update(expensesTable).set({
      description, amount: amount?.toString(), category, date,
      vendor, jobId: jobId || null, subcontractorId: subcontractorId || null, receiptUrl, notes
    }).where(eq(expensesTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Expense not found" });

    const [joined] = await buildExpenseQuery().where(eq(expensesTable.id, updated.id));
    res.json(formatExpense(joined ?? updated, joined?.jobTitle, joined?.subcontractorName));
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
    const [updated] = await db.update(expensesTable).set({ receiptUrl }).where(eq(expensesTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Expense not found" });

    const [joined] = await buildExpenseQuery().where(eq(expensesTable.id, updated.id));
    res.json(formatExpense(joined ?? updated, joined?.jobTitle, joined?.subcontractorName));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to upload receipt" });
  }
});

export default router;
