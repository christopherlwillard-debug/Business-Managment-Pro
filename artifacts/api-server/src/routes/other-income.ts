import { Router } from "express";
import { db } from "@workspace/db";
import { otherIncomeTable } from "@workspace/db/schema";
import { eq, and, gte, lte, desc, isNull, or } from "drizzle-orm";
import { jobsTable } from "@workspace/db/schema";
import { requestedBusiness, hasRequestedBusiness, invalidBusinessScope, resolveMutationBusiness, belongsToBusiness, mutationBusinessPredicate } from "../lib/business-scope.js";

const router = Router();

const VALID_PAYMENT_METHODS = ["cash", "check", "bank_transfer", "other"] as const;
type PaymentMethod = typeof VALID_PAYMENT_METHODS[number];
export function parseOtherIncomeBody(body: unknown): {
  clientId?: number | null;
  jobId?: number | null;
  businessId?: string | null;
  amount: string;
  date: string;
  description: string;
  source?: string | null;
  paymentMethod: PaymentMethod;
  city?: string | null;
  state?: string | null;
  notes?: string | null;
  businessLine?: string | null;
} | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const { clientId, jobId, amount, date, description, source, paymentMethod, city, state, notes } = input;

  const amountText = typeof amount === "number" && Number.isFinite(amount)
    ? String(amount)
    : typeof amount === "string" ? amount.trim() : "";
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(amountText)) return null;
  const amountNumber = Number(amountText);
  if (!Number.isFinite(amountNumber) || amountNumber <= 0 || amountNumber > 9_999_999_999.99) return null;

  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) return null;

  if (typeof description !== "string" || !description.trim() || description.trim().length > 500) return null;

  const parseOptionalId = (value: unknown): number | null | undefined => {
    if (value == null || value === "") return null;
    const text = String(value).trim();
    if (!/^\d+$/.test(text)) return undefined;
    const parsed = Number(text);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
  };
  const parsedClientId = parseOptionalId(clientId);
  const parsedJobId = parseOptionalId(jobId);
  if (parsedClientId === undefined || parsedJobId === undefined) return null;

  const optionalText = (value: unknown, maxLength: number): string | null | undefined => {
    if (value == null || value === "") return null;
    if (typeof value !== "string" || value.length > maxLength) return undefined;
    return value.trim() || null;
  };
  const parsedSource = optionalText(source, 120);
  const parsedCity = optionalText(city, 120);
  const parsedState = optionalText(state, 80);
  const parsedNotes = optionalText(notes, 2000);
  if ([parsedSource, parsedCity, parsedState, parsedNotes].includes(undefined)) return null;

  const pm: PaymentMethod = VALID_PAYMENT_METHODS.includes(paymentMethod as PaymentMethod)
    ? paymentMethod as PaymentMethod
    : "other";
  return {
    clientId: parsedClientId,
    jobId: parsedJobId,
    amount: amountNumber.toFixed(2),
    date,
    description: description.trim(),
    source: parsedSource,
    paymentMethod: pm,
    city: parsedCity,
    state: parsedState,
    notes: parsedNotes,
  };
}

router.get("/", async (req, res) => {
  try {
    const { startDate, endDate, businessLine } = req.query as { startDate?: string; endDate?: string; businessLine?: string };
    const scope = await requestedBusiness(req);
    if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return;
    const conditions: any[] = [isNull(otherIncomeTable.voidedAt)];
    if (startDate && endDate) {
      conditions.push(gte(otherIncomeTable.date, startDate), lte(otherIncomeTable.date, endDate));
    }
    if (scope) {
      conditions.push(or(
        eq(otherIncomeTable.businessId, String(scope.id)),
        eq(otherIncomeTable.businessId, scope.slug),
        and(isNull(otherIncomeTable.businessId), eq(otherIncomeTable.businessLine, scope.slug)),
      ));
    } else if (businessLine) {
      conditions.push(eq(otherIncomeTable.businessLine, businessLine));
    }
    const rows = await db.select().from(otherIncomeTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(otherIncomeTable.date));
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list other income" });
  }
});

router.post("/", async (req, res) => {
  try {
    const data = parseOtherIncomeBody(req.body);
    if (!data) { res.status(400).json({ error: "Invalid payload" }); return; }
    const ownership = await resolveMutationBusiness(req);
    if (!ownership.ok) return res.status(400).json({ error: ownership.error });
    const owner = ownership.business;
    if (data.jobId != null) {
      const [job] = await db.select({ id: jobsTable.id, businessId: jobsTable.businessId, businessLine: jobsTable.businessLine })
        .from(jobsTable).where(eq(jobsTable.id, data.jobId));
      if (!job || !belongsToBusiness(job, owner)) {
        res.status(404).json({ error: "Job not found" });
        return;
      }
      data.businessId = job.businessId != null ? String(job.businessId) : String(owner.id);
      data.businessLine = owner.slug;
    }
    data.businessId = data.businessId ?? String(owner.id);
    data.businessLine = owner.slug;
    const [row] = await db.insert(otherIncomeTable).values(data).returning();
    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create other income entry" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const data = parseOtherIncomeBody(req.body);
    if (!data) { res.status(400).json({ error: "Invalid payload" }); return; }
    const ownership = await resolveMutationBusiness(req);
    if (!ownership.ok) return res.status(400).json({ error: ownership.error });
    const owner = ownership.business;
    const [existing] = await db.select().from(otherIncomeTable)
      .where(and(eq(otherIncomeTable.id, id), mutationBusinessPredicate(otherIncomeTable, owner)));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    if (existing.voidedAt) { res.status(400).json({ error: "Voided income entries cannot be edited." }); return; }
    if (data.jobId != null) {
      const [job] = await db.select({ id: jobsTable.id, businessId: jobsTable.businessId, businessLine: jobsTable.businessLine })
        .from(jobsTable).where(eq(jobsTable.id, data.jobId));
      if (!job || !belongsToBusiness(job, owner)) {
        res.status(404).json({ error: "Job not found" });
        return;
      }
      data.businessId = job.businessId != null ? String(job.businessId) : String(owner.id);
      data.businessLine = owner.slug;
    }
    // Re-save legacy slug-owned rows with the canonical numeric business ID.
    data.businessId = String(owner.id);
    data.businessLine = owner.slug;
    const [row] = await db.update(otherIncomeTable).set(data)
      .where(and(eq(otherIncomeTable.id, id), mutationBusinessPredicate(otherIncomeTable, owner))).returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update other income entry" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const scope = await requestedBusiness(req);
    if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return;
    const [existing] = await db.select().from(otherIncomeTable).where(eq(otherIncomeTable.id, id));
    if (!existing || !belongsToBusiness(existing, scope)) { res.status(404).json({ error: "Not found" }); return; }
    return res.status(409).json({ error: "Posted income cannot be deleted. Use the void action to preserve financial history." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete other income entry" });
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
    const [updated] = await db.update(otherIncomeTable)
      .set({ voidedAt: new Date(), voidReason: reason })
      .where(and(
        eq(otherIncomeTable.id, id),
        mutationBusinessPredicate(otherIncomeTable, ownership.business),
        isNull(otherIncomeTable.voidedAt),
      ))
      .returning();
    if (!updated) return res.status(404).json({ error: "Income entry not found or already voided" });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to void income entry" });
  }
});

export default router;
