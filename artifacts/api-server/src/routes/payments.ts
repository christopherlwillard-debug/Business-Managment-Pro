import { Router } from "express";
import { db } from "@workspace/db";
import { paymentsTable, subcontractorsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requestedBusiness, hasRequestedBusiness, invalidBusinessScope, resolveMutationBusiness, mutationBusinessPredicate } from "../lib/business-scope.js";

const router = Router();

// GET /api/payments - list all payments (with optional filtering)
router.get("/", async (req, res) => {
  try {
    const { year, subcontractorId } = req.query;
    const scope = await requestedBusiness(req);
    if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return;

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
      conditions.push(eq(paymentsTable.year, parseInt(year as string)));
    }
    if (subcontractorId) {
      conditions.push(eq(paymentsTable.subcontractorId, parseInt(subcontractorId as string)));
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
    const { subcontractorId, amount, paymentDate, year, description, invoiceNumber, notes, paymentMethod } = req.body;

    if (!subcontractorId || !amount || !paymentDate || !year) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const ownership = await resolveMutationBusiness(req);
    if (!ownership.ok) return res.status(400).json({ error: ownership.error });

    const [payment] = await db
      .insert(paymentsTable)
      .values({
         businessId: ownership.business.id,
        subcontractorId,
        amount: amount.toString(),
        paymentDate,
        year,
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
    const id = parseInt(req.params.id);
    const ownership = await resolveMutationBusiness(req);
    if (!ownership.ok) return res.status(400).json({ error: ownership.error });
    const { amount, paymentDate, year, description, invoiceNumber, notes, paymentMethod } = req.body;

    const [payment] = await db
      .update(paymentsTable)
      .set({
        ...(amount !== undefined && { amount: amount.toString() }),
        ...(paymentDate && { paymentDate }),
        ...(year && { year }),
        ...(description !== undefined && { description: description || null }),
        ...(invoiceNumber !== undefined && { invoiceNumber: invoiceNumber || null }),
        ...(notes !== undefined && { notes: notes || null }),
        ...(paymentMethod !== undefined && { paymentMethod: paymentMethod || null }),
      })
      .where(and(eq(paymentsTable.id, id), mutationBusinessPredicate(paymentsTable, ownership.business)))
      .returning();

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
    console.error("Error updating payment:", err);
    res.status(500).json({ error: "Failed to update payment" });
  }
});

// DELETE /api/payments/:id - delete payment
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
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
