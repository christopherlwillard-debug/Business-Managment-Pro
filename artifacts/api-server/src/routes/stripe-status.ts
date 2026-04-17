import { Router } from "express";
import { isStripeConfigured, getStripe } from "../lib/stripe";

const router = Router();

router.get("/stripe/status", async (_req, res) => {
  if (!isStripeConfigured()) {
    return res.json({ connected: false, message: "STRIPE_SECRET_KEY not configured" });
  }
  try {
    const stripe = getStripe();
    const account = await stripe.accounts.retrieve();
    return res.json({
      connected: true,
      accountId: account.id,
      displayName: account.settings?.dashboard?.display_name ?? null,
      country: account.country ?? null,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Stripe API error";
    return res.json({ connected: false, message });
  }
});

export default router;
