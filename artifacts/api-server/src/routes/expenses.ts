import { Router } from "express";
import { db } from "@workspace/db";
import { expensesTable, jobsTable, subcontractorsTable } from "@workspace/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import multer from "multer";
import sharp from "sharp";
import { ObjectStorageService } from "../lib/objectStorage";

const router = Router();
const objectStorage = new ObjectStorageService();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

/** Convert a raw DB path to a correct serving URL.
 * - /objects/...      → /api/storage/objects/... (GCS-backed, new uploads)
 * - /api/uploads/...  → returned as-is (legacy, served by static middleware)
 * - /uploads/...      → /api/uploads/... (corrects a brief bad-fix period)
 */
function toServingUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.startsWith("/objects/")) return `/api/storage/objects/${raw.slice("/objects/".length)}`;
  if (raw.startsWith("/uploads/")) return `/api${raw}`;
  return raw; // Already /api/uploads/... or http://...
}

function formatExpense(e: any, jobTitle?: string | null, subcontractorName?: string | null) {
  return {
    ...e,
    jobTitle: jobTitle ?? null,
    subcontractorName: subcontractorName ?? null,
    amount: parseFloat(e.amount ?? "0"),
    createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
    receiptUrl: toServingUrl(e.receiptUrl),
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
    // Show ALL expenses including subcontractor payment records so users can see and delete them.
    const conditions: any[] = [];
    if (category) conditions.push(eq(expensesTable.category, category as string));
    if (jobId) conditions.push(eq(expensesTable.jobId, parseInt(jobId as string)));
    if (startDate) conditions.push(gte(expensesTable.date, startDate as string));
    if (endDate) conditions.push(lte(expensesTable.date, endDate as string));

    const expenses = await buildExpenseQuery()
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(expensesTable.date);

    res.json(expenses.map(e => formatExpense(e, e.jobTitle, e.subcontractorName)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch expenses" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { description, amount, category, date, vendor, jobId, subcontractorId, receiptUrl, notes, excludeFromNetProfit, businessLine } = req.body;
    if (!description || !amount || !category || !date) return res.status(400).json({ error: "Missing required fields" });

    const validBusinessLines = ["general_contracting", "asphalt_sealing"];
    const [expense] = await db.insert(expensesTable).values({
      description, amount: amount.toString(), category, date,
      vendor, jobId: jobId || null, subcontractorId: subcontractorId || null, receiptUrl, notes,
      excludeFromNetProfit: excludeFromNetProfit === true,
      businessLine: validBusinessLines.includes(businessLine) ? businessLine : null,
    }).returning();

    // Client derives jobTitle/subcontractorName from its own loaded lists — skip the JOIN
    res.status(201).json(formatExpense(expense, null, null));
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
    const { description, amount, category, date, vendor, jobId, subcontractorId, receiptUrl, notes, excludeFromNetProfit, businessLine } = req.body;

    const validBusinessLines = ["general_contracting", "asphalt_sealing"];
    const [updated] = await db.update(expensesTable).set({
      description, amount: amount?.toString(), category, date,
      vendor, jobId: jobId || null, subcontractorId: subcontractorId || null, receiptUrl, notes,
      ...(excludeFromNetProfit !== undefined && { excludeFromNetProfit: excludeFromNetProfit === true }),
      ...(businessLine !== undefined && { businessLine: validBusinessLines.includes(businessLine) ? businessLine : null }),
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

    let fileBuffer = req.file.buffer;
    let fileMimetype = req.file.mimetype;
    let originalFilename = req.file.originalname;

    // Convert HEIC/HEIF (iPhone photos) to JPEG for universal browser support
    const isHeic =
      fileMimetype === "image/heic" ||
      fileMimetype === "image/heif" ||
      /\.(heic|heif)$/i.test(originalFilename);

    if (isHeic) {
      fileBuffer = await sharp(fileBuffer).jpeg({ quality: 90 }).toBuffer();
      fileMimetype = "image/jpeg";
      // Always strip any existing extension and add .jpg to guarantee correct ext
      originalFilename = originalFilename.replace(/\.[^.]+$/, "") + ".jpg";
    }

    // Upload to GCS and store the objectPath
    const objectPath = await objectStorage.uploadBufferWithFilename(
      fileBuffer,
      fileMimetype,
      "uploads/receipts",
      originalFilename
    );

    const [updated] = await db.update(expensesTable).set({ receiptUrl: objectPath }).where(eq(expensesTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Expense not found" });

    const [joined] = await buildExpenseQuery().where(eq(expensesTable.id, updated.id));
    res.json(formatExpense(joined ?? updated, joined?.jobTitle, joined?.subcontractorName));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to upload receipt" });
  }
});

export default router;
