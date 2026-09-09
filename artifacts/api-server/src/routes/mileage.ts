import { Router } from "express";
import { db } from "@workspace/db";
import { mileageLogsTable, mileageImportsTable, jobsTable, settingsTable, expensesTable } from "@workspace/db/schema";
import { eq, and, gte, lte, isNull, inArray, getTableColumns } from "drizzle-orm";
import { getRequestUserId } from "./guards";
import { calculateMileageDeduction, getIrsRateForDate, summarizeMileageRecords } from "../lib/irs-rates.js";
import { partitionMileageImportTrips, type MileageImportTrip } from "../lib/mileage-import-dedup.js";
import { resolveMutationBusiness, mutationBusinessPredicate, belongsToBusiness } from "../lib/business-scope.js";

const router = Router();

type MileageDatabase = Pick<typeof db, "select" | "insert" | "update">;
type MileageTransactionalDatabase = Pick<typeof db, "transaction">;

function formatMileage(m: any, jobTitle?: string | null) {
  const calculated = calculateMileageDeduction(m.miles, m.classification, m.date);
  const storedDeduction = parseFloat(m.deductionAmount ?? "0");
  const storedRate = parseFloat(m.ratePerMile ?? "0");
  return {
    ...m,
    jobTitle: jobTitle ?? null,
    miles: parseFloat(m.miles ?? "0"),
    ratePerMile: parseFloat(m.ratePerMile ?? "0.725"),
    deductionAmount: parseFloat(m.deductionAmount ?? "0"),
    calculatedRate: calculated.rate,
    calculatedDeduction: calculated.deduction,
    snapshotStale: storedRate !== calculated.rate || Math.abs(storedDeduction - calculated.deduction) > 0.005,
    createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
  };
}

async function getRate() {
  const [settings] = await db.select().from(settingsTable).limit(1);
  return parseFloat(settings?.mileageRate ?? "0.725");
}

export { getIrsRateForDate };

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
export async function recalcImportExpenses(importId: number, database: MileageDatabase = db) {
  const [importRecord] = await database
    .select()
    .from(mileageImportsTable)
    .where(eq(mileageImportsTable.id, importId));
  if (!importRecord) return;

  const logs = await database
    .select()
    .from(mileageLogsTable)
    .where(and(
      eq(mileageLogsTable.importId, importId),
      eq(mileageLogsTable.classification, "business"),
      isNull(mileageLogsTable.voidedAt),
    ));

  // Group by "YYYY-MM"
  const byMonth = new Map<string, { miles: number; deduction: number; trips: number; lastDate: string }>();
  for (const log of logs) {
    const ym = (log.date ?? "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(ym)) continue;
    const entry = byMonth.get(ym) ?? { miles: 0, deduction: 0, trips: 0, lastDate: log.date };
    entry.miles += parseFloat(log.miles ?? "0");
    entry.deduction += calculateMileageDeduction(log.miles, log.classification, log.date).deduction;
    entry.trips += 1;
    if (log.date > entry.lastDate) entry.lastDate = log.date;
    byMonth.set(ym, entry);
  }

  const existingExpenses = await database
    .select()
    .from(expensesTable)
    .where(and(eq(expensesTable.mileageImportId, importId), isNull(expensesTable.voidedAt)));

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
      await database.update(expensesTable).set(values).where(eq(expensesTable.id, existing.id));
      existingByMonth.delete(ym);
    } else {
      await database.insert(expensesTable).values(values);
    }
  }

  // Void aggregates for months that no longer have any active business logs.
  const staleIds = [...existingByMonth.values()].map(e => e.id);
  if (staleIds.length > 0) {
    await database.update(expensesTable)
      .set({
        voidedAt: new Date(),
        voidReason: "Mileage import aggregate no longer has active trips",
      })
      .where(inArray(expensesTable.id, staleIds));
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
      isNull(mileageLogsTable.voidedAt),
    ];
    if (startDate) baseConditions.push(gte(mileageLogsTable.date, startDate as string));
    if (endDate) baseConditions.push(lte(mileageLogsTable.date, endDate as string));

    const all = await db
      .select()
      .from(mileageLogsTable)
      .where(and(...baseConditions));

    // Recompute from raw miles, classification, and trip date so summaries do
    // not depend on stale per-trip snapshots or present blended rates.
    const summary = summarizeMileageRecords(all);
    const personalMiles = all.filter(m => m.classification === "personal").reduce((s, m) => s + parseFloat(m.miles), 0);

    res.json({
      totalMiles: summary.totalMiles + personalMiles,
      businessMiles: summary.totalMiles,
      personalMiles,
      totalDeduction: summary.totalDeduction,
      ratePerMile: summary.ratePerMile,
      ratePeriods: summary.ratePeriods,
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
      isNull(mileageLogsTable.voidedAt),
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
    // Use the IRS date-aware rate so H2 2026 trips automatically get $0.760/mile.
    // getIrsRateForDate() is the authoritative rate table — not the settings override.
    const milesNum = parseFloat(miles);
    const { deduction: deductionAmount } = calculateMileageDeduction(milesNum, classification, date);
    const ownership = await resolveMutationBusiness(req);
    if (!ownership.ok) return res.status(400).json({ error: ownership.error });
    const owner = ownership.business;
    const bizId = owner.id;

    if (jobId) {
      const [job] = await db.select({ businessId: jobsTable.businessId, businessLine: jobsTable.businessLine })
        .from(jobsTable).where(eq(jobsTable.id, parseInt(String(jobId)))).limit(1);
      if (!job || !belongsToBusiness(job, owner)) return res.status(404).json({ error: "Job not found" });
    }

    const log = await db.transaction(async (tx) => {
      let expenseId: number | null = null;

      if (classification === "business" || classification == null) {
        const description = purpose
          ? `Mileage: ${purpose} (${milesNum.toFixed(2)} mi)`
          : `Mileage: Business trip (${milesNum.toFixed(2)} mi)`;
        const [expense] = await tx.insert(expensesTable).values({
          date,
          description,
          vendor: "IRS Mileage",
          category: "mileage",
          amount: deductionAmount.toFixed(2),
          jobId: jobId || null,
          businessId: bizId,
          businessLine: owner.slug,
          notes: `Auto-created. ${milesNum.toFixed(2)} mi × $${getIrsRateForDate(date)}/mi`,
        }).returning();
        expenseId = expense.id;
      }

      const [insertedLog] = await tx.insert(mileageLogsTable).values({
        date, startLocation, endLocation,
        miles: miles.toString(),
        purpose, jobId: jobId || null,
        businessId: bizId,
        classification: classification || "business",
        ratePerMile: getIrsRateForDate(date).toString(),
        deductionAmount: deductionAmount.toString(),
        notes,
        source: source || "gps",
        expenseId,
      }).returning();

      return insertedLog;
    });

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
    // Derive rate from the (possibly new) trip date so an edited date picks up the correct split.
    const milesNum = parseFloat(miles);
    const { deduction: deductionAmount } = calculateMileageDeduction(milesNum, classification, date);

    const ownership = await resolveMutationBusiness(req);
    if (!ownership.ok) return res.status(400).json({ error: ownership.error });
    const owner = ownership.business;
    const [existing] = await db.select().from(mileageLogsTable)
      .where(and(eq(mileageLogsTable.id, id), mutationBusinessPredicate(mileageLogsTable, owner)));
    if (!existing) return res.status(404).json({ error: "Mileage log not found" });
    if (existing?.voidedAt) return res.status(400).json({ error: "Voided mileage records cannot be edited." });

    if (jobId) {
      const [job] = await db.select({ businessId: jobsTable.businessId, businessLine: jobsTable.businessLine })
        .from(jobsTable).where(eq(jobsTable.id, parseInt(String(jobId)))).limit(1);
      if (!job || !belongsToBusiness(job, owner)) return res.status(404).json({ error: "Job not found" });
    }

    if (existing?.expenseId) {
      await db.update(expensesTable).set({
        date,
        description: purpose
          ? `Mileage: ${purpose} (${milesNum.toFixed(2)} mi)`
          : `Mileage: Business trip (${milesNum.toFixed(2)} mi)`,
        amount: deductionAmount.toFixed(2),
        jobId: jobId || null,
        notes: `Auto-created. ${milesNum.toFixed(2)} mi × $${getIrsRateForDate(date)}/mi`,
        businessId: owner.id,
        businessLine: owner.slug,
      }).where(and(eq(expensesTable.id, existing.expenseId), mutationBusinessPredicate(expensesTable, owner)));
    }

    const [log] = await db.update(mileageLogsTable).set({
      date, startLocation, endLocation,
      miles: miles?.toString(),
      purpose, jobId: jobId || null,
      classification,
      businessId: owner.id,
      ratePerMile: getIrsRateForDate(date).toString(),
      deductionAmount: deductionAmount.toString(),
      notes,
    }).where(and(eq(mileageLogsTable.id, id), mutationBusinessPredicate(mileageLogsTable, owner))).returning();
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
    return res.status(409).json({ error: "Mileage records cannot be deleted. Use the void action to preserve deduction history." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete mileage log" });
  }
});

router.post("/:id/void", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    if (!reason) return res.status(400).json({ error: "A void reason is required" });
    const ownership = await resolveMutationBusiness(req);
    if (!ownership.ok) return res.status(400).json({ error: ownership.error });
    const [log] = await db.select().from(mileageLogsTable)
      .where(and(eq(mileageLogsTable.id, id), mutationBusinessPredicate(mileageLogsTable, ownership.business)));
    if (!log) return res.status(404).json({ error: "Mileage record not found" });
    if (log.voidedAt) return res.status(404).json({ error: "Mileage record is already voided" });
    const [updated] = await db.update(mileageLogsTable)
      .set({ voidedAt: new Date(), voidReason: reason })
      .where(and(eq(mileageLogsTable.id, id), mutationBusinessPredicate(mileageLogsTable, ownership.business)))
      .returning();
    if (updated?.expenseId) {
      await db.update(expensesTable).set({ voidedAt: new Date(), voidReason: reason })
        .where(and(eq(expensesTable.id, updated.expenseId), isNull(expensesTable.voidedAt)));
    } else if (updated?.importId) {
      await recalcImportExpenses(updated.importId);
    }
    res.json(formatMileage(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to void mileage record" });
  }
});

// ─── GET /api/mileage/imports ────────────────────────────────────────────────
async function getImportRecalculation(importId: number, database: MileageDatabase = db) {
  const logs = await database.select().from(mileageLogsTable).where(and(
    eq(mileageLogsTable.importId, importId),
    isNull(mileageLogsTable.voidedAt),
  ));
  const changes = logs.map(log => {
    const next = calculateMileageDeduction(log.miles, log.classification, log.date);
    const oldRate = parseFloat(log.ratePerMile ?? "0");
    const oldDeduction = parseFloat(log.deductionAmount ?? "0");
    return {
      id: log.id,
      date: log.date,
      classification: log.classification,
      miles: parseFloat(log.miles ?? "0"),
      oldRate,
      newRate: next.rate,
      oldDeduction,
      newDeduction: next.deduction,
      changed: oldRate !== next.rate || Math.abs(oldDeduction - next.deduction) > 0.005,
    };
  });
  return {
    importId,
    rows: changes,
    changedRows: changes.filter(row => row.changed),
    currentDeduction: changes.reduce((sum, row) => sum + row.oldDeduction, 0),
    recalculatedDeduction: changes.reduce((sum, row) => sum + row.newDeduction, 0),
  };
}

export async function recalculateMileageImport(
  importId: number,
  database: MileageTransactionalDatabase = db,
) {
  return database.transaction(async (tx) => {
    const preview = await getImportRecalculation(importId, tx);
    for (const row of preview.changedRows) {
      await tx.update(mileageLogsTable).set({
        ratePerMile: row.newRate.toString(),
        deductionAmount: row.newDeduction.toFixed(2),
      }).where(eq(mileageLogsTable.id, row.id));
    }
    await recalcImportExpenses(importId, tx);
    const result = await getImportRecalculation(importId, tx);
    return { ...result, updatedRows: preview.changedRows.length };
  });
}

router.get("/imports/:id/recalculate/preview", async (req, res) => {
  try {
    const importId = parseInt(req.params.id);
    if (isNaN(importId)) return res.status(400).json({ error: "Invalid import id" });
    const ownership = await resolveMutationBusiness(req);
    if (!ownership.ok) return res.status(400).json({ error: ownership.error });
    const [record] = await db.select().from(mileageImportsTable)
      .where(and(eq(mileageImportsTable.id, importId), eq(mileageImportsTable.businessId, ownership.business.id)));
    if (!record) return res.status(404).json({ error: "Import not found" });
    res.json(await getImportRecalculation(importId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to preview mileage recalculation" });
  }
});

router.post("/imports/:id/recalculate", async (req, res) => {
  try {
    const importId = parseInt(req.params.id);
    if (isNaN(importId)) return res.status(400).json({ error: "Invalid import id" });
    if (req.body?.confirm !== true) {
      return res.status(400).json({ error: "Explicit confirmation is required. Preview the recalculation first." });
    }
    const ownership = await resolveMutationBusiness(req);
    if (!ownership.ok) return res.status(400).json({ error: ownership.error });
    const [record] = await db.select().from(mileageImportsTable)
      .where(and(eq(mileageImportsTable.id, importId), eq(mileageImportsTable.businessId, ownership.business.id)));
    if (!record) return res.status(404).json({ error: "Import not found" });
    res.json(await recalculateMileageImport(importId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to recalculate mileage import" });
  }
});

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
      trips: MileageImportTrip[];
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

    const ownership = await resolveMutationBusiness(req);
    if (!ownership.ok) return res.status(400).json({ error: ownership.error });
    const bizId = ownership.business.id;
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

    const importSource = (source ?? "mileiq").trim().toLowerCase();
    const tripsToProcess = skipPersonal
      ? trips.filter(t => t.classification !== "personal")
      : trips;

    const existingLogs = await db
      .select({
        date: mileageLogsTable.date,
        miles: mileageLogsTable.miles,
        startLocation: mileageLogsTable.startLocation,
        endLocation: mileageLogsTable.endLocation,
        source: mileageLogsTable.source,
        sourceTripKey: mileageLogsTable.sourceTripKey,
      })
      .from(mileageLogsTable)
      .where(and(
        eq(mileageLogsTable.businessId, bizId),
        isNull(mileageLogsTable.subcontractorId),
        isNull(mileageLogsTable.voidedAt),
      ));

    const { toInsert, duplicatesSkipped: preflightDuplicatesSkipped } = partitionMileageImportTrips(
      tripsToProcess,
      existingLogs,
      importSource,
    );
    let duplicatesSkipped = preflightDuplicatesSkipped;

    const result = await db.transaction(async (tx) => {
      let importedCount = 0;
      let totalMiles = 0;
      let estimatedDeduction = 0;

      const [importRecord] = await tx
        .insert(mileageImportsTable)
        .values({
          businessId: bizId,
          userId,
          source: importSource,
          filename: filename ?? "import.csv",
          fileHash: fileHash ?? null,
          status: "completed",
          tripsFound: trips.length,
          tripsImported: 0,
          duplicatesSkipped,
          totalMiles: "0",
          estimatedDeduction: "0",
        })
        .returning();

      const importId = importRecord.id;
      let expensesCreated = 0;
      const expenseMonths: string[] = [];

      if (toInsert.length > 0) {
        const logValues = toInsert.map(t => {
          const { rate: tripRate, deduction: deductionAmt } = calculateMileageDeduction(t.miles, t.classification, t.date);
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
            sourceTripKey: t.sourceTripKey,
            businessId: bizId,
            importId,
            expenseId: null,
          };
        });

        const insertedLogs = await tx
          .insert(mileageLogsTable)
          .values(logValues)
          .onConflictDoNothing()
          .returning({
            miles: mileageLogsTable.miles,
            classification: mileageLogsTable.classification,
            deductionAmount: mileageLogsTable.deductionAmount,
          });
        importedCount = insertedLogs.length;
        duplicatesSkipped += logValues.length - importedCount;
        totalMiles = insertedLogs.reduce((sum, log) => sum + parseFloat(log.miles ?? "0"), 0);
        estimatedDeduction = insertedLogs.reduce(
          (sum, log) => sum + (log.classification === "business" ? parseFloat(log.deductionAmount ?? "0") : 0),
          0,
        );

        if (importedCount > 0) {
          await recalcImportExpenses(importId, tx);
        }

        const created = await tx
          .select({ id: expensesTable.id, description: expensesTable.description })
          .from(expensesTable)
          .where(eq(expensesTable.mileageImportId, importId));
        expensesCreated = created.length;
        expenseMonths.push(...created.map(e => (e.description ?? "").replace(" IRS Mileage", "")));
      }

      await tx
        .update(mileageImportsTable)
        .set({
          tripsImported: importedCount,
          duplicatesSkipped,
          totalMiles: totalMiles.toFixed(2),
          estimatedDeduction: estimatedDeduction.toFixed(2),
          status: "completed",
        })
        .where(eq(mileageImportsTable.id, importId));

      return { importedCount, duplicatesSkipped, importId, totalMiles, estimatedDeduction, expensesCreated, expenseMonths };
    });

    res.status(201).json({
      imported: result.importedCount,
      duplicatesSkipped: result.duplicatesSkipped,
      importId: result.importId,
      totalMiles: result.totalMiles,
      estimatedDeduction: result.estimatedDeduction,
      fileAlreadyImported,
      expensesCreated: result.expensesCreated,
      expenseMonths: result.expenseMonths,
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

    const ownership = await resolveMutationBusiness(req);
    if (!ownership.ok) return res.status(400).json({ error: ownership.error });
    const [importRecord] = await db
      .select()
      .from(mileageImportsTable)
      .where(and(eq(mileageImportsTable.id, id), eq(mileageImportsTable.businessId, ownership.business.id)));

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
      .where(and(eq(mileageLogsTable.importId, id), eq(mileageLogsTable.businessId, ownership.business.id)));

    const expenseIds = linkedLogs.map(l => l.expenseId).filter((eid): eid is number => eid != null);

    if (linkedLogs.length > 0) {
      await db.update(mileageLogsTable).set({ voidedAt: new Date(), voidReason: "Mileage import rollback" })
        .where(and(eq(mileageLogsTable.importId, id), eq(mileageLogsTable.businessId, ownership.business.id)));
    }
    // Legacy per-trip expenses (pre-consolidation imports)
    if (expenseIds.length > 0) {
      await db.update(expensesTable).set({ voidedAt: new Date(), voidReason: "Mileage import rollback" })
        .where(and(inArray(expensesTable.id, expenseIds), eq(expensesTable.businessId, ownership.business.id)));
    }
    // Monthly aggregate expenses linked to this import
    await db.update(expensesTable).set({ voidedAt: new Date(), voidReason: "Mileage import rollback" })
      .where(and(eq(expensesTable.mileageImportId, id), eq(expensesTable.businessId, ownership.business.id)));

    const [updated] = await db
      .update(mileageImportsTable)
      .set({ rolledBackAt: new Date(), status: "rolled_back" })
      .where(and(eq(mileageImportsTable.id, id), eq(mileageImportsTable.businessId, ownership.business.id)))
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
