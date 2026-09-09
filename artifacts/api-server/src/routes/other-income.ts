import { Router } from "express";
import { db } from "@workspace/db";
import { otherIncomeTable } from "@workspace/db/schema";
import { eq, and, gte, lte, desc, isNull, or } from "drizzle-orm";
import { jobsTable } from "@workspace/db/schema";
import { requestedBusiness, resolveMutationBusiness, belongsToBusiness, mutationBusinessPredicate } from "../lib/business-scope.js";

const router = Router();

const VALID_PAYMENT_METHODS = ["cash", "check", "bank_transfer", "other"] as const;
type PaymentMethod = typeof VALID_PAYMENT_METHODS[number];
function parseBody(body: any): { clientId?: number | null; jobId?: number | null; businessId?: string | null; amount: string; date: string; description: string; source?: string | null; paymentMethod: PaymentMethod; city?: string | null; state?: string | null; notes?: string | null; businessLine?: string | null } | null {
  const { clientId, jobId, amount, date, description, source, paymentMethod, city, state, notes, businessLine } = body ?? {};
  if (!amount || isNaN(parseFloat(String(amount)))) return null;
  if (!date || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!description || typeof description !== "string" || description.trim() === "") return null;
  const pm: PaymentMethod = VALID_PAYMENT_METHODS.includes(paymentMethod) ? paymentMethod : "other";
  const parsedClientId = clientId != null && !isNaN(parseInt(String(clientId))) ? parseInt(String(clientId)) : null;
  const parsedJobId = jobId != null && !isNaN(parseInt(String(jobId))) ? parseInt(String(jobId)) : null;
  return {
    clientId: parsedClientId,
    jobId: parsedJobId,
    amount: String(parseFloat(String(amount))),
    date,
    description: description.trim(),
    source: source ? String(source).trim() || null : null,
    paymentMethod: pm,
    city: city ? String(city).trim() || null : null,
    state: state ? String(state).trim() || null : null,
    notes: notes ? String(notes).trim() || null : null,
    businessLine: businessLine && typeof businessLine === "string" ? businessLine.trim() || null : null,
  };
}

router.get("/", async (req, res) => {
  try {
    const { startDate, endDate, businessLine } = req.query as { startDate?: string; endDate?: string; businessLine?: string };
    const scope = await requestedBusiness(req);
    const conditions: any[] = [isNull(otherIncomeTable.voidedAt)];
    if (startDate && endDate) {
      conditions.push(gte(otherIncomeTable.date, startDate), lte(otherIncomeTable.date, endDate));
    }
    if (scope) {
      conditions.push(or(
        eq(otherIncomeTable.businessId, String(scope.id)),
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
    const data = parseBody(req.body);
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
    const data = parseBody(req.body);
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
    data.businessId = data.businessId ?? existing.businessId ?? String(owner.id);
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
