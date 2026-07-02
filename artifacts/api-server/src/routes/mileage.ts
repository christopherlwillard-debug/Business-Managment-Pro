import { Router } from "express";
import { db } from "@workspace/db";
import { mileageLogsTable, mileageImportsTable, jobsTable, settingsTable, expensesTable } from "@workspace/db/schema";
import { eq, and, gte, lte, isNull, inArray, getTableColumns } from "drizzle-orm";
import { getRequestUserId } from "./guards";

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

function getIrsRateForDate(dateStr: string): number {
  const rates = [
    { effectiveDate: "2026-01-01", rate: 0.725 },
    { effectiveDate: "2025-01-01", rate: 0.700 },
    { effectiveDate: "2024-01-01", rate: 0.670 },
    { effectiveDate: "2023-01-01", rate: 0.655 },
    { effectiveDate: "2022-07-01", rate: 0.625 },
    { effectiveDate: "2022-01-01", rate: 0.585 },
  ];
  const match = rates.find(e => dateStr >= e.effectiveDate);
  return match?.rate ?? 0.585;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthLabel(ym: string): string {
  // ym is "YYYY-MM"
  const [year, month] = ym.split("-");
  const idx = parseInt(month, 10) - 1;
  return `${MONTH_NAMES[idx] ?? month} ${year}`;
}

// Recalculate the monthly aggregate expenses for an import.
// Groups the import's business logs by month and upserts one expense per month
// (description "<Month> <Year> IRS Mileage", linked via expenses.mileage_import_id).
// Months with no remaining business logs get their aggregate expense deleted.
export async function recalcImportExpenses(importId: number) {
  const [importRecord] = await db
    .select()
    .from(mileageImportsTable)
    .where(eq(mileageImportsTable.id, importId));
  if (!importRecord) return;

  const logs = await db
    .select()
    .from(mileageLogsTable)
    .where(and(
      eq(mileageLogsTable.importId, importId),
      eq(mileageLogsTable.classification, "business"),
    ));

  // Group by "YYYY-MM"
  const byMonth = new Map<string, { miles: number; deduction: number; trips: number; lastDate: string }>();
  for (const log of logs) {
    const ym = (log.date ?? "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(ym)) continue;
    const entry = byMonth.get(ym) ?? { miles: 0, deduction: 0, trips: 0, lastDate: log.date };
    entry.miles += parseFloat(log.miles ?? "0");
    entry.deduction += parseFloat(log.deductionAmount ?? "0");
    entry.trips += 1;
    if (log.date > entry.lastDate) entry.lastDate = log.date;
    byMonth.set(ym, entry);
  }

  const existingExpenses = await db
    .select()
    .from(expensesTable)
    .where(eq(expensesTable.mileageImportId, importId));

  const existingByMonth = new Map(existingExpenses.map(e => [(e.date ?? "").slice(0, 7), e]));

  for (const [ym, agg] of byMonth) {
    const rate = getIrsRateForDate(`${ym}-15`);
    const values = {
      date: agg.lastDate,
      description: `${monthLabel(ym)} IRS Mileage`,
      vendor: "IRS Mileage",
      category: "mileage",
      amount: agg.deduction.toFixed(2),
      businessId: importRecord.businessId,
      mileageImportId: importId,
      notes: `Auto-created from ${importRecord.source} import. ${agg.trips} trip${agg.trips === 1 ? "" : "s"}, ${agg.miles.toFixed(2)} mi × $${rate}/mi`,
    };
    const existing = existingByMonth.get(ym);
    if (existing) {
      await db.update(expensesTable).set(values).where(eq(expensesTable.id, existing.id));
      existingByMonth.delete(ym);
    } else {
      await db.insert(expensesTable).values(values);
    }
  }

  // Delete aggregates for months that no longer have any business logs
  const staleIds = [...existingByMonth.values()].map(e => e.id);
  if (staleIds.length > 0) {
    await db.delete(expensesTable).where(inArray(expensesTable.id, staleIds));
  }
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
    const { startDate, endDate, businessId, importId } = req.query;
    if (!businessId) return res.status(400).json({ error: "businessId is required" });
    const bizId = parseInt(businessId as string);

    const conditions: any[] = [
      eq(mileageLogsTable.businessId, bizId),
      isNull(mileageLogsTable.subcontractorId),
    ];
    if (startDate) conditions.push(gte(mileageLogsTable.date, startDate as string));
    if (endDate) conditions.push(lte(mileageLogsTable.date, endDate as string));
    if (importId) conditions.push(eq(mileageLogsTable.importId, parseInt(importId as string)));

    const logs = await db
      .select({ ...getTableColumns(mileageLogsTable), jobTitle: jobsTable.title })
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

    // Imported logs (no per-log expense): recalculate the monthly aggregate expense
    if (!existing?.expenseId && existing?.importId) {
      await recalcImportExpenses(existing.importId);
    }

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
    }

    await db.delete(mileageLogsTable).where(eq(mileageLogsTable.id, id));

    // Imported logs (no per-log expense): recalculate the monthly aggregate expense
    if (log && !log.expenseId && log.importId) {
      await recalcImportExpenses(log.importId);
    }

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete mileage log" });
  }
});

// ─── GET /api/mileage/imports ────────────────────────────────────────────────
router.get("/imports", async (req, res) => {
  try {
    const { businessId } = req.query;
    if (!businessId) return res.status(400).json({ error: "businessId is required" });
    const bizId = parseInt(businessId as string);

    const imports = await db
      .select()
      .from(mileageImportsTable)
      .where(eq(mileageImportsTable.businessId, bizId))
      .orderBy(mileageImportsTable.importedAt);

    res.json(imports.map(i => ({
      ...i,
      totalMiles: i.totalMiles != null ? parseFloat(i.totalMiles) : null,
      estimatedDeduction: i.estimatedDeduction != null ? parseFloat(i.estimatedDeduction) : null,
      importedAt: i.importedAt instanceof Date ? i.importedAt.toISOString() : i.importedAt,
      rolledBackAt: i.rolledBackAt instanceof Date ? i.rolledBackAt.toISOString() : i.rolledBackAt,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch mileage imports" });
  }
});

// ─── POST /api/mileage/bulk ───────────────────────────────────────────────────
router.post("/bulk", async (req, res) => {
  try {
    const { trips, businessId, filename, fileHash, source, skipPersonal } = req.body as {
      trips: Array<{
        date: string;
        miles: number;
        startLocation: string;
        endLocation: string;
        classification: "business" | "personal";
        notes?: string;
      }>;
      businessId: number;
      filename: string;
      fileHash?: string;
      source?: string;
      skipPersonal?: boolean;
    };

    if (!Array.isArray(trips) || trips.length === 0) {
      return res.status(400).json({ error: "No trips provided" });
    }
    if (!businessId) {
      return res.status(400).json({ error: "businessId is required" });
    }

    const bizId = parseInt(String(businessId));
    const userId = getRequestUserId(req) ?? null;

    let fileAlreadyImported = false;
    if (fileHash) {
      const [existing] = await db
        .select({ id: mileageImportsTable.id, importedAt: mileageImportsTable.importedAt })
        .from(mileageImportsTable)
        .where(and(
          eq(mileageImportsTable.businessId, bizId),
          eq(mileageImportsTable.fileHash, fileHash),
        ))
        .limit(1);
      if (existing) {
        fileAlreadyImported = true;
      }
    }

    const tripsToProcess = skipPersonal
      ? trips.filter(t => t.classification !== "personal")
      : trips;

    const existingLogs = await db
      .select({
        date: mileageLogsTable.date,
        miles: mileageLogsTable.miles,
        startLocation: mileageLogsTable.startLocation,
        endLocation: mileageLogsTable.endLocation,
      })
      .from(mileageLogsTable)
      .where(and(
        eq(mileageLogsTable.businessId, bizId),
        isNull(mileageLogsTable.subcontractorId),
      ));

    const dupSet = new Set(
      existingLogs.map(l =>
        `${l.date}|${parseFloat(l.miles ?? "0").toFixed(2)}|${(l.startLocation ?? "").toLowerCase()}|${(l.endLocation ?? "").toLowerCase()}`
      )
    );

    const toInsert = [];
    let duplicatesSkipped = 0;

    for (const trip of tripsToProcess) {
      const key = `${trip.date}|${trip.miles.toFixed(2)}|${trip.startLocation.toLowerCase()}|${trip.endLocation.toLowerCase()}`;
      if (dupSet.has(key)) {
        duplicatesSkipped++;
        continue;
      }
      toInsert.push(trip);
    }

    const importSource = source ?? "mileiq";
    let importedCount = 0;
    let totalMiles = 0;
    let estimatedDeduction = 0;
    let importId: number | null = null;

    const [importRecord] = await db
      .insert(mileageImportsTable)
      .values({
        businessId: bizId,
        userId,
        source: importSource,
        filename: filename ?? "import.csv",
        fileHash: fileHash ?? null,
        status: toInsert.length === 0 ? "completed" : "completed",
        tripsFound: trips.length,
        tripsImported: 0,
        duplicatesSkipped,
        totalMiles: "0",
        estimatedDeduction: "0",
      })
      .returning();

    importId = importRecord.id;

    let expensesCreated = 0;
    const expenseMonths: string[] = [];

    if (toInsert.length > 0) {
      const logValues = toInsert.map(t => {
        const tripRate = getIrsRateForDate(t.date);
        const deductionAmt = t.classification === "business" ? t.miles * tripRate : 0;
        totalMiles += t.miles;
        if (t.classification === "business") estimatedDeduction += deductionAmt;

        return {
          date: t.date,
          startLocation: t.startLocation || null,
          endLocation: t.endLocation || null,
          miles: t.miles.toString(),
          classification: t.classification,
          ratePerMile: tripRate.toString(),
          deductionAmount: deductionAmt.toString(),
          notes: t.notes || null,
          source: importSource,
          businessId: bizId,
          importId,
          expenseId: null,
        };
      });

      await db.insert(mileageLogsTable).values(logValues);
      importedCount = logValues.length;

      // One aggregate expense per month (not one per trip)
      await recalcImportExpenses(importId!);

      const created = await db
        .select({ id: expensesTable.id, description: expensesTable.description })
        .from(expensesTable)
        .where(eq(expensesTable.mileageImportId, importId!));
      expensesCreated = created.length;
      expenseMonths.push(...created.map(e => (e.description ?? "").replace(" IRS Mileage", "")));
    }

    await db
      .update(mileageImportsTable)
      .set({
        tripsImported: importedCount,
        duplicatesSkipped,
        totalMiles: totalMiles.toFixed(2),
        estimatedDeduction: estimatedDeduction.toFixed(2),
        status: "completed",
      })
      .where(eq(mileageImportsTable.id, importId!));

    res.status(201).json({
      imported: importedCount,
      duplicatesSkipped,
      importId,
      totalMiles,
      estimatedDeduction,
      fileAlreadyImported,
      expensesCreated,
      expenseMonths,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to import mileage trips" });
  }
});

// ─── DELETE /api/mileage/imports/:id/rollback ─────────────────────────────────
router.delete("/imports/:id/rollback", async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const [importRecord] = await db
      .select()
      .from(mileageImportsTable)
      .where(eq(mileageImportsTable.id, id));

    if (!importRecord) {
      return res.status(404).json({ error: "Import not found" });
    }

    if (importRecord.rolledBackAt) {
      return res.status(400).json({ error: "Import already rolled back" });
    }

    const importedAt = importRecord.importedAt instanceof Date
      ? importRecord.importedAt
      : new Date(importRecord.importedAt);
    const hoursAgo = (Date.now() - importedAt.getTime()) / (1000 * 60 * 60);
    if (hoursAgo > 24) {
      return res.status(400).json({ error: "Rollback window has expired (24 hours)" });
    }

    const linkedLogs = await db
      .select({ id: mileageLogsTable.id, expenseId: mileageLogsTable.expenseId })
      .from(mileageLogsTable)
      .where(eq(mileageLogsTable.importId, id));

    const expenseIds = linkedLogs.map(l => l.expenseId).filter((eid): eid is number => eid != null);

    if (linkedLogs.length > 0) {
      await db.delete(mileageLogsTable).where(eq(mileageLogsTable.importId, id));
    }
    // Legacy per-trip expenses (pre-consolidation imports)
    if (expenseIds.length > 0) {
      await db.delete(expensesTable).where(inArray(expensesTable.id, expenseIds));
    }
    // Monthly aggregate expenses linked to this import
    await db.delete(expensesTable).where(eq(expensesTable.mileageImportId, id));

    const [updated] = await db
      .update(mileageImportsTable)
      .set({ rolledBackAt: new Date(), status: "rolled_back" })
      .where(eq(mileageImportsTable.id, id))
      .returning();

    res.json({
      ...updated,
      importedAt: updated.importedAt instanceof Date ? updated.importedAt.toISOString() : updated.importedAt,
      rolledBackAt: updated.rolledBackAt instanceof Date ? updated.rolledBackAt.toISOString() : updated.rolledBackAt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to rollback import" });
  }
});

export default router;
