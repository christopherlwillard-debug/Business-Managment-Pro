import { Router } from "express";
import { db } from "@workspace/db";
import { invoicesTable, quickChargesTable, settingsTable, clientsTable, jobsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getStripe, isStripeConfigured } from "../lib/stripe";

const router = Router();

router.get("/:payToken", async (req, res) => {
  try {
    const { payToken } = req.params;
    if (!payToken || payToken.length < 8) {
      return res.status(400).json({ error: "Invalid pay token" });
    }

    if (!isStripeConfigured()) {
      return res.status(503).json({ error: "Payment processing not configured" });
    }

    const [settings] = await db.select().from(settingsTable).limit(1);
    const businessName = settings?.companyName ?? "Willard's General Contracting";
    const currency = settings?.currency ?? "USD";

    const [inv] = await db
      .select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        total: invoicesTable.total,
        status: invoicesTable.status,
        stripePaidAt: invoicesTable.stripePaidAt,
        stripePaymentIntentId: invoicesTable.stripePaymentIntentId,
        clientName: clientsTable.name,
        jobTitle: jobsTable.title,
        notes: invoicesTable.notes,
      })
      .from(invoicesTable)
      .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
      .leftJoin(jobsTable, eq(invoicesTable.jobId, jobsTable.id))
      .where(eq(invoicesTable.payToken, payToken))
      .limit(1);

    if (inv) {
      if (inv.stripePaidAt) {
        return res.json({
          type: "invoice",
          paidAt: inv.stripePaidAt.toISOString(),
          businessName,
          description: `Invoice ${inv.invoiceNumber}${inv.clientName ? ` — ${inv.clientName}` : ""}`,
          amountCents: Math.round(parseFloat(inv.total ?? "0") * 100),
        });
      }

      const stripe = getStripe();
      const pi = await stripe.paymentIntents.retrieve(inv.stripePaymentIntentId!);
      if (!pi.client_secret) return res.status(500).json({ error: "Payment intent missing client secret" });

      const description = [
        `Invoice ${inv.invoiceNumber}`,
        inv.clientName,
        inv.jobTitle,
      ].filter(Boolean).join(" — ");

      return res.json({
        type: "invoice",
        clientSecret: pi.client_secret,
        amountCents: pi.amount,
        currency: pi.currency ?? currency,
        description,
        businessName,
        paidAt: null,
      });
    }

    const [qc] = await db
      .select()
      .from(quickChargesTable)
      .where(eq(quickChargesTable.payToken, payToken))
      .limit(1);

    if (qc) {
      if (qc.paidAt) {
        return res.json({
          type: "quick_charge",
          paidAt: qc.paidAt.toISOString(),
          businessName,
          description: qc.label,
          amountCents: Math.round(parseFloat(qc.amount) * 100),
        });
      }

      const stripe = getStripe();
      const pi = await stripe.paymentIntents.retrieve(qc.stripePaymentIntentId!);
      if (!pi.client_secret) return res.status(500).json({ error: "Payment intent missing client secret" });

      return res.json({
        type: "quick_charge",
        clientSecret: pi.client_secret,
        amountCents: pi.amount,
        currency: pi.currency,
        description: qc.label,
        businessName,
        paidAt: null,
      });
    }

    return res.status(404).json({ error: "Payment not found" });
  } catch (err) {
    console.error("Pay public endpoint error:", err);
    res.status(500).json({ error: "Failed to load payment" });
  }
});

export default router;
