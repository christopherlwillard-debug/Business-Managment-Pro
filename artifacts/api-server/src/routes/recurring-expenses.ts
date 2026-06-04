import { Router } from "express";
import { db } from "@workspace/db";
import { recurringExpensesTable, expensesTable, jobsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

const FREQUENCIES = ["weekly", "biweekly", "monthly", "quarterly", "yearly"] as const;

export function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function advanceDate(dateStr: string, frequency: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  switch (frequency) {
    case "weekly":    d.setDate(d.getDate() + 7); break;
    case "biweekly":  d.setDate(d.getDate() + 14); break;
    case "monthly":   d.setMonth(d.getMonth() + 1); break;
    case "quarterly": d.setMonth(d.getMonth() + 3); break;
    case "yearly":    d.setFullYear(d.getFullYear() + 1); break;
  }
  return localDateStr(d);
}

function formatTemplate(t: typeof recurringExpensesTable.$inferSelect, jobTitle?: string | null) {
  return {
    ...t,
    amount: parseFloat(t.amount ?? "0"),
    jobTitle: jobTitle ?? null,
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
  };
}

router.get("/", async (req, res) => {
  try {
    const { businessId } = req.query;
    const condition = businessId
      ? eq(recurringExpensesTable.businessId, parseInt(businessId as string))
      : undefined;
    const rows = await db
      .select({ ...recurringExpensesTable, jobTitle: jobsTable.title })
      .from(recurringExpensesTable)
      .leftJoin(jobsTable, eq(recurringExpensesTable.jobId, jobsTable.id))
      .where(condition)
      .orderBy(recurringExpensesTable.nextDueDate);
    res.json(rows.map(r => formatTemplate(r, r.jobTitle)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch recurring expenses" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { description, amount, category, vendor, jobId, notes, frequency, startDate, endDate, businessId } = req.body;
    if (!description || !amount || !category || !frequency || !startDate) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    if (!FREQUENCIES.includes(frequency)) {
      return res.status(400).json({ error: "Invalid frequency" });
    }

    const today = localDateStr();
    let nextDueDate = startDate;

    const [template] = await db.insert(recurringExpensesTable).values({
      description, amount: amount.toString(), category,
      vendor: vendor || null, jobId: jobId || null, notes: notes || null,
      frequency, startDate, endDate: endDate || null, nextDueDate, active: true,
      businessId: businessId ? parseInt(businessId) : null,
    }).returning();

    // If the start date is today or in the past, immediately generate the
    // first expense so it appears right away (don't wait for the cron job).
    if (startDate <= today) {
      await db.insert(expensesTable).values({
        description: template.description,
        amount: template.amount,
        category: template.category,
        vendor: template.vendor,
        jobId: template.jobId,
        notes: template.notes,
        date: template.nextDueDate,
        recurringExpenseId: template.id,
        businessId: template.businessId,
      });
      const nextNext = advanceDate(template.nextDueDate, template.frequency);
      const shouldDeactivate = template.endDate && nextNext > template.endDate;
      await db
        .update(recurringExpensesTable)
        .set(shouldDeactivate ? { active: false } : { nextDueDate: nextNext })
        .where(eq(recurringExpensesTable.id, template.id));
      nextDueDate = nextNext;
    }

    const [row] = await db
      .select({ ...recurringExpensesTable, jobTitle: jobsTable.title })
      .from(recurringExpensesTable)
      .leftJoin(jobsTable, eq(recurringExpensesTable.jobId, jobsTable.id))
      .where(eq(recurringExpensesTable.id, template.id));

    res.status(201).json(formatTemplate(row ?? template, row?.jobTitle));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create recurring expense" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [row] = await db
      .select({ ...recurringExpensesTable, jobTitle: jobsTable.title })
      .from(recurringExpensesTable)
      .leftJoin(jobsTable, eq(recurringExpensesTable.jobId, jobsTable.id))
      .where(eq(recurringExpensesTable.id, id));
    if (!row) return res.status(404).json({ error: "Recurring expense not found" });
    res.json(formatTemplate(row, row.jobTitle));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch recurring expense" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { description, amount, category, vendor, jobId, notes, frequency, startDate, endDate, active } = req.body;
    if (frequency && !FREQUENCIES.includes(frequency)) {
      return res.status(400).json({ error: "Invalid frequency" });
    }

    const scheduleChanged = frequency !== undefined || startDate !== undefined;
    let nextDueDate: string | undefined;
    if (scheduleChanged) {
      const [current] = await db
        .select()
        .from(recurringExpensesTable)
        .where(eq(recurringExpensesTable.id, id));
      if (current) {
        const effectiveStart = startDate ?? current.startDate;
        const effectiveFreq  = frequency ?? current.frequency;
        const today = localDateStr();
        let next = effectiveStart;
        while (next < today) next = advanceDate(next, effectiveFreq);
        nextDueDate = next;
      }
    }

    const [updated] = await db.update(recurringExpensesTable).set({
      ...(description !== undefined && { description }),
      ...(amount !== undefined && { amount: amount.toString() }),
      ...(category !== undefined && { category }),
      ...(vendor !== undefined && { vendor: vendor || null }),
      ...(jobId !== undefined && { jobId: jobId || null }),
      ...(notes !== undefined && { notes: notes || null }),
      ...(frequency !== undefined && { frequency }),
      ...(startDate !== undefined && { startDate }),
      ...(endDate !== undefined && { endDate: endDate || null }),
      ...(active !== undefined && { active }),
      ...(nextDueDate !== undefined && { nextDueDate }),
    }).where(eq(recurringExpensesTable.id, id)).returning();

    if (!updated) return res.status(404).json({ error: "Recurring expense not found" });

    const [row] = await db
      .select({ ...recurringExpensesTable, jobTitle: jobsTable.title })
      .from(recurringExpensesTable)
      .leftJoin(jobsTable, eq(recurringExpensesTable.jobId, jobsTable.id))
      .where(eq(recurringExpensesTable.id, id));

    res.json(formatTemplate(row ?? updated, row?.jobTitle));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update recurring expense" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(recurringExpensesTable).where(eq(recurringExpensesTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete recurring expense" });
  }
});

export default router;
