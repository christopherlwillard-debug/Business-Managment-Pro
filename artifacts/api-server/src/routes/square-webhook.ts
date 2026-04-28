import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  invoicesTable, quickChargesTable, prospectsTable, estimatesTable,
  prospectEventsTable, otherIncomeTable, squarePaymentsTable, clientsTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { verifySquareWebhookSignature } from "../lib/square";

const router = Router();

async function handleSquarePayment(opts: {
  referenceId: string | null;
  squarePaymentId: string | null;
  amountMoney: number | null;
  customerId: string | null;
  paidAt: Date;
}) {
  const { referenceId, squarePaymentId, amountMoney, customerId, paidAt } = opts;

  const recognized =
    referenceId &&
    (referenceId.startsWith("inv_") ||
      referenceId.startsWith("quick_") ||
      referenceId.startsWith("prospect_") ||
      referenceId.startsWith("estimate_"));

  if (referenceId?.startsWith("inv_")) {
    const invoiceId = parseInt(referenceId.slice(4));
    if (!isNaN(invoiceId)) {
      await db.update(invoicesTable)
        .set({ status: "paid", squarePaidAt: paidAt })
        .where(eq(invoicesTable.id, invoiceId));
      console.log(`Invoice ${invoiceId} marked paid via Square (payment ${squarePaymentId})`);
    }
  }

  if (referenceId?.startsWith("quick_")) {
    const chargeId = parseInt(referenceId.slice(6));
    if (!isNaN(chargeId)) {
      await db.update(quickChargesTable)
        .set({ status: "paid", paidAt })
        .where(eq(quickChargesTable.id, chargeId));
      console.log(`Quick charge ${chargeId} marked paid via Square`);
    }
  }

  if (referenceId?.startsWith("prospect_")) {
    const prospectId = parseInt(referenceId.slice(9));
    if (!isNaN(prospectId)) {
      await db.update(prospectsTable)
        .set({
          depositPaidAt: paidAt,
          ...(amountMoney !== null ? { depositPaidAmount: (amountMoney / 100).toFixed(2) } : {}),
          updatedAt: paidAt,
        })
        .where(eq(prospectsTable.id, prospectId));
      await db.insert(prospectEventsTable).values({
        prospectId,
        type: "deposit_received",
        newValue: amountMoney !== null ? (amountMoney / 100).toFixed(2) : null,
      });
      console.log(`Prospect ${prospectId} deposit paid via Square`);
    }
  }

  if (referenceId?.startsWith("estimate_")) {
    const estimateId = parseInt(referenceId.slice(9));
    if (!isNaN(estimateId)) {
      await db.update(estimatesTable)
        .set({
          depositPaidAt: paidAt,
          ...(amountMoney !== null ? { depositPaidAmount: (amountMoney / 100).toFixed(2) } : {}),
        })
        .where(eq(estimatesTable.id, estimateId));
      console.log(`Estimate ${estimateId} deposit paid via Square`);
    }
  }

  if (!recognized && customerId && squarePaymentId && amountMoney !== null) {
    const [client] = await db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.squareCustomerId, customerId));

    const clientId = client?.id ?? null;

    const existing = await db
      .select({ id: squarePaymentsTable.id })
      .from(squarePaymentsTable)
      .where(eq(squarePaymentsTable.squarePaymentId, squarePaymentId));

    if (existing.length > 0) {
      console.log(`Square Tap to Pay ${squarePaymentId} already recorded — skipping duplicate`);
      return;
    }

    const amountDollars = (amountMoney / 100).toFixed(2);
    const dateStr = paidAt.toISOString().split("T")[0];

    await Promise.all([
      db.insert(squarePaymentsTable).values({
        squarePaymentId,
        amountCents: amountMoney,
        description: "Square Tap to Pay",
        clientId,
        clientName: client?.name ?? null,
        paidAt,
      }),
      db.insert(otherIncomeTable).values({
        amount: amountDollars,
        date: dateStr,
        description: "Square Tap to Pay",
        source: "square_tap_to_pay",
        paymentMethod: "card",
        clientId,
        businessLine: client?.businessLine ?? null,
      }),
    ]);

    console.log(
      `Tap to Pay ${squarePaymentId} recorded — $${amountDollars}` +
        (client ? ` for client ${client.name}` : " (unmatched customer)")
    );
  }
}

router.post("/", async (req: Request, res: Response) => {
  const signatureKey = process.env["SQUARE_WEBHOOK_SIGNATURE_KEY"];
  const headerSig = req.headers["x-square-hmacsha256-signature"] as string | undefined;

  if (signatureKey && headerSig) {
    const protocol = req.headers["x-forwarded-proto"] ?? req.protocol;
    const host = req.headers["x-forwarded-host"] ?? req.headers.host;
    const notificationUrl = `${protocol}://${host}${req.originalUrl}`;
    const rawBody = JSON.stringify(req.body);

    const valid = verifySquareWebhookSignature({
      signatureKey,
      notificationUrl,
      rawBody,
      headerSignature: headerSig,
    });

    if (!valid) {
      console.error("Square webhook signature verification failed");
      return res.status(400).json({ error: "Invalid webhook signature" });
    }
  } else {
    console.warn("Square webhook signature key not set or signature header missing — skipping verification");
  }

  try {
    const body = req.body as {
      type?: string;
      data?: {
        object?: {
          payment?: {
            id?: string;
            order_id?: string;
            customer_id?: string;
            amount_money?: { amount?: number };
            status?: string;
            created_at?: string;
          };
          order?: {
            id?: string;
            reference_id?: string;
            line_items?: Array<{ name?: string }>;
          };
        };
      };
    };

    if (body.type === "payment.completed" || body.type === "payment.updated") {
      const payment = body.data?.object?.payment;
      if (!payment || payment.status !== "COMPLETED") {
        return res.json({ received: true });
      }

      const squarePaymentId = payment.id ?? null;
      const amountMoney = payment.amount_money?.amount ?? null;
      const customerId = payment.customer_id ?? null;
      const paidAt = payment.created_at ? new Date(payment.created_at) : new Date();

      const order = body.data?.object?.order;
      const referenceId = order?.reference_id ?? null;

      await handleSquarePayment({ referenceId, squarePaymentId, amountMoney, customerId, paidAt });
    }

    return res.json({ received: true });
  } catch (err: unknown) {
    console.error("Square webhook processing error:", err);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
});

export default router;
