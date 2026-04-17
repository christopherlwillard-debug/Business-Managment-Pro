import { Router, type Request, type Response } from "express";
import Stripe from "stripe";
import { db } from "@workspace/db";
import { invoicesTable, quickChargesTable, prospectsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getStripe } from "../lib/stripe";

const router = Router();

router.post(
  "/webhooks/stripe",
  async (req: Request, res: Response) => {
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
      if (event.type === "checkout.session.completed" || event.type === "payment_intent.succeeded") {
        const obj = event.data.object as Stripe.PaymentIntent | Stripe.Checkout.Session;
        const metadata = obj.metadata ?? {};

        const invoiceId = metadata["invoice_id"] ? parseInt(metadata["invoice_id"]) : null;
        const prospectId = metadata["prospect_id"] ? parseInt(metadata["prospect_id"]) : null;

        const paymentIntentId =
          event.type === "payment_intent.succeeded"
            ? (obj as Stripe.PaymentIntent).id
            : (obj as Stripe.Checkout.Session).payment_intent as string | null;

        if (invoiceId && !isNaN(invoiceId)) {
          await db.update(invoicesTable)
            .set({
              status: "paid",
              stripePaymentIntentId: paymentIntentId ?? null,
              stripePaidAt: new Date(),
            })
            .where(eq(invoicesTable.id, invoiceId));
          console.log(`Invoice ${invoiceId} marked paid via Stripe`);
        } else if (prospectId && !isNaN(prospectId)) {
          await db.update(prospectsTable)
            .set({ status: "quoted", updatedAt: new Date() })
            .where(eq(prospectsTable.id, prospectId));
          console.log(`Prospect ${prospectId} deposit received via Stripe`);
        }
      }

      if (event.type === "payment_link.completed") {
        const link = event.data.object as Stripe.PaymentLink;
        const linkId = link.id;
        const metadata = link.metadata ?? {};

        const invoiceId = metadata["invoice_id"] ? parseInt(metadata["invoice_id"]) : null;
        const prospectId = metadata["prospect_id"] ? parseInt(metadata["prospect_id"]) : null;

        if (invoiceId && !isNaN(invoiceId)) {
          await db.update(invoicesTable)
            .set({ status: "paid", stripePaidAt: new Date() })
            .where(eq(invoicesTable.id, invoiceId));
        }

        const qcRows = await db.select().from(quickChargesTable)
          .where(eq(quickChargesTable.stripePaymentLinkId, linkId));
        if (qcRows.length > 0) {
          await db.update(quickChargesTable)
            .set({ status: "paid", paidAt: new Date() })
            .where(eq(quickChargesTable.stripePaymentLinkId, linkId));
          console.log(`Quick charge ${qcRows[0].id} marked paid via Stripe`);
        }

        if (prospectId && !isNaN(prospectId)) {
          await db.update(prospectsTable)
            .set({ status: "quoted", updatedAt: new Date() })
            .where(eq(prospectsTable.id, prospectId));
        }
      }

      res.json({ received: true });
    } catch (err) {
      console.error("Stripe webhook processing error:", err);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  }
);

export default router;
