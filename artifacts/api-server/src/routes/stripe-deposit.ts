import { Router } from "express";
import { db } from "@workspace/db";
import { prospectsTable, estimatesTable, settingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { createPaymentLink, isStripeConfigured } from "../lib/stripe";

const router = Router();

router.post("/prospects/:id/deposit-link", async (req, res) => {
  try {
    if (!isStripeConfigured()) {
      return res.status(400).json({ error: "Stripe is not configured. Add STRIPE_SECRET_KEY to your environment." });
    }

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid prospect id" });

    const { depositAmount, depositPercent } = req.body as {
      depositAmount?: number;
      depositPercent?: number;
    };

    const [[prospect], [settings]] = await Promise.all([
      db.select().from(prospectsTable).where(eq(prospectsTable.id, id)),
      db.select().from(settingsTable).limit(1),
    ]);

    if (!prospect) return res.status(404).json({ error: "Prospect not found" });

    const roughQuote = prospect.roughQuote ? parseFloat(prospect.roughQuote) : null;

    let amount: number;
    if (depositAmount && depositAmount > 0) {
      amount = depositAmount;
    } else if (depositPercent && depositPercent > 0 && roughQuote) {
      amount = roughQuote * (depositPercent / 100);
    } else if (roughQuote) {
      amount = roughQuote * 0.5;
    } else {
      return res.status(400).json({ error: "Cannot calculate deposit amount. Provide depositAmount or ensure prospect has a rough quote." });
    }

    const amountCents = Math.round(amount * 100);
    const currency = settings?.currency ?? "USD";
    const companyName = settings?.companyName ?? "BuildPro";

    const label = prospect.contactName
      ? `${prospect.contactName} — ${prospect.address}`
      : prospect.address;

    const metadata: Record<string, string> = {
      prospect_id: String(id),
      source: "buildpro",
      charge_type: "deposit",
    };

    const { url, id: linkId } = await createPaymentLink({
      amountCents,
      currency,
      productName: `${companyName}: Deposit — ${label}`,
      metadata,
      customerEmail: prospect.contactEmail ?? null,
    });

    await db.update(prospectsTable)
      .set({ stripePaymentLinkId: linkId, stripePaymentLinkUrl: url, updatedAt: new Date() })
      .where(eq(prospectsTable.id, id));

    const [updated] = await db
      .select({ ...prospectsTable, estimateNumber: estimatesTable.title })
      .from(prospectsTable)
      .leftJoin(estimatesTable, eq(prospectsTable.linkedEstimateId, estimatesTable.id))
      .where(eq(prospectsTable.id, id));

    res.json({ paymentLinkUrl: url, paymentLinkId: linkId, depositAmount: amount, prospect: updated });
  } catch (err: unknown) {
    console.error("Stripe deposit link error:", err);
    const message = err instanceof Error ? err.message : "Failed to create deposit link";
    res.status(500).json({ error: message });
  }
});

export default router;
