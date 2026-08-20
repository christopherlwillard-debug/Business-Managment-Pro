import { Router } from "express";
import { db } from "@workspace/db";
import { otherIncomeTable } from "@workspace/db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { requestedBusiness, belongsToBusiness } from "../lib/business-scope.js";

const router = Router();

const VALID_PAYMENT_METHODS = ["cash", "check", "bank_transfer", "other"] as const;
type PaymentMethod = typeof VALID_PAYMENT_METHODS[number];
function parseBody(body: any): { clientId?: number | null; amount: string; date: string; description: string; source?: string | null; paymentMethod: PaymentMethod; city?: string | null; state?: string | null; notes?: string | null; businessLine?: string | null } | null {
  const { clientId, amount, date, description, source, paymentMethod, city, state, notes, businessLine } = body ?? {};
  if (!amount || isNaN(parseFloat(String(amount)))) return null;
  if (!date || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!description || typeof description !== "string" || description.trim() === "") return null;
  const pm: PaymentMethod = VALID_PAYMENT_METHODS.includes(paymentMethod) ? paymentMethod : "other";
  const parsedClientId = clientId != null && !isNaN(parseInt(String(clientId))) ? parseInt(String(clientId)) : null;
  return {
    clientId: parsedClientId,
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
    const conditions = [];
    if (startDate && endDate) {
      conditions.push(gte(otherIncomeTable.date, startDate), lte(otherIncomeTable.date, endDate));
    }
    if (scope) {
      conditions.push(eq(otherIncomeTable.businessLine, scope.slug));
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
    const scope = await requestedBusiness(req);
    data.businessLine = scope?.slug ?? data.businessLine ?? null;
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
    const scope = await requestedBusiness(req);
    const [existing] = await db.select().from(otherIncomeTable).where(eq(otherIncomeTable.id, id));
    if (!existing || !belongsToBusiness(existing, scope)) { res.status(404).json({ error: "Not found" }); return; }
    data.businessLine = scope?.slug ?? existing.businessLine;
    const [row] = await db.update(otherIncomeTable).set(data).where(and(eq(otherIncomeTable.id, id), eq(otherIncomeTable.businessLine, data.businessLine ?? ""))).returning();
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
    await db.delete(otherIncomeTable).where(and(eq(otherIncomeTable.id, id), eq(otherIncomeTable.businessLine, existing.businessLine ?? "")));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete other income entry" });
  }
});

export default router;
