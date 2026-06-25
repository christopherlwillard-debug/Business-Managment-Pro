import { Router } from "express";
import { db } from "@workspace/db";
import { expensesTable, jobsTable, subcontractorsTable, jobSubcontractorsTable, businessesTable } from "@workspace/db/schema";
import { eq, and, gte, lte, sql, isNull, or } from "drizzle-orm";
import multer from "multer";
import sharp from "sharp";
import { ObjectStorageService } from "../lib/objectStorage";

const router = Router();
const objectStorage = new ObjectStorageService();

async function syncJobSubPayment(jobId: number, subId: number): Promise<void> {
  const [sumRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${expensesTable.amount}), 0)` })
    .from(expensesTable)
    .where(and(
      sql`LOWER(${expensesTable.category}) = 'subcontractor'`,
      eq(expensesTable.jobId, jobId),
      eq(expensesTable.subcontractorId, subId),
      isNull(expensesTable.jobSubHoursId),
    ));
  const total = parseFloat(sumRow?.total ?? "0");
  await db.insert(jobSubcontractorsTable)
    .values({ jobId, subcontractorId: subId, amountPaid: String(total) })
    .onConflictDoUpdate({
      target: [jobSubcontractorsTable.jobId, jobSubcontractorsTable.subcontractorId],
      set: { amountPaid: String(total) },
    });
}

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
  businessName: businessesTable.name,
};

function buildExpenseQuery() {
  return db
    .select(expenseSelect)
    .from(expensesTable)
    .leftJoin(jobsTable, eq(expensesTable.jobId, jobsTable.id))
    .leftJoin(subcontractorsTable, eq(expensesTable.subcontractorId, subcontractorsTable.id))
    .leftJoin(businessesTable, eq(expensesTable.businessId, businessesTable.id));
}

router.get("/", async (req, res) => {
  try {
    const { category, jobId, startDate, endDate, businessId } = req.query;
    // Show ALL expenses including subcontractor payment records so users can see and delete them.
    const conditions: any[] = [];
    if (category) conditions.push(eq(expensesTable.category, category as string));
    if (jobId) conditions.push(eq(expensesTable.jobId, parseInt(jobId as string)));
    if (startDate) conditions.push(gte(expensesTable.date, startDate as string));
    if (endDate) conditions.push(lte(expensesTable.date, endDate as string));
    if (businessId) conditions.push(or(eq(expensesTable.businessId, parseInt(businessId as string)), isNull(expensesTable.businessId)));

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
    const { description, amount, category, date, vendor, jobId, subcontractorId, receiptUrl, notes, excludeFromNetProfit, businessLine, businessId } = req.body;
    if (!description || !amount || !category || !date) return res.status(400).json({ error: "Missing required fields" });

    const validBusinessLines = ["general_contracting", "asphalt_sealing"];
    const [expense] = await db.insert(expensesTable).values({
      description, amount: amount.toString(), category, date,
      vendor, jobId: jobId || null, subcontractorId: subcontractorId || null, receiptUrl, notes,
      excludeFromNetProfit: excludeFromNetProfit === true,
      businessLine: validBusinessLines.includes(businessLine) ? businessLine : null,
      businessId: businessId ? parseInt(businessId) : null,
    }).returning();

    if (expense.category?.toLowerCase() === "subcontractor" && expense.jobId && expense.subcontractorId) {
      await syncJobSubPayment(expense.jobId, expense.subcontractorId);
    }

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
    const { description, amount, category, date, vendor, jobId, subcontractorId, receiptUrl, notes, excludeFromNetProfit, businessLine, businessId } = req.body;

    // Capture old values before updating so we can recompute the old pair if it changed
    const [before] = await db.select().from(expensesTable).where(eq(expensesTable.id, id));
    if (!before) return res.status(404).json({ error: "Expense not found" });

    const validBusinessLines = ["general_contracting", "asphalt_sealing"];
    const [updated] = await db.update(expensesTable).set({
      description, amount: amount?.toString(), category, date,
      vendor, jobId: jobId || null, subcontractorId: subcontractorId || null, receiptUrl, notes,
      ...(excludeFromNetProfit !== undefined && { excludeFromNetProfit: excludeFromNetProfit === true }),
      ...(businessLine !== undefined && { businessLine: validBusinessLines.includes(businessLine) ? businessLine : null }),
      ...(businessId !== undefined && { businessId: businessId ? parseInt(String(businessId)) : null }),
    }).where(eq(expensesTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Expense not found" });

    // Recompute sub payment totals for any affected (jobId, subcontractorId) pairs.
    // We need to sync both: the new pair (may have new amounts) and the old pair (expense was
    // moved away, so its contribution must be removed from the old pair's total).
    const pairsToSync = new Set<string>();
    if (updated.category?.toLowerCase() === "subcontractor" && updated.jobId && updated.subcontractorId) {
      pairsToSync.add(`${updated.jobId}:${updated.subcontractorId}`);
    }
    if (before.category?.toLowerCase() === "subcontractor" && before.jobId && before.subcontractorId) {
      pairsToSync.add(`${before.jobId}:${before.subcontractorId}`);
    }
    for (const pair of pairsToSync) {
      const [jId, sId] = pair.split(":").map(Number);
      await syncJobSubPayment(jId, sId);
    }

    const [joined] = await buildExpenseQuery().where(eq(expensesTable.id, updated.id));
    res.json(formatExpense(joined ?? updated, joined?.jobTitle, joined?.subcontractorName));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update expense" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const [toDelete] = await db.select().from(expensesTable).where(eq(expensesTable.id, parseInt(req.params.id)));
    await db.delete(expensesTable).where(eq(expensesTable.id, parseInt(req.params.id)));
    if (toDelete?.category?.toLowerCase() === "subcontractor" && toDelete.jobId && toDelete.subcontractorId) {
      await syncJobSubPayment(toDelete.jobId, toDelete.subcontractorId);
    }
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
