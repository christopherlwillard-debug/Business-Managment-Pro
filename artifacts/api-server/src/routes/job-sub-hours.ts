import { Router } from "express";
import { db } from "@workspace/db";
import { jobSubHoursTable, subcontractorsTable, jobSubcontractorsTable, expensesTable, jobsTable, subPaymentRecordsTable } from "@workspace/db/schema";
import { eq, and, inArray, getTableColumns, sql } from "drizzle-orm";
import { recomputeSubPaid } from "./jobs";

const router = Router();

function fmt(row: typeof jobSubHoursTable.$inferSelect & { subName?: string | null }) {
  return {
    ...row,
    hours: parseFloat(row.hours ?? "0"),
    hourType: (row.hourType ?? null) as "work" | "travel" | null,
    rateSnapshot: row.rateSnapshot != null ? parseFloat(row.rateSnapshot) : null,
    subName: row.subName ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  };
}

function buildExpenseDescription(hours: number, rate: number | null, subName: string | null): string {
  const h = hours.toFixed(1).replace(/\.0$/, "");
  if (rate != null && rate > 0) {
    return `${subName ?? "Subcontractor"} — ${h}h @ $${rate.toFixed(2)}/hr`;
  }
  return `${subName ?? "Subcontractor"} — ${h}h labor`;
}

async function upsertLinkedExpense(hoursId: number, jobId: number, subcontractorId: number, date: string, hours: number, rate: number | null, subName: string | null): Promise<void> {
  const amount = rate != null && rate > 0 ? hours * rate : 0;
  const description = buildExpenseDescription(hours, rate, subName);

  const [job] = await db.select({ businessLine: jobsTable.businessLine }).from(jobsTable).where(eq(jobsTable.id, jobId));

  const existing = await db.select({ id: expensesTable.id })
    .from(expensesTable)
    .where(eq(expensesTable.jobSubHoursId, hoursId));

  if (existing.length > 0) {
    await db.update(expensesTable)
      .set({ description, amount: String(amount.toFixed(2)), date, jobSubHoursId: hoursId })
      .where(eq(expensesTable.jobSubHoursId, hoursId));
  } else {
    await db.insert(expensesTable).values({
      description,
      amount: String(amount.toFixed(2)),
      category: "Subcontractor",
      date,
      jobId,
      subcontractorId,
      jobSubHoursId: hoursId,
      businessLine: job?.businessLine ?? null,
      notes: "Auto-created from job card sub hours",
    });
  }
}

async function deleteLinkedExpense(hoursId: number): Promise<void> {
  await db.delete(expensesTable).where(eq(expensesTable.jobSubHoursId, hoursId));
}

// Recompute and persist paymentStatus for one sub on one job after hours change.
// Only runs when payments already exist — no-op when the sub has never been paid.
async function recomputeSubPaymentStatus(jobId: number, subId: number): Promise<void> {
  const [paid] = await db
    .select({ total: sql<string>`COALESCE(SUM(amount), '0')` })
    .from(subPaymentRecordsTable)
    .where(and(
      eq(subPaymentRecordsTable.jobId, jobId),
      eq(subPaymentRecordsTable.subcontractorId, subId),
      sql`(is_reversal IS NULL OR is_reversal = false)`,
    ));
  const amountPaid = parseFloat(paid?.total ?? "0");
  if (amountPaid <= 0.005) return; // no payments on record — nothing to recalculate

  const [subRow] = await db
    .select({
      fixedAmount:      jobSubcontractorsTable.fixedAmount,
      amountOwed:       jobSubcontractorsTable.amountOwed,
      compensationType: jobSubcontractorsTable.compensationType,
    })
    .from(jobSubcontractorsTable)
    .where(and(
      eq(jobSubcontractorsTable.jobId, jobId),
      eq(jobSubcontractorsTable.subcontractorId, subId),
    ));

  let owedAmount: number | null = subRow?.amountOwed != null
    ? parseFloat(String(subRow.amountOwed))
    : subRow?.fixedAmount != null
      ? parseFloat(String(subRow.fixedAmount))
      : null;

  if (owedAmount == null && (subRow?.compensationType ?? "hourly") === "hourly") {
    const [hoursRow] = await db
      .select({ computedOwed: sql<string>`COALESCE(SUM(${jobSubHoursTable.hours} * COALESCE(${jobSubHoursTable.rateSnapshot}, 0)), '0')` })
      .from(jobSubHoursTable)
      .where(and(
        eq(jobSubHoursTable.jobId, jobId),
        eq(jobSubHoursTable.subcontractorId, subId),
      ));
    const computed = parseFloat(hoursRow?.computedOwed ?? "0");
    if (computed > 0) owedAmount = computed;
  }

  // Also sum advance amounts applied across all payment records — they are real cash
  // already given to the sub and count toward the settled total.
  const [advRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${subPaymentRecordsTable.advanceAmount}), '0')` })
    .from(subPaymentRecordsTable)
    .where(and(
      eq(subPaymentRecordsTable.jobId, jobId),
      eq(subPaymentRecordsTable.subcontractorId, subId),
      sql`(${subPaymentRecordsTable.isReversal} IS NULL OR ${subPaymentRecordsTable.isReversal} = false)`,
    ));
  const advancesApplied = parseFloat(advRow?.total ?? "0");
  const effectivePaid = amountPaid + advancesApplied;
  const newStatus = owedAmount != null && effectivePaid >= owedAmount * 0.99 ? "paid" : "partial";
  await db.update(jobSubcontractorsTable)
    .set({ paymentStatus: newStatus })
    .where(and(
      eq(jobSubcontractorsTable.jobId, jobId),
      eq(jobSubcontractorsTable.subcontractorId, subId),
    ));
}

router.get("/:jobId/sub-hours", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid job id" });
    const rows = await db
      .select({ ...getTableColumns(jobSubHoursTable), subName: subcontractorsTable.name })
      .from(jobSubHoursTable)
      .leftJoin(subcontractorsTable, eq(jobSubHoursTable.subcontractorId, subcontractorsTable.id))
      .where(eq(jobSubHoursTable.jobId, jobId))
      .orderBy(jobSubHoursTable.date);
    res.json(rows.map(r => fmt(r)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch sub hours" });
  }
});

router.post("/:jobId/sub-hours", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid job id" });
    const { subcontractorId, date, hours, description, rateSnapshot, hourType } = req.body;
    if (!subcontractorId || !date || hours == null) {
      return res.status(400).json({ error: "subcontractorId, date, and hours are required" });
    }
    const validHourType = hourType === "travel" ? "travel" : hourType === "work" ? "work" : null;

    // Enforce: sub must be assigned to this job
    const [link] = await db.select({ jobId: jobSubcontractorsTable.jobId })
      .from(jobSubcontractorsTable)
      .where(and(
        eq(jobSubcontractorsTable.jobId, jobId),
        eq(jobSubcontractorsTable.subcontractorId, parseInt(subcontractorId))
      ));
    if (!link) {
      return res.status(400).json({ error: "Subcontractor is not assigned to this job" });
    }

    let resolvedRate = rateSnapshot != null ? String(rateSnapshot) : null;
    if (resolvedRate == null) {
      const [sub] = await db.select({ payRate: subcontractorsTable.payRate })
        .from(subcontractorsTable).where(eq(subcontractorsTable.id, parseInt(subcontractorId)));
      resolvedRate = sub?.payRate ?? null;
    }

    const [row] = await db.insert(jobSubHoursTable).values({
      jobId, subcontractorId: parseInt(subcontractorId),
      date, hours: String(hours), description: description || null,
      rateSnapshot: resolvedRate,
      hourType: validHourType,
    }).returning();

    const [sub] = await db.select({ name: subcontractorsTable.name })
      .from(subcontractorsTable).where(eq(subcontractorsTable.id, row.subcontractorId));

    const rateNum = resolvedRate != null ? parseFloat(resolvedRate) : null;
    await upsertLinkedExpense(row.id, jobId, row.subcontractorId, date, parseFloat(String(hours)), rateNum, sub?.name ?? null).catch(e => {
      console.error("Auto-expense creation failed:", e.message);
    });

    await recomputeSubPaid(jobId).catch(() => {});
    await recomputeSubPaymentStatus(jobId, row.subcontractorId).catch(() => {});
    res.status(201).json(fmt({ ...row, subName: sub?.name ?? null }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create sub hours entry" });
  }
});

router.put("/sub-hours/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { date, hours, description, rateSnapshot, hourType } = req.body;
    const updates: Record<string, unknown> = {};
    if (date !== undefined) updates.date = date;
    if (hours !== undefined) updates.hours = String(hours);
    if (description !== undefined) updates.description = description || null;
    if (rateSnapshot !== undefined) updates.rateSnapshot = rateSnapshot != null ? String(rateSnapshot) : null;
    if (hourType !== undefined) updates.hourType = hourType === "travel" ? "travel" : hourType === "work" ? "work" : null;

    const [row] = await db.update(jobSubHoursTable).set(updates).where(eq(jobSubHoursTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Entry not found" });

    const [sub] = await db.select({ name: subcontractorsTable.name })
      .from(subcontractorsTable).where(eq(subcontractorsTable.id, row.subcontractorId));

    const rateNum = row.rateSnapshot != null ? parseFloat(row.rateSnapshot) : null;
    const hoursNum = parseFloat(row.hours ?? "0");
    await upsertLinkedExpense(row.id, row.jobId, row.subcontractorId, row.date, hoursNum, rateNum, sub?.name ?? null).catch(e => {
      console.error("Auto-expense update failed:", e.message);
    });

    await recomputeSubPaid(row.jobId).catch(() => {});
    await recomputeSubPaymentStatus(row.jobId, row.subcontractorId).catch(() => {});
    res.json(fmt({ ...row, subName: sub?.name ?? null }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update sub hours entry" });
  }
});

// DELETE /:jobId/sub-hours — bulk-delete all hours (and their linked expenses) for the given subIds.
// Called when the user removes a sub from a job and chooses "Remove hours".
router.delete("/:jobId/sub-hours", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid job id" });
    const subIds: number[] = Array.isArray(req.body.subIds)
      ? (req.body.subIds as unknown[]).map(Number).filter((n: number) => !isNaN(n) && n > 0)
      : [];
    if (subIds.length === 0) return res.json({ ok: true, deleted: 0 });

    const rows = await db
      .select({ id: jobSubHoursTable.id })
      .from(jobSubHoursTable)
      .where(and(
        eq(jobSubHoursTable.jobId, jobId),
        inArray(jobSubHoursTable.subcontractorId, subIds),
      ));

    for (const row of rows) {
      await deleteLinkedExpense(row.id).catch(e => console.error("Auto-expense deletion failed:", e.message));
    }

    const hoursIds = rows.map(r => r.id);
    if (hoursIds.length > 0) {
      await db.delete(jobSubHoursTable).where(inArray(jobSubHoursTable.id, hoursIds));
    }

    await recomputeSubPaid(jobId).catch(() => {});
    for (const subId of subIds) {
      await recomputeSubPaymentStatus(jobId, subId).catch(() => {});
    }
    res.json({ ok: true, deleted: hoursIds.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to bulk-delete sub hours" });
  }
});

router.delete("/sub-hours/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await deleteLinkedExpense(id).catch(e => {
      console.error("Auto-expense deletion failed:", e.message);
    });
    const [deleted] = await db.delete(jobSubHoursTable).where(eq(jobSubHoursTable.id, id)).returning();
    if (deleted) {
      await recomputeSubPaid(deleted.jobId).catch(() => {});
      await recomputeSubPaymentStatus(deleted.jobId, deleted.subcontractorId).catch(() => {});
    }
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete sub hours entry" });
  }
});

export default router;
