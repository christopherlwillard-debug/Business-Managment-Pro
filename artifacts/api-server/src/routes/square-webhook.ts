import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  invoicesTable, quickChargesTable, prospectsTable, estimatesTable,
  prospectEventsTable, otherIncomeTable, squarePaymentsTable, clientsTable,
  depositSubmissionsTable, businessesTable,
} from "@workspace/db/schema";
import { eq, and, ne, asc, ilike, or } from "drizzle-orm";
import { verifySquareWebhookSignature } from "../lib/square";

const router = Router();

async function resolveWebhookBusinessId(
  candidateId?: number | null,
  candidateSlug?: string | null,
  executor: any = db,
): Promise<number> {
  if (candidateId != null) {
    const [row] = await executor.select({ id: businessesTable.id }).from(businessesTable)
      .where(eq(businessesTable.id, candidateId)).limit(1);
    if (row) return row.id;
  }
  if (candidateSlug) {
    const [row] = await executor.select({ id: businessesTable.id }).from(businessesTable)
      .where(eq(businessesTable.slug, candidateSlug)).limit(1);
    if (row) return row.id;
  }
  const [fallback] = await executor.select({ id: businessesTable.id }).from(businessesTable)
    .where(eq(businessesTable.slug, "general_contracting")).limit(1);
  if (!fallback) throw new Error("General Contracting business is not configured");
  return fallback.id;
}

/** Apply a Square receipt to the existing invoice aggregate using integer cents. */
export function calculateSquareInvoicePayment(
  invoiceTotal: string | number | null,
  amountAlreadyPaid: string | number | null,
  paymentAmountCents: number,
): { amountPaid: string; status: "partial" | "paid" } | null {
  const totalCents = Math.round(Number(invoiceTotal) * 100);
  const paidCents = Math.round(Number(amountAlreadyPaid ?? 0) * 100);
  if (
    !Number.isSafeInteger(totalCents) || totalCents <= 0 ||
    !Number.isSafeInteger(paidCents) || paidCents < 0 ||
    !Number.isSafeInteger(paymentAmountCents) || paymentAmountCents <= 0
  ) return null;

  // Cap invoice allocation at the invoice total. Any excess remains visible
  // in the Square payment mirror for reconciliation, not invoice revenue.
  const nextPaidCents = Math.min(totalCents, paidCents + paymentAmountCents);
  return {
    amountPaid: (nextPaidCents / 100).toFixed(2),
    status: nextPaidCents >= totalCents ? "paid" : "partial",
  };
}

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
  if (squarePaymentId && amountMoney !== null && (!Number.isSafeInteger(amountMoney) || amountMoney <= 0)) {
    throw new Error("Square payment amount must be a positive integer number of cents");
  }

  await db.transaction(async (tx) => {

  const recognized =
    referenceId &&
    (referenceId.startsWith("inv_") ||
      referenceId.startsWith("quick_") ||
      referenceId.startsWith("prospect_") ||
      referenceId.startsWith("estimate_") ||
      referenceId.startsWith("website_deposit_"));

  if (referenceId?.startsWith("inv_") && squarePaymentId && amountMoney !== null) {
    const invoiceId = Number.parseInt(referenceId.slice(4), 10);
    if (Number.isSafeInteger(invoiceId) && invoiceId > 0) {
      const [invoice] = await tx.select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        clientId: invoicesTable.clientId,
        total: invoicesTable.total,
        amountPaid: invoicesTable.amountPaid,
        status: invoicesTable.status,
        businessId: invoicesTable.businessId,
        businessLine: invoicesTable.businessLine,
      }).from(invoicesTable).where(eq(invoicesTable.id, invoiceId)).limit(1);

      if (invoice && invoice.status !== "cancelled") {
        const businessId = await resolveWebhookBusinessId(invoice.businessId, invoice.businessLine, tx);
        const inserted = await tx.insert(squarePaymentsTable).values({
          squarePaymentId,
          amountCents: amountMoney,
          businessId,
          description: `Square Invoice Payment — ${invoice.invoiceNumber ?? invoiceId}`,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          clientId: invoice.clientId,
          clientName: null,
          paidAt,
        }).onConflictDoNothing().returning({ id: squarePaymentsTable.id });

        if (inserted.length === 0) {
          console.log(`Square invoice payment ${squarePaymentId} already recorded — skipping duplicate`);
          return;
        }

        const allocation = invoice.status === "paid"
          ? null
          : calculateSquareInvoicePayment(invoice.total, invoice.amountPaid, amountMoney);
        if (allocation) {
          await tx.update(invoicesTable)
            .set({
              status: allocation.status,
              amountPaid: allocation.amountPaid,
              ...(allocation.status === "paid" ? { squarePaidAt: paidAt } : {}),
            })
            .where(and(eq(invoicesTable.id, invoiceId), ne(invoicesTable.status, "cancelled")));
          console.log(`Invoice ${invoiceId} received Square payment ${squarePaymentId}; status is ${allocation.status}`);
        }
      }
    }
  }

  // These reference-based flows also need a unique provider-payment claim:
  // prospect deposits append an event, so duplicate Square deliveries must not
  // create duplicate deposit history.
  if (
    referenceId &&
    squarePaymentId &&
    amountMoney !== null &&
    (referenceId.startsWith("quick_") || referenceId.startsWith("prospect_") || referenceId.startsWith("estimate_"))
  ) {
    let ownerId: number | null = null;
    let ownerSlug: string | null = null;
    let clientId: number | null = null;
    let clientName: string | null = buyerName;
    let description = "Square Reference Payment";
    let targetExists = false;

    if (referenceId.startsWith("quick_")) {
      const chargeId = Number.parseInt(referenceId.slice(6), 10);
      if (Number.isSafeInteger(chargeId) && chargeId > 0) {
        const [charge] = await tx.select({
          id: quickChargesTable.id,
          customerName: quickChargesTable.customerName,
        }).from(quickChargesTable).where(eq(quickChargesTable.id, chargeId)).limit(1);
        if (charge) {
          targetExists = true;
          clientName = charge.customerName ?? buyerName;
          description = `Square Quick Charge — ${chargeId}`;
        }
      }
    } else if (referenceId.startsWith("prospect_")) {
      const prospectId = Number.parseInt(referenceId.slice(9), 10);
      if (Number.isSafeInteger(prospectId) && prospectId > 0) {
        const [prospect] = await tx.select({
          id: prospectsTable.id,
          businessId: prospectsTable.businessId,
          businessLine: prospectsTable.businessLine,
          clientId: prospectsTable.clientId,
          contactName: prospectsTable.contactName,
        }).from(prospectsTable).where(eq(prospectsTable.id, prospectId)).limit(1);
        if (prospect) {
          targetExists = true;
          ownerId = prospect.businessId;
          ownerSlug = prospect.businessLine;
          clientId = prospect.clientId;
          clientName = prospect.contactName ?? buyerName;
          description = `Square Prospect Deposit — ${prospectId}`;
        }
      }
    } else {
      const estimateId = Number.parseInt(referenceId.slice(9), 10);
      if (Number.isSafeInteger(estimateId) && estimateId > 0) {
        const [estimate] = await tx.select({
          id: estimatesTable.id,
          businessId: estimatesTable.businessId,
          businessLine: estimatesTable.businessLine,
          clientId: estimatesTable.clientId,
          title: estimatesTable.title,
        }).from(estimatesTable).where(eq(estimatesTable.id, estimateId)).limit(1);
        if (estimate) {
          targetExists = true;
          ownerId = estimate.businessId;
          ownerSlug = estimate.businessLine;
          clientId = estimate.clientId;
          clientName = estimate.title;
          description = `Square Estimate Deposit — ${estimateId}`;
        }
      }
    }

    if (targetExists) {
      const businessId = await resolveWebhookBusinessId(ownerId, ownerSlug, tx);
      const inserted = await tx.insert(squarePaymentsTable).values({
        squarePaymentId,
        amountCents: amountMoney,
        businessId,
        description,
        clientId,
        clientName: clientName ?? null,
        paidAt,
      }).onConflictDoNothing().returning({ id: squarePaymentsTable.id });

      if (inserted.length === 0) {
        console.log(`Square reference payment ${squarePaymentId} already recorded — skipping duplicate`);
        return;
      }
    }
  }

  if (referenceId?.startsWith("quick_")) {
    const chargeId = parseInt(referenceId.slice(6));
    if (!isNaN(chargeId)) {
      await tx.update(quickChargesTable)
        .set({ status: "paid", paidAt })
        .where(eq(quickChargesTable.id, chargeId));
      console.log(`Quick charge ${chargeId} marked paid via Square`);
    }
  }

  if (referenceId?.startsWith("prospect_")) {
    const prospectId = parseInt(referenceId.slice(9));
    if (!isNaN(prospectId)) {
      await tx.update(prospectsTable)
        .set({
          depositPaidAt: paidAt,
          ...(amountMoney !== null ? { depositPaidAmount: (amountMoney / 100).toFixed(2) } : {}),
          updatedAt: paidAt,
        })
        .where(eq(prospectsTable.id, prospectId));
      await tx.insert(prospectEventsTable).values({
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
      await tx.update(estimatesTable)
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
    const businessId = await resolveWebhookBusinessId(null, siteSlug, tx);

    const inserted = await tx.insert(squarePaymentsTable).values({
      squarePaymentId,
      amountCents: amountMoney,
      businessId,
      description: `Website Deposit — ${siteSlug}`,
      clientId: null,
      clientName: buyerName ?? null,
      paidAt,
    }).onConflictDoNothing().returning({ id: squarePaymentsTable.id });

    if (inserted.length === 0) {
      console.log(`Website deposit payment ${squarePaymentId} already recorded — skipping duplicate`);
      return;
    }

    await tx.insert(otherIncomeTable).values({
      amount: amountDollars,
      date: dateStr,
      description: `Website Deposit — ${siteSlug}`,
      source: "website_deposit",
      paymentMethod: "card",
      clientId: null,
      businessId: String(businessId),
      businessLine: siteSlug,
    });

    console.log(`Website deposit payment ${squarePaymentId} recorded for site "${siteSlug}" — $${amountDollars}`);

    // Mark deposit submission paid (new format with submission ID in referenceId)
    if (submissionId !== null) {
      await tx.update(depositSubmissionsTable)
        .set({ paymentStatus: "paid" })
        .where(eq(depositSubmissionsTable.id, submissionId));
      console.log(`Deposit submission ${submissionId} marked paid`);
    }

    // Try to link to an existing prospect by buyer email, then by name
    let matchedProspectId: number | null = null;
    if (buyerEmail) {
      const [prospect] = await tx
        .select({ id: prospectsTable.id })
        .from(prospectsTable)
        .where(ilike(prospectsTable.contactEmail, buyerEmail.trim()))
        .limit(1);
      if (prospect) matchedProspectId = prospect.id;
    }
    if (matchedProspectId === null && buyerName) {
      const [prospect] = await tx
        .select({ id: prospectsTable.id })
        .from(prospectsTable)
        .where(ilike(prospectsTable.contactName, buyerName.trim()))
        .limit(1);
      if (prospect) matchedProspectId = prospect.id;
    }
    if (matchedProspectId !== null) {
      await tx.update(prospectsTable)
        .set({
          depositPaidAt: paidAt,
          ...(amountMoney !== null ? { depositPaidAmount: (amountMoney / 100).toFixed(2) } : {}),
          updatedAt: paidAt,
        })
        .where(eq(prospectsTable.id, matchedProspectId));
      await tx.insert(prospectEventsTable).values({
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
      [client] = await tx.select().from(clientsTable).where(eq(clientsTable.squareCustomerId, customerId));
    }
    if (!client && buyerEmail) {
      const emailLower = buyerEmail.trim().toLowerCase();
      [client] = await tx.select().from(clientsTable).where(ilike(clientsTable.email, emailLower));
    }
    if (!client && buyerName) {
      const nameLower = buyerName.trim();
      [client] = await tx.select().from(clientsTable).where(ilike(clientsTable.name, nameLower));
    }

    const clientId = client?.id ?? null;
    const businessId = await resolveWebhookBusinessId(client?.businessId, client?.businessLine, tx);

    const amountDollars = (amountMoney / 100).toFixed(2);
    const dateStr = paidAt.toISOString().split("T")[0];

    let openInvoice: {
      id: number;
      invoiceNumber: string | null;
      total: string;
      amountPaid: string | null;
      businessId: number | null;
      businessLine: string | null;
    } | undefined;

    if (clientId) {
      [openInvoice] = await tx
        .select({
          id: invoicesTable.id,
          invoiceNumber: invoicesTable.invoiceNumber,
          total: invoicesTable.total,
          amountPaid: invoicesTable.amountPaid,
          businessId: invoicesTable.businessId,
          businessLine: invoicesTable.businessLine,
        })
        .from(invoicesTable)
        .where(and(
          eq(invoicesTable.clientId, clientId),
          ne(invoicesTable.status, "paid"),
          ne(invoicesTable.status, "draft"),
          ne(invoicesTable.status, "cancelled"),
        ))
        .orderBy(asc(invoicesTable.issueDate))
        .limit(1);
    }

    const paymentBusinessId = openInvoice
      ? await resolveWebhookBusinessId(openInvoice.businessId, openInvoice.businessLine, tx)
      : businessId;
    const inserted = await tx.insert(squarePaymentsTable).values({
      squarePaymentId,
      amountCents: amountMoney,
      businessId: paymentBusinessId,
      description: openInvoice ? `Square Invoice Payment — ${openInvoice.invoiceNumber ?? openInvoice.id}` : "Square Payment",
      invoiceId: openInvoice?.id ?? null,
      invoiceNumber: openInvoice?.invoiceNumber ?? null,
      clientId,
      clientName: buyerName ?? client?.name ?? null,
      paidAt,
    }).onConflictDoNothing().returning({ id: squarePaymentsTable.id });

    if (inserted.length === 0) {
      console.log(`Square payment ${squarePaymentId} already recorded — skipping duplicate`);
      return;
    }

    if (openInvoice) {
      const allocation = calculateSquareInvoicePayment(openInvoice.total, openInvoice.amountPaid, amountMoney);
      if (allocation) {
        await tx.update(invoicesTable)
          .set({
            status: allocation.status,
            amountPaid: allocation.amountPaid,
            ...(allocation.status === "paid" ? { squarePaidAt: paidAt } : {}),
          })
          .where(and(eq(invoicesTable.id, openInvoice.id), ne(invoicesTable.status, "cancelled")));
      }
      console.log(
        `Square Wix/Tap payment ${squarePaymentId} — matched to invoice #${openInvoice.invoiceNumber} for client ${client?.name ?? clientId} ($${amountDollars}); status is ${allocation?.status ?? "unchanged"}`
      );
      return;
    }

    await tx.insert(otherIncomeTable).values({
      amount: amountDollars,
      date: dateStr,
      description: "Square Payment",
      source: "square_tap_to_pay",
      paymentMethod: "card",
      clientId,
      businessId: String(businessId),
      businessLine: client?.businessLine ?? "general_contracting",
    });

    console.log(
      `Square payment ${squarePaymentId} recorded as Other Income — $${amountDollars}` +
        (client ? ` for client ${client.name}` : " (unmatched customer)")
    );
  }
  });
}

router.post("/", async (req: Request, res: Response) => {
  const signatureKey = process.env["SQUARE_WEBHOOK_SIGNATURE_KEY"];
  const headerSig = req.headers["x-square-hmacsha256-signature"] as string | undefined;
  const rawBody = (req as Request & { rawBody?: string }).rawBody;

  if (!signatureKey) {
    console.error("Square webhook signature verification is not configured");
    return res.status(503).json({ error: "Square webhook signature verification is not configured" });
  }
  if (!headerSig) {
    return res.status(401).json({ error: "Missing Square webhook signature" });
  }
  if (typeof rawBody !== "string") {
    return res.status(400).json({ error: "Raw Square webhook body is unavailable for signature verification" });
  }

  const protocol = req.headers["x-forwarded-proto"] ?? req.protocol;
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  const notificationUrl = `${protocol}://${host}${req.originalUrl}`;

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
