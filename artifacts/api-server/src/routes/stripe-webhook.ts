import { Router, type Request, type Response } from "express";
import Stripe from "stripe";
import { db } from "@workspace/db";
import { invoicesTable, quickChargesTable, prospectsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getStripe } from "../lib/stripe";

const router = Router();

async function handlePaymentMetadata(metadata: Record<string, string>, paymentIntentId: string | null, amountReceived: number | null) {
  const invoiceId = metadata["invoice_id"] ? parseInt(metadata["invoice_id"]) : null;
  const prospectId = metadata["prospect_id"] ? parseInt(metadata["prospect_id"]) : null;
  const quickChargeId = metadata["quick_charge_id"] ? parseInt(metadata["quick_charge_id"]) : null;

  if (invoiceId && !isNaN(invoiceId)) {
    await db.update(invoicesTable)
      .set({
        status: "paid",
        stripePaymentIntentId: paymentIntentId ?? null,
        stripePaidAt: new Date(),
      })
      .where(eq(invoicesTable.id, invoiceId));
    console.log(`Invoice ${invoiceId} marked paid via Stripe`);
  }

  if (quickChargeId && !isNaN(quickChargeId)) {
    await db.update(quickChargesTable)
      .set({ status: "paid", paidAt: new Date() })
      .where(eq(quickChargesTable.id, quickChargeId));
    console.log(`Quick charge ${quickChargeId} marked paid via Stripe`);
  }

  if (prospectId && !isNaN(prospectId)) {
    await db.update(prospectsTable)
      .set({
        depositPaidAt: new Date(),
        ...(amountReceived !== null ? { depositPaidAmount: amountReceived.toFixed(2) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(prospectsTable.id, prospectId));
    console.log(`Prospect ${prospectId} deposit paid via Stripe`);
  }
}

router.post("/", async (req: Request, res: Response) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env["STRIPE_WEBHOOK_SECRET"];

  if (!webhookSecret) {
    console.warn("STRIPE_WEBHOOK_SECRET not set — skipping signature verification");
    return res.status(400).json({ error: "Webhook secret not configured" });
  }

  if (!sig) {
    return res.status(400).json({ error: "Missing stripe-signature header" });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig, webhookSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Webhook signature verification failed";
    console.error("Stripe webhook signature error:", message);
    return res.status(400).json({ error: message });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const metadata = session.metadata ?? {};
      const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;
      const amountTotal = session.amount_total !== null ? session.amount_total / 100 : null;
      await handlePaymentMetadata(metadata, paymentIntentId, amountTotal);
    }

    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object as Stripe.PaymentIntent;
      const metadata = pi.metadata ?? {};
      const amountReceived = pi.amount_received / 100;
      await handlePaymentMetadata(metadata, pi.id, amountReceived);
    }

    res.json({ received: true });
  } catch (err) {
    console.error("Stripe webhook processing error:", err);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

export default router;
