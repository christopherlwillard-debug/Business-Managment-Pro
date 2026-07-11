import { Router } from "express";
import { db } from "@workspace/db";
import { expensesTable, jobsTable, subcontractorsTable, jobSubcontractorsTable, businessesTable, subPaymentRecordsTable, businessTripsTable } from "@workspace/db/schema";
import { eq, and, gte, lte, sql, isNull, or, desc } from "drizzle-orm";
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
    // Exclude auto-expenses linked to sub hours (jobSubHoursId IS NOT NULL).
    // Those are internal job-cost entries used for P&L math; actual cash paid
    // to hourly subs is captured by sub_payment_records rows (shown below).
    const conditions: any[] = [isNull(expensesTable.jobSubHoursId)];
    if (category) conditions.push(eq(expensesTable.category, category as string));
    if (jobId) conditions.push(eq(expensesTable.jobId, parseInt(jobId as string)));
    if (startDate) conditions.push(gte(expensesTable.date, startDate as string));
    if (endDate) conditions.push(lte(expensesTable.date, endDate as string));
    if (businessId) conditions.push(or(eq(expensesTable.businessId, parseInt(businessId as string)), isNull(expensesTable.businessId)));

    // sub_payment_records should appear alongside expenses for reconciliation.
    // Only include them when the category filter is absent or set to "Subcontractor".
    const includeSpr = !category || (category as string).toLowerCase() === "subcontractor";

    const [expenses, sprRows] = await Promise.all([
      buildExpenseQuery()
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(expensesTable.date),
      includeSpr
        ? db.select({
            id: subPaymentRecordsTable.id,
            amount: subPaymentRecordsTable.amount,
            paymentDate: subPaymentRecordsTable.paymentDate,
            description: subPaymentRecordsTable.description,
            notes: subPaymentRecordsTable.notes,
            paymentMethod: subPaymentRecordsTable.paymentMethod,
            referenceNumber: subPaymentRecordsTable.referenceNumber,
            businessLine: subPaymentRecordsTable.businessLine,
            jobId: subPaymentRecordsTable.jobId,
            subcontractorId: subPaymentRecordsTable.subcontractorId,
            createdAt: subPaymentRecordsTable.createdAt,
            agreedOwedSnapshot: subPaymentRecordsTable.agreedOwedSnapshot,
            jobTitle: jobsTable.title,
            subcontractorName: subcontractorsTable.name,
          })
          .from(subPaymentRecordsTable)
          .leftJoin(jobsTable, eq(subPaymentRecordsTable.jobId, jobsTable.id))
          .leftJoin(subcontractorsTable, eq(subPaymentRecordsTable.subcontractorId, subcontractorsTable.id))
          .where(and(
            sql`${subPaymentRecordsTable.isReversal} IS NOT TRUE`,
            ...(jobId ? [eq(subPaymentRecordsTable.jobId, parseInt(jobId as string))] : []),
            ...(startDate ? [gte(subPaymentRecordsTable.paymentDate, startDate as string)] : []),
            ...(endDate ? [lte(subPaymentRecordsTable.paymentDate, endDate as string)] : []),
          ))
        : Promise.resolve([]),
    ]);

    const formatted = expenses.map(e => formatExpense(e, e.jobTitle, e.subcontractorName));

    const sprFormatted = (sprRows as any[]).map(spr => ({
      // Use negative id to guarantee no collision with real expense ids
      id: -(spr.id as number),
      _sprId: spr.id,
      _source: "sub_payment_record",
      description: spr.description || `${spr.subcontractorName ?? "Sub"} — Allocation/Fixed Pay`,
      amount: parseFloat(spr.amount ?? "0"),
      category: "Subcontractor",
      date: spr.paymentDate,
      vendor: null,
      jobId: spr.jobId,
      jobTitle: spr.jobTitle ?? null,
      subcontractorId: spr.subcontractorId,
      subcontractorName: spr.subcontractorName ?? null,
      businessLine: spr.businessLine ?? null,
      businessId: null,
      notes: spr.notes ?? null,
      receiptUrl: null,
      excludeFromNetProfit: false,
      jobSubHoursId: null,
      recurringExpenseId: null,
      paymentMethod: spr.paymentMethod ?? null,
      referenceNumber: spr.referenceNumber ?? null,
      agreedOwed: spr.agreedOwedSnapshot ? parseFloat(spr.agreedOwedSnapshot) : null,
      createdAt: spr.createdAt instanceof Date ? spr.createdAt.toISOString() : spr.createdAt,
    }));

    // Merge and sort descending by date so the list is chronologically consistent
    const all = [...formatted, ...sprFormatted].sort((a, b) =>
      (b.date ?? "").localeCompare(a.date ?? "")
    );

    res.json(all);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch expenses" });
  }
});

router.post("/", async (req, res) => {
  try {
    const {
      description, amount, category, date, vendor, jobId, subcontractorId, receiptUrl, notes,
      excludeFromNetProfit, countsTowardJobProfit, businessLine, businessId,
      tripId, overnightTravel, isPotentiallyNondeductible,
      mealTotal, deductibleAmount, nonDeductibleAmount, tipAmount, taxAmount,
      numPeople, paidBy, receiptStatus, receiptMissingExplanation,
    } = req.body;
    if (!description || !amount || !category || !date) return res.status(400).json({ error: "Missing required fields" });
    if (receiptStatus === "missing" && !receiptMissingExplanation?.trim()) {
      return res.status(400).json({ error: "receiptMissingExplanation is required when receiptStatus is 'missing'" });
    }

    const validBusinessLines = ["general_contracting", "asphalt_sealing"];
    const isMealCategory = category?.toLowerCase() === "meals";
    const parsedMealTotal = mealTotal ? parseFloat(mealTotal) : (isMealCategory ? parseFloat(amount) : null);
    // Always derive server-side: 50/50 split from mealTotal (client overrides not accepted)
    const computedDeductible = parsedMealTotal != null ? parsedMealTotal * 0.5 : null;
    const computedNonDeductible = parsedMealTotal != null ? parsedMealTotal * 0.5 : null;

    // Trip validation: check trip is open + inherit businessPurpose for notes
    let resolvedNotes = notes || null;
    if (tripId) {
      const [parentTrip] = await db.select({ status: businessTripsTable.status, businessPurpose: businessTripsTable.businessPurpose })
        .from(businessTripsTable).where(eq(businessTripsTable.id, parseInt(tripId)));
      if (!parentTrip) return res.status(400).json({ error: "Trip not found" });
      if (parentTrip.status !== 'open') return res.status(400).json({ error: "Cannot add receipts to a completed or archived trip" });
      if (!resolvedNotes && parentTrip.businessPurpose) resolvedNotes = parentTrip.businessPurpose;
    }

    // If businessLine is given but no explicit businessId, resolve the slug → id
    let resolvedBusinessId: number | null = businessId ? parseInt(businessId) : null;
    const resolvedBusinessLine = validBusinessLines.includes(businessLine) ? businessLine : null;
    if (resolvedBusinessLine && !resolvedBusinessId) {
      const [biz] = await db.select({ id: businessesTable.id })
        .from(businessesTable)
        .where(eq(businessesTable.slug, resolvedBusinessLine))
        .limit(1);
      if (biz) resolvedBusinessId = biz.id;
    }

    const [expense] = await db.insert(expensesTable).values({
      description, amount: amount.toString(), category, date,
      vendor, jobId: jobId || null, subcontractorId: subcontractorId || null, receiptUrl, notes: resolvedNotes,
      excludeFromNetProfit: excludeFromNetProfit === true,
      countsTowardJobProfit: countsTowardJobProfit === false ? false : true,
      businessLine: resolvedBusinessLine,
      businessId: resolvedBusinessId,
      tripId: tripId ? parseInt(tripId) : null,
      overnightTravel: overnightTravel === true ? true : (overnightTravel === false ? false : null),
      isPotentiallyNondeductible: isPotentiallyNondeductible === true,
      mealTotal: parsedMealTotal != null ? parsedMealTotal.toString() : null,
      deductibleAmount: computedDeductible != null ? computedDeductible.toString() : null,
      nonDeductibleAmount: computedNonDeductible != null ? computedNonDeductible.toString() : null,
      tipAmount: tipAmount ? parseFloat(tipAmount).toString() : null,
      taxAmount: taxAmount ? parseFloat(taxAmount).toString() : null,
      numPeople: numPeople ? parseInt(numPeople) : null,
      paidBy: paidBy || null,
      receiptStatus: receiptStatus || "uploaded",
      receiptMissingExplanation: receiptMissingExplanation || null,
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
    const {
      description, amount, category, date, vendor, jobId, subcontractorId, receiptUrl, notes,
      excludeFromNetProfit, countsTowardJobProfit, businessLine, businessId,
      tripId, overnightTravel, isPotentiallyNondeductible,
      mealTotal, deductibleAmount, nonDeductibleAmount, tipAmount, taxAmount,
      numPeople, paidBy, receiptStatus, receiptMissingExplanation,
    } = req.body;

    // Capture old values before updating
    const [before] = await db.select().from(expensesTable).where(eq(expensesTable.id, id));
    if (!before) return res.status(404).json({ error: "Expense not found" });

    // Validate receipt proof: check resulting status (request value or existing)
    const resultingReceiptStatus = receiptStatus !== undefined ? receiptStatus : before.receiptStatus;
    if (resultingReceiptStatus === "missing") {
      const resultingExplanation = receiptMissingExplanation !== undefined ? receiptMissingExplanation : before.receiptMissingExplanation;
      if (!resultingExplanation?.trim()) {
        return res.status(400).json({ error: "receiptMissingExplanation is required when receiptStatus is 'missing'" });
      }
    }
    // Block explicitly setting receiptStatus='uploaded' without an actual file URL.
    // Only fires when the caller is actively changing the status to 'uploaded';
    // existing rows that already have receiptStatus='uploaded' but no URL are not
    // blocked from unrelated field edits (e.g. toggling countsTowardJobProfit).
    if (receiptStatus === "uploaded") {
      const resultingReceiptUrl = receiptUrl !== undefined ? receiptUrl : before.receiptUrl;
      if (!resultingReceiptUrl?.trim()) {
        return res.status(400).json({ error: "receiptUrl is required when receiptStatus is 'uploaded'" });
      }
    }

    // Trip lock: block all edits to receipts attached to a non-open trip
    // (a) if attaching to / moving to a new trip, that trip must be open
    if (tripId !== undefined && tripId) {
      const [targetTrip] = await db.select({ status: businessTripsTable.status })
        .from(businessTripsTable).where(eq(businessTripsTable.id, parseInt(tripId)));
      if (!targetTrip) return res.status(400).json({ error: "Trip not found" });
      if (targetTrip.status !== 'open') return res.status(400).json({ error: "Cannot move receipt to a completed or archived trip" });
    }
    // (b) if expense is already in a trip and tripId is not being cleared, lock the edit
    if (before.tripId && !(tripId !== undefined && !tripId)) {
      const [currentTrip] = await db.select({ status: businessTripsTable.status })
        .from(businessTripsTable).where(eq(businessTripsTable.id, before.tripId));
      if (currentTrip && currentTrip.status !== 'open') {
        return res.status(400).json({ error: "Cannot modify receipts attached to a completed or archived trip. Reopen the trip first." });
      }
    }

    const validBusinessLines = ["general_contracting", "asphalt_sealing"];

    const isMealCategory = (category ?? before.category)?.toLowerCase() === "meals";
    // Recompute meal split whenever mealTotal or amount (for meal category) changes
    const shouldRecomputeMealSplit = mealTotal !== undefined || (amount !== undefined && isMealCategory);
    const parsedMealTotal = mealTotal !== undefined
      ? (mealTotal ? parseFloat(mealTotal) : null)
      : (amount !== undefined && isMealCategory ? parseFloat(amount) : null);
    const computedDeductible = parsedMealTotal != null ? parsedMealTotal * 0.5 : null;
    const computedNonDeductible = parsedMealTotal != null ? parsedMealTotal * 0.5 : null;

    const [updated] = await db.update(expensesTable).set({
      ...(description !== undefined && { description }),
      ...(amount !== undefined && { amount: amount.toString() }),
      ...(category !== undefined && { category }),
      ...(date !== undefined && { date }),
      ...(vendor !== undefined && { vendor }),
      ...(jobId !== undefined && { jobId: jobId || null }),
      ...(subcontractorId !== undefined && { subcontractorId: subcontractorId || null }),
      ...(receiptUrl !== undefined && { receiptUrl }),
      ...(notes !== undefined && { notes }),
      ...(excludeFromNetProfit !== undefined && { excludeFromNetProfit: excludeFromNetProfit === true }),
      ...(countsTowardJobProfit !== undefined && { countsTowardJobProfit: countsTowardJobProfit === false ? false : true }),
      ...(businessLine !== undefined && { businessLine: validBusinessLines.includes(businessLine) ? businessLine : null }),
      ...(businessId !== undefined && { businessId: businessId ? parseInt(String(businessId)) : null }),
      ...(tripId !== undefined && { tripId: tripId ? parseInt(tripId) : null }),
      ...(overnightTravel !== undefined && { overnightTravel }),
      ...(isPotentiallyNondeductible !== undefined && { isPotentiallyNondeductible: isPotentiallyNondeductible === true }),
      ...(shouldRecomputeMealSplit && {
        mealTotal: parsedMealTotal != null ? parsedMealTotal.toString() : null,
        deductibleAmount: computedDeductible != null ? computedDeductible.toString() : null,
        nonDeductibleAmount: computedNonDeductible != null ? computedNonDeductible.toString() : null,
      }),
      ...(tipAmount !== undefined && { tipAmount: tipAmount ? parseFloat(tipAmount).toString() : null }),
      ...(taxAmount !== undefined && { taxAmount: taxAmount ? parseFloat(taxAmount).toString() : null }),
      ...(numPeople !== undefined && { numPeople: numPeople ? parseInt(numPeople) : null }),
      ...(paidBy !== undefined && { paidBy: paidBy || null }),
      ...(receiptStatus !== undefined && { receiptStatus }),
      ...(receiptMissingExplanation !== undefined && { receiptMissingExplanation: receiptMissingExplanation || null }),
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

router.delete("/spr/:sprId", async (req, res) => {
  try {
    const sprId = parseInt(req.params.sprId);
    if (isNaN(sprId)) return res.status(400).json({ error: "Invalid id" });
    await db.delete(subPaymentRecordsTable).where(eq(subPaymentRecordsTable.id, sprId));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete payment record" });
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
