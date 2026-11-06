import { Router } from "express";
import { db } from "@workspace/db";
import { recurringExpensesTable, expensesTable, jobsTable } from "@workspace/db/schema";
import { eq, and, getTableColumns } from "drizzle-orm";
import { resolveMutationBusiness, belongsToBusiness } from "../lib/business-scope.js";

const router = Router();

const FREQUENCIES = ["weekly", "biweekly", "monthly", "quarterly", "yearly"] as const;

/** Reject partial/unsafe business IDs instead of silently widening a list to all businesses. */
export function parseRecurringExpenseBusinessId(value: unknown): number | null | undefined {
  if (value == null || value === "") return null;
  const text = typeof value === "number" && Number.isSafeInteger(value)
    ? String(value)
    : typeof value === "string" ? value.trim() : "";
  if (!/^\d+$/.test(text)) return undefined;
  const id = Number(text);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}
export function parseRecurringExpenseAmount(value: unknown): string | null {
  const text = typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : typeof value === "string" ? value.trim() : "";
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(text)) return null;
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 9_999_999_999.99) return null;
  return amount.toFixed(2);
}

export function isValidRecurringExpenseDate(value: unknown, allowEmpty = false): boolean {
  if (value == null || value === "") return allowEmpty;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseRecurringExpenseJobId(value: unknown): number | null | undefined {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return undefined;
  const id = Number(text);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}


export function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leapYear ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parseDateOnlyParts(value: string): { year: number; month: number; day: number } {
  if (!isValidRecurringExpenseDate(value)) {
    throw new RangeError("Recurring expense dates must be valid YYYY-MM-DD calendar dates");
  }
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

/**
 * Advance from the current due date while retaining the original start-date
 * day for month-based schedules. This prevents Jan 31 from overflowing into
 * March and prevents Feb 29 schedules from drifting after non-leap years.
 */
export function advanceDate(
  dateStr: string,
  frequency: string,
  anchorDateStr: string = dateStr,
): string {
  const current = parseDateOnlyParts(dateStr);
  const anchor = parseDateOnlyParts(anchorDateStr);

  if (frequency === "weekly" || frequency === "biweekly") {
    const date = new Date(dateStr + "T00:00:00.000Z");
    date.setUTCDate(date.getUTCDate() + (frequency === "weekly" ? 7 : 14));
    const year = date.getUTCFullYear();
    if (year < 0 || year > 9999) throw new RangeError("Recurring expense date is outside the supported range");
    return date.toISOString().slice(0, 10);
  }

  const monthIncrement = frequency === "monthly" ? 1
    : frequency === "quarterly" ? 3
    : frequency === "yearly" ? 12
    : null;
  if (monthIncrement == null) throw new RangeError("Unsupported recurring expense frequency");

  const targetMonthIndex = current.year * 12 + current.month - 1 + monthIncrement;
  const targetYear = Math.floor(targetMonthIndex / 12);
  const targetMonth = targetMonthIndex % 12 + 1;
  if (targetYear < 0 || targetYear > 9999) throw new RangeError("Recurring expense date is outside the supported range");
  const targetDay = Math.min(anchor.day, daysInMonth(targetYear, targetMonth));

  return String(targetYear).padStart(4, "0") + "-"
    + String(targetMonth).padStart(2, "0") + "-"
    + String(targetDay).padStart(2, "0");
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
    const bizId = parseRecurringExpenseBusinessId(businessId);
    if (bizId === undefined) {
      res.status(400).json({ error: "businessId must be a positive integer" });
      return;
    }
    // Recurring templates have no legacy businessLine column, so null-owned
    // records cannot safely be attributed to a selected business.
    const condition = bizId != null ? eq(recurringExpensesTable.businessId, bizId) : undefined;
    const rows = await db
      .select({ ...getTableColumns(recurringExpensesTable), jobTitle: jobsTable.title })
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
    const { description, amount, category, vendor, jobId, notes, frequency, startDate, endDate } = req.body ?? {};
    if (!description || !amount || !category || !frequency || !startDate) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    if (typeof description !== "string" || !description.trim() || description.length > 500 ||
        typeof category !== "string" || !category.trim() || category.length > 100) {
      return res.status(400).json({ error: "Description or category is invalid" });
    }
    const parsedAmount = parseRecurringExpenseAmount(amount);
    if (!parsedAmount) return res.status(400).json({ error: "Amount must be a positive dollar value with no more than two decimal places" });
    if (!FREQUENCIES.includes(frequency)) return res.status(400).json({ error: "Invalid frequency" });
    if (!isValidRecurringExpenseDate(startDate) || !isValidRecurringExpenseDate(endDate, true) ||
        (typeof endDate === "string" && endDate && endDate < startDate)) {
      return res.status(400).json({ error: "Start and end dates must be valid calendar dates" });
    }
    const parsedJobId = parseRecurringExpenseJobId(jobId);
    if (parsedJobId === undefined) return res.status(400).json({ error: "Job ID must be a positive integer" });
    if (vendor != null && (typeof vendor !== "string" || vendor.length > 160)) return res.status(400).json({ error: "Vendor is too long or invalid" });
    if (notes != null && (typeof notes !== "string" || notes.length > 2000)) return res.status(400).json({ error: "Notes are too long or invalid" });
    const ownership = await resolveMutationBusiness(req);
    if (!ownership.ok) return res.status(400).json({ error: ownership.error });
    const owner = ownership.business;
    if (parsedJobId != null) {
      const [job] = await db.select({ businessId: jobsTable.businessId, businessLine: jobsTable.businessLine })
        .from(jobsTable).where(eq(jobsTable.id, parsedJobId)).limit(1);
      if (!job || !belongsToBusiness(job, owner)) return res.status(404).json({ error: "Job not found" });
    }

    const today = localDateStr();

    // Create the template and its first occurrence as one unit. If either the
    // expense insert or schedule advance fails, the whole transaction rolls
    // back so the startup worker cannot later duplicate a partial creation.
    const template = await db.transaction(async (tx) => {
      const [created] = await tx.insert(recurringExpensesTable).values({
        description: description.trim(), amount: parsedAmount, category: category.trim(),
        vendor: vendor || null, jobId: parsedJobId, notes: notes || null,
        frequency, startDate, endDate: endDate || null, nextDueDate: startDate, active: true,
        businessId: owner.id,
      }).returning();
      if (!created) throw new Error("Failed to create recurring expense template");

      // If the start date is today or in the past, generate the first expense
      // immediately instead of waiting for the midnight worker.
      if (startDate > today) return created;

      await tx.insert(expensesTable).values({
        description: created.description,
        amount: created.amount,
        category: created.category,
        vendor: created.vendor,
        jobId: created.jobId,
        notes: created.notes,
        date: created.nextDueDate,
        recurringExpenseId: created.id,
        businessId: created.businessId,
        businessLine: owner.slug,
      });

      const nextDueDate = advanceDate(created.nextDueDate, created.frequency, created.startDate);
      const active = !(created.endDate && nextDueDate > created.endDate);
      const [advanced] = await tx.update(recurringExpensesTable)
        .set({ nextDueDate, active })
        .where(eq(recurringExpensesTable.id, created.id))
        .returning();

      return advanced ?? { ...created, nextDueDate, active };
    });

    const [row] = await db
      .select({ ...getTableColumns(recurringExpensesTable), jobTitle: jobsTable.title })
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
    const ownership = await resolveMutationBusiness(req);
    if (!ownership.ok) return res.status(400).json({ error: ownership.error });
    const [row] = await db
      .select({ ...getTableColumns(recurringExpensesTable), jobTitle: jobsTable.title })
      .from(recurringExpensesTable)
      .leftJoin(jobsTable, eq(recurringExpensesTable.jobId, jobsTable.id))
      .where(and(eq(recurringExpensesTable.id, id), eq(recurringExpensesTable.businessId, ownership.business.id)));
    if (!row) return res.status(404).json({ error: "Recurring expense not found" });
    res.json(formatTemplate(row as any, (row as any).jobTitle));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch recurring expense" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { description, amount, category, vendor, jobId, notes, frequency, startDate, endDate, active } = req.body ?? {};
    const ownership = await resolveMutationBusiness(req);
    if (!ownership.ok) return res.status(400).json({ error: ownership.error });
    const owner = ownership.business;
    const [current] = await db.select().from(recurringExpensesTable)
      .where(and(eq(recurringExpensesTable.id, id), eq(recurringExpensesTable.businessId, owner.id)));
    if (!current) return res.status(404).json({ error: "Recurring expense not found" });
    const parsedJobId = jobId !== undefined ? parseRecurringExpenseJobId(jobId) : undefined;
    if (jobId !== undefined && parsedJobId === undefined) {
      return res.status(400).json({ error: "Job ID must be a positive integer" });
    }
    if (parsedJobId != null) {
      const [job] = await db.select({ businessId: jobsTable.businessId, businessLine: jobsTable.businessLine })
        .from(jobsTable).where(eq(jobsTable.id, parsedJobId)).limit(1);
      if (!job || !belongsToBusiness(job, owner)) return res.status(404).json({ error: "Job not found" });
    }
    if (frequency !== undefined && !FREQUENCIES.includes(frequency)) {
      return res.status(400).json({ error: "Invalid frequency" });
    }
    const parsedAmount = amount !== undefined ? parseRecurringExpenseAmount(amount) : undefined;
    if (amount !== undefined && !parsedAmount) return res.status(400).json({ error: "Amount must be a positive dollar value with no more than two decimal places" });
    if (description !== undefined && (typeof description !== "string" || !description.trim() || description.length > 500)) {
      return res.status(400).json({ error: "Description is invalid" });
    }
    if (category !== undefined && (typeof category !== "string" || !category.trim() || category.length > 100)) {
      return res.status(400).json({ error: "Category is invalid" });
    }
    if (vendor !== undefined && vendor != null && (typeof vendor !== "string" || vendor.length > 160)) {
      return res.status(400).json({ error: "Vendor is invalid" });
    }
    if (notes !== undefined && notes != null && (typeof notes !== "string" || notes.length > 2000)) {
      return res.status(400).json({ error: "Notes are invalid" });
    }
    if (active !== undefined && typeof active !== "boolean") return res.status(400).json({ error: "Active must be a boolean" });
    if (startDate !== undefined && !isValidRecurringExpenseDate(startDate)) return res.status(400).json({ error: "Start date must be a valid YYYY-MM-DD date" });
    if (endDate !== undefined && !isValidRecurringExpenseDate(endDate, true)) return res.status(400).json({ error: "End date must be a valid YYYY-MM-DD date" });
    const effectiveStartDate = startDate ?? current.startDate;
    const effectiveEndDate = endDate !== undefined ? endDate : current.endDate;
    if (effectiveEndDate && effectiveEndDate < effectiveStartDate) return res.status(400).json({ error: "End date cannot be before start date" });

    const scheduleChanged = frequency !== undefined || startDate !== undefined;
    let nextDueDate: string | undefined;
    if (scheduleChanged) {
      if (current) {
        const effectiveStart = startDate ?? current.startDate;
        const effectiveFreq = frequency ?? current.frequency;
        if (!FREQUENCIES.includes(effectiveFreq as typeof FREQUENCIES[number])) {
          return res.status(400).json({ error: "The existing recurring expense frequency is invalid" });
        }
        const today = localDateStr();
        let next = effectiveStart;
        while (next < today) next = advanceDate(next, effectiveFreq, effectiveStart);
        nextDueDate = next;
      }
    }

    const [updated] = await db.update(recurringExpensesTable).set({
      ...(description !== undefined && { description: description.trim() }),
      ...(amount !== undefined && parsedAmount != null && { amount: parsedAmount }),
      ...(category !== undefined && { category: category.trim() }),
      ...(vendor !== undefined && { vendor: vendor || null }),
      ...(jobId !== undefined && { jobId: parsedJobId }),
      ...(notes !== undefined && { notes: notes || null }),
      ...(frequency !== undefined && { frequency }),
      ...(startDate !== undefined && { startDate }),
      ...(endDate !== undefined && { endDate: endDate || null }),
      ...(active !== undefined && { active }),
      ...(nextDueDate !== undefined && { nextDueDate }),
      businessId: current.businessId ?? owner.id,
    }).where(and(eq(recurringExpensesTable.id, id), eq(recurringExpensesTable.businessId, owner.id))).returning();

    if (!updated) return res.status(404).json({ error: "Recurring expense not found" });

    const [row] = await db
      .select({ ...getTableColumns(recurringExpensesTable), jobTitle: jobsTable.title })
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
    const ownership = await resolveMutationBusiness(req);
    if (!ownership.ok) return res.status(400).json({ error: ownership.error });
    await db.delete(recurringExpensesTable).where(and(eq(recurringExpensesTable.id, id), eq(recurringExpensesTable.businessId, ownership.business.id)));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete recurring expense" });
  }
});

export default router;
