import { Router } from "express";
import QRCode from "qrcode";
import { db } from "@workspace/db";
import { quickChargesTable, settingsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { createPaymentLink, isStripeConfigured } from "../lib/stripe";

const router = Router();

function fmt(q: typeof quickChargesTable.$inferSelect) {
  return {
    ...q,
    amount: parseFloat(q.amount),
    paidAt: q.paidAt instanceof Date ? q.paidAt.toISOString() : q.paidAt,
    createdAt: q.createdAt instanceof Date ? q.createdAt.toISOString() : q.createdAt,
  };
}

router.get("/", async (_req, res) => {
  try {
    const rows = await db.select().from(quickChargesTable).orderBy(desc(quickChargesTable.createdAt));
    res.json(rows.map(fmt));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch quick charges" });
  }
});

router.post("/", async (req, res) => {
  try {
    if (!isStripeConfigured()) {
      return res.status(400).json({ error: "Stripe is not configured. Add STRIPE_SECRET_KEY to your environment." });
    }

    const { label, amount, customerName, customerEmail, notes } = req.body as {
      label: string;
      amount: number;
      customerName?: string | null;
      customerEmail?: string | null;
      notes?: string | null;
    };

    if (!label) return res.status(400).json({ error: "Label is required" });
    if (!amount || amount <= 0) return res.status(400).json({ error: "Amount must be greater than zero" });

    const [settings] = await db.select().from(settingsTable).limit(1);
    const currency = settings?.currency ?? "USD";
    const companyName = settings?.companyName ?? "BuildPro";

    // Insert first to get an ID, then create the payment link with that ID in metadata
    const [charge] = await db.insert(quickChargesTable).values({
      label,
      amount: amount.toString(),
      customerName: customerName ?? null,
      customerEmail: customerEmail ?? null,
      notes: notes ?? null,
      status: "pending",
    }).returning();

    const amountCents = Math.round(amount * 100);
    const metadata: Record<string, string> = {
      source: "buildpro",
      charge_label: label,
      quick_charge_id: String(charge.id),
    };

    const { url, id: linkId } = await createPaymentLink({
      amountCents,
      currency,
      productName: `${companyName}: ${label}`,
      metadata,
      customerEmail: customerEmail ?? null,
    });

    const qrDataUrl = await QRCode.toDataURL(url, { width: 300, margin: 2 });

    const [updated] = await db.update(quickChargesTable)
      .set({
        stripePaymentLinkId: linkId,
        stripePaymentLinkUrl: url,
        qrCodeDataUrl: qrDataUrl,
      })
      .where(eq(quickChargesTable.id, charge.id))
      .returning();

    res.status(201).json(fmt(updated));
  } catch (err: unknown) {
    console.error("Quick charge creation error:", err);
    const message = err instanceof Error ? err.message : "Failed to create quick charge";
    res.status(500).json({ error: message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    await db.delete(quickChargesTable).where(eq(quickChargesTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete quick charge" });
  }
});

export default router;
