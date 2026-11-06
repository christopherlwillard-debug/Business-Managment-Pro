import { Router } from "express";
import { db } from "@workspace/db";
import { paymentsTable, subcontractorsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requestedBusiness, hasRequestedBusiness, invalidBusinessScope, resolveMutationBusiness, mutationBusinessPredicate } from "../lib/business-scope.js";

const router = Router();

/** Validate legacy subcontractor payment money against NUMERIC(12,2). */
export function parseSubcontractorPaymentAmount(value: unknown): string | null {
  const text = typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : typeof value === "string" ? value.trim() : "";
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(text)) return null;
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 9_999_999_999.99) return null;
  return amount.toFixed(2);
}

export function isValidPaymentDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parsePaymentYear(value: unknown): number | null {
  const year = typeof value === "number" ? value
    : typeof value === "string" && /^\d{4}$/.test(value) ? Number(value)
    : NaN;
  return Number.isInteger(year) && year >= 2000 && year <= 2200 ? year : null;
}

// GET /api/payments - list all payments (with optional filtering)
router.get("/", async (req, res) => {
  try {
    const { year, subcontractorId } = req.query;
    const scope = await requestedBusiness(req);
    if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return;
    const parsedYear = year === undefined ? null : parsePaymentYear(year);
    const parsedSubcontractorId = subcontractorId === undefined ? null : Number(subcontractorId);
    if (year !== undefined && parsedYear == null) return res.status(400).json({ error: "A valid tax year is required" });
    if (subcontractorId !== undefined && (!Number.isSafeInteger(parsedSubcontractorId) || parsedSubcontractorId! <= 0)) {
      return res.status(400).json({ error: "A valid subcontractor ID is required" });
    }

    let query: any = db
      .select({
        id: paymentsTable.id,
        subcontractorId: paymentsTable.subcontractorId,
        subcontractorName: subcontractorsTable.name,
        amount: paymentsTable.amount,
        paymentDate: paymentsTable.paymentDate,
        year: paymentsTable.year,
        description: paymentsTable.description,
        invoiceNumber: paymentsTable.invoiceNumber,
        notes: paymentsTable.notes,
        paymentMethod: paymentsTable.paymentMethod,
        createdAt: paymentsTable.createdAt,
      })
      .from(paymentsTable)
      .leftJoin(subcontractorsTable, eq(paymentsTable.subcontractorId, subcontractorsTable.id));

    const conditions: any[] = [];
    if (scope) conditions.push(eq(paymentsTable.businessId, scope.id));
    if (year) {
      conditions.push(eq(paymentsTable.year, parsedYear!));
    }
    if (subcontractorId) {
      conditions.push(eq(paymentsTable.subcontractorId, parsedSubcontractorId!));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const payments = await query.orderBy(desc(paymentsTable.paymentDate));

    res.json(payments.map((p: any) => ({
      id: p.id,
      subcontractorId: p.subcontractorId,
      subcontractorName: p.subcontractorName,
      amount: parseFloat(p.amount as any),
      paymentDate: p.paymentDate,
      year: p.year,
      description: p.description,
      invoiceNumber: p.invoiceNumber,
      notes: p.notes,
      paymentMethod: p.paymentMethod ?? null,
      createdAt: p.createdAt,
    })));
  } catch (err) {
    console.error("Error listing payments:", err);
    res.status(500).json({ error: "Failed to list payments" });
  }
});

// GET /api/payments/:id - get single payment
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid payment ID" });
    const scope = await requestedBusiness(req);
    if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return;
    const conditions = [eq(paymentsTable.id, id)];
    if (scope) conditions.push(eq(paymentsTable.businessId, scope.id));
    const [payment] = await db
      .select()
      .from(paymentsTable)
      .where(and(...conditions));

    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    res.json({
      id: payment.id,
      subcontractorId: payment.subcontractorId,
      amount: parseFloat(payment.amount as any),
      paymentDate: payment.paymentDate,
      year: payment.year,
      description: payment.description,
      invoiceNumber: payment.invoiceNumber,
      notes: payment.notes,
      paymentMethod: payment.paymentMethod ?? null,
      createdAt: payment.createdAt,
    });
  } catch (err) {
    console.error("Error fetching payment:", err);
    res.status(500).json({ error: "Failed to fetch payment" });
  }
});

// POST /api/payments - create payment
router.post("/", async (req, res) => {
  try {
    const { subcontractorId, amount, paymentDate, year, description, invoiceNumber, notes, paymentMethod } = req.body ?? {};
    const parsedSubcontractorId = Number(subcontractorId);
    const parsedAmount = parseSubcontractorPaymentAmount(amount);
    const parsedYear = parsePaymentYear(year);
    if (!Number.isSafeInteger(parsedSubcontractorId) || parsedSubcontractorId <= 0) {
      return res.status(400).json({ error: "A valid subcontractor is required" });
    }
    if (!parsedAmount) return res.status(400).json({ error: "Payment amount must be a positive dollar amount with no more than two decimal places" });
    if (!isValidPaymentDate(paymentDate)) return res.status(400).json({ error: "Payment date must be a valid YYYY-MM-DD date" });
    if (parsedYear == null) return res.status(400).json({ error: "A valid tax year is required" });
    const ownership = await resolveMutationBusiness(req);
    if (!ownership.ok) return res.status(400).json({ error: ownership.error });

    const [payment] = await db
      .insert(paymentsTable)
      .values({
         businessId: ownership.business.id,
        subcontractorId: parsedSubcontractorId,
        amount: parsedAmount,
        paymentDate,
        year: parsedYear,
        description: description || null,
        invoiceNumber: invoiceNumber || null,
        notes: notes || null,
        paymentMethod: paymentMethod || null,
      })
      .returning();

    res.status(201).json({
      id: payment.id,
      subcontractorId: payment.subcontractorId,
      amount: parseFloat(payment.amount as any),
      paymentDate: payment.paymentDate,
      year: payment.year,
      description: payment.description,
      invoiceNumber: payment.invoiceNumber,
      notes: payment.notes,
      paymentMethod: payment.paymentMethod ?? null,
      createdAt: payment.createdAt,
    });
  } catch (err) {
    console.error("Error creating payment:", err);
    res.status(500).json({ error: "Failed to create payment" });
  }
});

// PUT /api/payments/:id - update payment
router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid payment ID" });
    const ownership = await resolveMutationBusiness(req);
    if (!ownership.ok) return res.status(400).json({ error: ownership.error });
    const { amount, paymentDate, year, description, invoiceNumber, notes, paymentMethod } = req.body ?? {};
    const updates: Record<string, unknown> = {};
    if (amount !== undefined) {
      const parsed = parseSubcontractorPaymentAmount(amount);
      if (!parsed) return res.status(400).json({ error: "Payment amount must be a positive dollar amount with no more than two decimal places" });
      updates.amount = parsed;
    }
    if (paymentDate !== undefined) {
      if (!isValidPaymentDate(paymentDate)) return res.status(400).json({ error: "Payment date must be a valid YYYY-MM-DD date" });
      updates.paymentDate = paymentDate;
    }
    if (year !== undefined) {
      const parsed = parsePaymentYear(year);
      if (parsed == null) return res.status(400).json({ error: "A valid tax year is required" });
      updates.year = parsed;
    }
    Object.assign(updates, {
      ...(description !== undefined && { description: description || null }),
      ...(invoiceNumber !== undefined && { invoiceNumber: invoiceNumber || null }),
      ...(notes !== undefined && { notes: notes || null }),
      ...(paymentMethod !== undefined && { paymentMethod: paymentMethod || null }),
    });

    const [payment] = await db
      .update(paymentsTable)
      .set(updates)
      .where(and(eq(paymentsTable.id, id), mutationBusinessPredicate(paymentsTable, ownership.business)))
      .returning();
    if (!payment) return res.status(404).json({ error: "Payment not found" });
    res.json({
      id: payment.id,
      subcontractorId: payment.subcontractorId,
      amount: parseFloat(payment.amount as any),
      paymentDate: payment.paymentDate,
      year: payment.year,
      description: payment.description,
      invoiceNumber: payment.invoiceNumber,
      notes: payment.notes,
      paymentMethod: payment.paymentMethod ?? null,
      createdAt: payment.createdAt,
    });
  } catch (err) {
    console.error("Error updating payment:", err);
    res.status(500).json({ error: "Failed to update payment" });
  }
});



// DELETE /api/payments/:id - delete payment
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid payment ID" });
    const ownership = await resolveMutationBusiness(req);
    if (!ownership.ok) return res.status(400).json({ error: ownership.error });
    const [deleted] = await db
      .delete(paymentsTable)
      .where(and(eq(paymentsTable.id, id), mutationBusinessPredicate(paymentsTable, ownership.business)))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: "Payment not found" });
    }

    res.json({ success: true, id });
  } catch (err) {
    console.error("Error deleting payment:", err);
    res.status(500).json({ error: "Failed to delete payment" });
  }
});

export default router;
