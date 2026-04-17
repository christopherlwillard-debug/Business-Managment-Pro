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
    ...(opts.customerEmail ? { customer_creation: "always" } : {}),
    after_completion: { type: "hosted_confirmation", hosted_confirmation: { custom_message: "Payment received! Thank you for your business." } },
  });

  return { url: link.url, id: link.id, priceId: price.id };
}
