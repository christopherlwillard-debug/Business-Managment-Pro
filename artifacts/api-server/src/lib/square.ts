import { SquareClient, SquareEnvironment } from "square";
import { randomUUID, createHmac } from "crypto";

let _client: SquareClient | null = null;

export function getSquareClient(): SquareClient {
  if (!_client) {
    const token = process.env["SQUARE_ACCESS_TOKEN"];
    if (!token) throw new Error("SQUARE_ACCESS_TOKEN is not configured");
    _client = new SquareClient({
      token,
      environment: SquareEnvironment.Production,
    });
  }
  return _client;
}

export function isSquareConfigured(): boolean {
  return !!process.env["SQUARE_ACCESS_TOKEN"] && !!process.env["SQUARE_LOCATION_ID"];
}

export function getLocationId(): string {
  const id = process.env["SQUARE_LOCATION_ID"];
  if (!id) throw new Error("SQUARE_LOCATION_ID is not configured");
  return id;
}

export async function createSquarePaymentLink(opts: {
  amountCents: number;
  currency: string;
  productName: string;
  referenceId?: string;
  note?: string;
  redirectUrl?: string;
  customerEmail?: string | null;
}): Promise<{ url: string; id: string; orderId: string | null }> {
  const client = getSquareClient();
  const locationId = getLocationId();

  const body = {
    idempotencyKey: randomUUID(),
    order: {
      locationId,
      referenceId: opts.referenceId,
      lineItems: [
        {
          name: opts.productName,
          quantity: "1",
          basePriceMoney: {
            amount: BigInt(opts.amountCents),
            currency: opts.currency.toUpperCase(),
          },
        },
      ],
    },
    checkoutOptions: {
      askForShippingAddress: false,
      redirectUrl: opts.redirectUrl,
    },
    prePopulatedData: opts.customerEmail
      ? { buyerEmail: opts.customerEmail }
      : undefined,
  };

  const result = await client.checkout.paymentLinks.create(body);

  if (!result.paymentLink?.url) {
    throw new Error("Square did not return a payment link URL");
  }

  return {
    url: result.paymentLink.url,
    id: result.paymentLink.id!,
    orderId: result.paymentLink.orderId ?? null,
  };
}

export async function deleteSquarePaymentLink(linkId: string): Promise<void> {
  const client = getSquareClient();
  await client.checkout.paymentLinks.delete({ id: linkId });
}

export function verifySquareWebhookSignature(opts: {
  signatureKey: string;
  notificationUrl: string;
  rawBody: string;
  headerSignature: string;
}): boolean {
  const computed = createHmac("sha256", opts.signatureKey)
    .update(opts.notificationUrl + opts.rawBody)
    .digest("base64");
  return computed === opts.headerSignature;
}
