import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env["STRIPE_SECRET_KEY"];
    if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
    _stripe = new Stripe(key, { apiVersion: "2026-03-25.dahlia" });
  }
  return _stripe;
}

export function isStripeConfigured(): boolean {
  return !!process.env["STRIPE_SECRET_KEY"];
}

export async function createPaymentIntent(opts: {
  amountCents: number;
  currency: string;
  description: string;
  metadata: Record<string, string>;
}): Promise<{ id: string; clientSecret: string }> {
  const stripe = getStripe();
  const pi = await stripe.paymentIntents.create({
    amount: opts.amountCents,
    currency: opts.currency.toLowerCase(),
    description: opts.description,
    metadata: opts.metadata,
    automatic_payment_methods: { enabled: true },
  });
  if (!pi.client_secret) throw new Error("Stripe did not return a client_secret");
  return { id: pi.id, clientSecret: pi.client_secret };
}

export async function createPaymentLink(opts: {
  amountCents: number;
  currency: string;
  productName: string;
  metadata: Record<string, string>;
  customerEmail?: string | null;
}): Promise<{ url: string; id: string; priceId: string }> {
  const stripe = getStripe();

  const product = await stripe.products.create({
    name: opts.productName,
    metadata: opts.metadata,
  });

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: opts.amountCents,
    currency: opts.currency.toLowerCase(),
  });

  const link = await stripe.paymentLinks.create({
    line_items: [{ price: price.id, quantity: 1 }],
    metadata: opts.metadata,
    payment_intent_data: { metadata: opts.metadata },
    customer_creation: "always",
    phone_number_collection: { enabled: true },
    billing_address_collection: "required",
    after_completion: { type: "hosted_confirmation", hosted_confirmation: { custom_message: "Payment received! Thank you for your business." } },
  });

  return { url: link.url, id: link.id, priceId: price.id };
}
