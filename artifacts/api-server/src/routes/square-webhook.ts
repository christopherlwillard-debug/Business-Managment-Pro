import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  invoicesTable, quickChargesTable, prospectsTable, estimatesTable,
  prospectEventsTable, otherIncomeTable, squarePaymentsTable, clientsTable,
  depositSubmissionsTable,
} from "@workspace/db/schema";
import { eq, and, ne, asc, ilike, or } from "drizzle-orm";
import { verifySquareWebhookSignature } from "../lib/square";

const router = Router();

async function handleSquarePayment(opts: {
  referenceId: string | null;
  squarePaymentId: string | null;
  amountMoney: number | null;
  customerId: string | null;
  buyerEmail: string | null;
  buyerName: string | null;
  paidAt: Date;
}) {
  const { referenceId, squarePaymentId, amountMoney, customerId, buyerEmail, buyerName, paidAt } = opts;

  const recognized =
    referenceId &&
    (referenceId.startsWith("inv_") ||
      referenceId.startsWith("quick_") ||
      referenceId.startsWith("prospect_") ||
      referenceId.startsWith("estimate_") ||
      referenceId.startsWith("website_deposit_"));

  if (referenceId?.startsWith("inv_")) {
    const invoiceId = parseInt(referenceId.slice(4));
    if (!isNaN(invoiceId)) {
      await db.update(invoicesTable)
        .set({ status: "paid", squarePaidAt: paidAt })
        .where(and(eq(invoicesTable.id, invoiceId), ne(invoicesTable.status, "cancelled")));
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

  if (referenceId?.startsWith("website_deposit_") && squarePaymentId && amountMoney !== null) {
    // referenceId format: "website_deposit_<slug>" (legacy) or "website_deposit_<slug>_<submissionId>"
    const afterPrefix = referenceId.slice(16);
    const lastUnderscore = afterPrefix.lastIndexOf("_");
    let siteSlug = afterPrefix;
    let submissionId: number | null = null;
    if (lastUnderscore !== -1) {
      const potentialId = parseInt(afterPrefix.slice(lastUnderscore + 1), 10);
      if (!isNaN(potentialId)) {
        submissionId = potentialId;
        siteSlug = afterPrefix.slice(0, lastUnderscore);
      }
    }
    const amountDollars = (amountMoney / 100).toFixed(2);
    const dateStr = paidAt.toISOString().split("T")[0];

    const inserted = await db.insert(squarePaymentsTable).values({
      squarePaymentId,
      amountCents: amountMoney,
      description: `Website Deposit — ${siteSlug}`,
      clientId: null,
      clientName: buyerName ?? null,
      paidAt,
    }).onConflictDoNothing().returning({ id: squarePaymentsTable.id });

    if (inserted.length === 0) {
      console.log(`Website deposit payment ${squarePaymentId} already recorded — skipping duplicate`);
      return;
    }

    await db.insert(otherIncomeTable).values({
      amount: amountDollars,
      date: dateStr,
      description: `Website Deposit — ${siteSlug}`,
      source: "website_deposit",
      paymentMethod: "card",
      clientId: null,
      businessLine: siteSlug,
    });

    console.log(`Website deposit payment ${squarePaymentId} recorded for site "${siteSlug}" — $${amountDollars}`);

    // Mark deposit submission paid (new format with submission ID in referenceId)
    if (submissionId !== null) {
      await db.update(depositSubmissionsTable)
        .set({ paymentStatus: "paid" })
        .where(eq(depositSubmissionsTable.id, submissionId));
      console.log(`Deposit submission ${submissionId} marked paid`);
    }

    // Try to link to an existing prospect by buyer email, then by name
    let matchedProspectId: number | null = null;
    if (buyerEmail) {
      const [prospect] = await db
        .select({ id: prospectsTable.id })
        .from(prospectsTable)
        .where(ilike(prospectsTable.contactEmail, buyerEmail.trim()))
        .limit(1);
      if (prospect) matchedProspectId = prospect.id;
    }
    if (matchedProspectId === null && buyerName) {
      const [prospect] = await db
        .select({ id: prospectsTable.id })
        .from(prospectsTable)
        .where(ilike(prospectsTable.contactName, buyerName.trim()))
        .limit(1);
      if (prospect) matchedProspectId = prospect.id;
    }
    if (matchedProspectId !== null) {
      await db.update(prospectsTable)
        .set({
          depositPaidAt: paidAt,
          ...(amountMoney !== null ? { depositPaidAmount: (amountMoney / 100).toFixed(2) } : {}),
          updatedAt: paidAt,
        })
        .where(eq(prospectsTable.id, matchedProspectId));
      await db.insert(prospectEventsTable).values({
        prospectId: matchedProspectId,
        type: "deposit_received",
        newValue: amountMoney !== null ? (amountMoney / 100).toFixed(2) : null,
      });
      console.log(`Website deposit ${squarePaymentId} auto-linked to prospect ${matchedProspectId}`);
    }
  }

  if (!recognized && squarePaymentId && amountMoney !== null) {
    // Try to match a client: Square customer ID → buyer email → client name
    let client: typeof clientsTable.$inferSelect | undefined;
    if (customerId) {
      [client] = await db.select().from(clientsTable).where(eq(clientsTable.squareCustomerId, customerId));
    }
    if (!client && buyerEmail) {
      const emailLower = buyerEmail.trim().toLowerCase();
      [client] = await db.select().from(clientsTable).where(ilike(clientsTable.email, emailLower));
    }
    if (!client && buyerName) {
      const nameLower = buyerName.trim();
      [client] = await db.select().from(clientsTable).where(ilike(clientsTable.name, nameLower));
    }

    const clientId = client?.id ?? null;

    const amountDollars = (amountMoney / 100).toFixed(2);
    const dateStr = paidAt.toISOString().split("T")[0];

    // Claim the payment before matching invoices. This makes retries and
    // concurrent webhook deliveries idempotent even when the first delivery
    // arrived before an invoice existed and was recorded as other income.
    const inserted = await db.insert(squarePaymentsTable).values({
      squarePaymentId,
      amountCents: amountMoney,
      description: "Square Payment",
      clientId: null,
      clientName: buyerName ?? null,
      paidAt,
    }).onConflictDoNothing().returning({ id: squarePaymentsTable.id });

    if (inserted.length === 0) {
      console.log(`Square payment ${squarePaymentId} already recorded — skipping duplicate`);
      return;
    }

    if (clientId) {
      const [openInvoice] = await db
        .select({ id: invoicesTable.id, invoiceNumber: invoicesTable.invoiceNumber, total: invoicesTable.total })
        .from(invoicesTable)
        .where(and(
          eq(invoicesTable.clientId, clientId),
          ne(invoicesTable.status, "paid"),
          ne(invoicesTable.status, "draft"),
          ne(invoicesTable.status, "cancelled"),
        ))
        .orderBy(asc(invoicesTable.issueDate))
        .limit(1);

      if (openInvoice) {
        await db.update(invoicesTable)
          .set({ status: "paid", squarePaidAt: paidAt })
          .where(and(eq(invoicesTable.id, openInvoice.id), ne(invoicesTable.status, "cancelled")));
        console.log(
          `Square Wix/Tap payment ${squarePaymentId} — matched to invoice #${openInvoice.invoiceNumber} for client ${client?.name ?? clientId} ($${amountDollars})`
        );
        return;
      }
    }

    await db.insert(otherIncomeTable).values({
      amount: amountDollars,
      date: dateStr,
      description: "Square Payment",
      source: "square_tap_to_pay",
      paymentMethod: "card",
      clientId,
      businessId: client?.businessId != null ? String(client.businessId) : null,
      businessLine: client?.businessLine ?? null,
    });

    console.log(
      `Square payment ${squarePaymentId} recorded as Other Income — $${amountDollars}` +
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
            buyer_email_address?: string;
            shipping_address?: { first_name?: string; last_name?: string };
            note?: string;
            amount_money?: { amount?: number };
            status?: string;
            created_at?: string;
          };
          order?: {
            id?: string;
            reference_id?: string;
            fulfillments?: Array<{ recipient?: { display_name?: string } }>;
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
      const buyerEmail = payment.buyer_email_address ?? null;
      const paidAt = payment.created_at ? new Date(payment.created_at) : new Date();

      // Extract buyer name from shipping address, fulfillment recipient, or payment note
      const order = body.data?.object?.order;
      const referenceId = order?.reference_id ?? null;
      const fulfillmentName = order?.fulfillments?.[0]?.recipient?.display_name ?? null;
      const shippingName = [payment.shipping_address?.first_name, payment.shipping_address?.last_name]
        .filter(Boolean).join(" ").trim() || null;
      const buyerName = fulfillmentName ?? shippingName;

      await handleSquarePayment({ referenceId, squarePaymentId, amountMoney, customerId, buyerEmail, buyerName, paidAt });
    }

    return res.json({ received: true });
  } catch (err: unknown) {
    console.error("Square webhook processing error:", err);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
});

export default router;
