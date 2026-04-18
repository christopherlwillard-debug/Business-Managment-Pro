import { Router } from "express";
import { randomUUID } from "crypto";
import QRCode from "qrcode";
import { db } from "@workspace/db";
import { quickChargesTable, settingsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { createPaymentIntent, isStripeConfigured } from "../lib/stripe";

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

    const { label, amount, customerName, customerEmail, notes, payPageBaseUrl } = req.body as {
      label: string;
      amount: number;
      customerName?: string | null;
      customerEmail?: string | null;
      notes?: string | null;
      payPageBaseUrl?: string | null;
    };

    if (!label) return res.status(400).json({ error: "Label is required" });
    if (!amount || amount <= 0) return res.status(400).json({ error: "Amount must be greater than zero" });

    const [settings] = await db.select().from(settingsTable).limit(1);
    const currency = settings?.currency ?? "USD";
    const companyName = settings?.companyName ?? "BuildPro";

    const [charge] = await db.insert(quickChargesTable).values({
      label,
      amount: amount.toString(),
      customerName: customerName ?? null,
      customerEmail: customerEmail ?? null,
      notes: notes ?? null,
      status: "pending",
    }).returning();

    let paymentIntentId: string;
    let payToken: string;
    let qrDataUrl: string | null = null;

    try {
      const amountCents = Math.round(amount * 100);
      const metadata: Record<string, string> = {
        source: "buildpro",
        charge_label: label,
        quick_charge_id: String(charge.id),
      };
      const pi = await createPaymentIntent({
        amountCents,
        currency,
        description: `${companyName}: ${label}`,
        metadata,
      });
      paymentIntentId = pi.id;
      payToken = randomUUID();

      if (payPageBaseUrl) {
        const payUrl = `${payPageBaseUrl}${payToken}`;
        qrDataUrl = await QRCode.toDataURL(payUrl, { width: 300, margin: 2 });
      }
    } catch (stripeErr) {
      await db.delete(quickChargesTable).where(eq(quickChargesTable.id, charge.id));
      throw stripeErr;
    }

    const [updated] = await db.update(quickChargesTable)
      .set({
        stripePaymentIntentId: paymentIntentId,
        payToken,
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

router.post("/:id/pay-session", async (req, res) => {
  try {
    if (!isStripeConfigured()) {
      return res.status(400).json({ error: "Stripe is not configured." });
    }

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const [charge] = await db.select().from(quickChargesTable).where(eq(quickChargesTable.id, id));
    if (!charge) return res.status(404).json({ error: "Quick charge not found" });
    if (charge.status === "paid") return res.status(400).json({ error: "Already paid" });

    const { payPageBaseUrl } = req.body as { payPageBaseUrl?: string };

    let payToken = charge.payToken ?? null;
    let paymentIntentId = charge.stripePaymentIntentId ?? null;
    let qrDataUrl = charge.qrCodeDataUrl ?? null;

    if (!paymentIntentId) {
      const [settings] = await db.select().from(settingsTable).limit(1);
      const currency = settings?.currency ?? "USD";
      const companyName = settings?.companyName ?? "BuildPro";
      const amountCents = Math.round(parseFloat(charge.amount) * 100);
      const pi = await createPaymentIntent({
        amountCents,
        currency,
        description: `${companyName}: ${charge.label}`,
        metadata: { source: "buildpro", charge_label: charge.label, quick_charge_id: String(id) },
      });
      paymentIntentId = pi.id;
    }

    if (!payToken) {
      payToken = randomUUID();
    }

    if (payPageBaseUrl && !qrDataUrl) {
      qrDataUrl = await QRCode.toDataURL(`${payPageBaseUrl}${payToken}`, { width: 300, margin: 2 });
    }

    const needsUpdate = !charge.stripePaymentIntentId || !charge.payToken || (payPageBaseUrl && !charge.qrCodeDataUrl);
    if (needsUpdate) {
      await db.update(quickChargesTable)
        .set({ stripePaymentIntentId: paymentIntentId, payToken, qrCodeDataUrl: qrDataUrl ?? undefined })
        .where(eq(quickChargesTable.id, id));
    }

    const payUrl = payPageBaseUrl ? `${payPageBaseUrl}${payToken}` : payToken;
    res.json({ payUrl, payToken });
  } catch (err: unknown) {
    console.error("Quick charge pay-session error:", err);
    const message = err instanceof Error ? err.message : "Failed to create pay session";
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
