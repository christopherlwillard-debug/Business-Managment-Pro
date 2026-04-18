import { Router, type IRouter, type Request, type Response, type RequestHandler } from "express";
import { getStripe, isStripeConfigured } from "../lib/stripe";
import { db, settingsTable } from "@workspace/db";

const router: IRouter = Router();

let cachedLocationId: string | null = null;

async function getOrCreateLocation(): Promise<string | null> {
  if (process.env["STRIPE_TERMINAL_LOCATION_ID"]) {
    return process.env["STRIPE_TERMINAL_LOCATION_ID"];
  }
  if (cachedLocationId) return cachedLocationId;

  if (!isStripeConfigured()) return null;

  try {
    const stripe = getStripe();
    const [settings] = await db
      .select({ companyName: settingsTable.companyName })
      .from(settingsTable)
      .limit(1);

    const loc = await stripe.terminal.locations.create({
      display_name: settings?.companyName || "BuildPro Location",
      address: {
        line1: "123 Main St",
        city: "Lexington",
        state: "KY",
        postal_code: "40502",
        country: "US",
      },
    });
    cachedLocationId = loc.id;
    return loc.id;
  } catch (err) {
    console.error("[terminal] Failed to create Stripe location:", err);
    return null;
  }
}

router.post(
  "/terminal/connection-token",
  async (_req: Request, res: Response) => {
    if (!isStripeConfigured()) {
      res.status(503).json({ error: "Stripe not configured" });
      return;
    }

    try {
      const stripe = getStripe();
      const [token, locationId] = await Promise.all([
        stripe.terminal.connectionTokens.create({}),
        getOrCreateLocation(),
      ]);

      res.json({ secret: token.secret, locationId });
    } catch (err) {
      console.error("[terminal] connection-token error:", err);
      res.status(500).json({ error: "Failed to create connection token" });
    }
  },
);

const handleCreatePaymentIntent: RequestHandler = async (req, res) => {
  if (!isStripeConfigured()) {
    res.status(503).json({ error: "Stripe not configured" });
    return;
  }

  const { amountCents, currency = "usd", description, invoiceId } = req.body as {
    amountCents: number;
    currency?: string;
    description?: string;
    invoiceId?: number;
  };

  if (!amountCents || amountCents < 50) {
    res.status(400).json({ error: "amountCents must be at least 50 (i.e. $0.50)" });
    return;
  }

  try {
    const stripe = getStripe();
    const pi = await stripe.paymentIntents.create({
      amount: amountCents,
      currency,
      payment_method_types: ["card_present"],
      capture_method: "automatic",
      description: description ?? undefined,
      metadata: {
        source: "terminal",
        ...(invoiceId ? { invoice_id: String(invoiceId) } : {}),
      },
    });

    res.json({ paymentIntentId: pi.id, clientSecret: pi.client_secret });
  } catch (err) {
    console.error("[terminal] payment-intent error:", err);
    res.status(500).json({ error: "Failed to create payment intent" });
  }
};

router.post("/terminal/payment-intent", handleCreatePaymentIntent);
router.post("/terminal/create-payment-intent", handleCreatePaymentIntent);

router.post(
  "/terminal/send-receipt",
  async (req: Request, res: Response) => {
    if (!isStripeConfigured()) {
      res.status(503).json({ error: "Stripe not configured" });
      return;
    }

    const { paymentIntentId, contact, type } = req.body as {
      paymentIntentId: string;
      contact: string;
      type: "email" | "sms";
    };

    if (!paymentIntentId || typeof paymentIntentId !== "string") {
      res.status(400).json({ error: "paymentIntentId is required" });
      return;
    }
    if (!contact || typeof contact !== "string") {
      res.status(400).json({ error: "contact is required" });
      return;
    }

    if (type === "sms") {
      res.status(422).json({
        error:
          "SMS receipts require Twilio integration. Please provide an email address instead.",
      });
      return;
    }

    try {
      const stripe = getStripe();
      await stripe.paymentIntents.update(paymentIntentId, {
        receipt_email: contact,
      });
      res.json({ ok: true, message: `Receipt will be sent to ${contact}` });
    } catch (err) {
      console.error("[terminal] send-receipt error:", err);
      res.status(500).json({ error: "Failed to send receipt" });
    }
  },
);

export default router;
