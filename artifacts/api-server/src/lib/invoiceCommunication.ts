import { and, eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  invoiceCommunicationEventsTable,
  invoicesTable,
  type InvoiceCommunicationEvent,
} from "@workspace/db/schema";

export type InvoiceCommunicationStatus = "pending" | "accepted" | "failed" | "unknown";
export type InvoiceCommunicationType =
  | "initial_invoice"
  | "resend_invoice"
  | "manual_reminder"
  | "automatic_reminder"
  | "payment_link_email"
  | "payment_receipt";

export interface ProviderDeliveryResult {
  provider: string;
  messageId?: string | null;
  threadId?: string | null;
}

export interface InvoiceCommunicationContext {
  invoiceId: number;
  eventType: InvoiceCommunicationType;
  channel: string;
  provider: string;
  recipient?: string | null;
  subject?: string | null;
  source?: string;
  actorUserId?: string | null;
  actorName?: string | null;
  businessId?: number | null;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string | null;
}

export async function createPendingInvoiceCommunication(
  context: InvoiceCommunicationContext,
): Promise<InvoiceCommunicationEvent> {
  const [event] = await db.insert(invoiceCommunicationEventsTable).values({
    ...context,
    source: context.source ?? "user",
    status: "pending",
    metadata: context.metadata ?? {},
  }).returning();
  if (!event) throw new Error("Unable to create invoice communication event");
  return event;
}

export async function finalizeInvoiceCommunication(
  eventId: number,
  invoiceId: number,
  result: {
    status: Exclude<InvoiceCommunicationStatus, "pending">;
    provider?: string;
    providerMessageId?: string | null;
    providerThreadId?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  },
): Promise<InvoiceCommunicationEvent> {
  const [event] = await db.update(invoiceCommunicationEventsTable)
    .set({
      status: result.status,
      provider: result.provider ?? undefined,
      providerMessageId: result.providerMessageId ?? null,
      providerThreadId: result.providerThreadId ?? null,
      errorCode: result.errorCode ?? null,
      errorMessage: result.errorMessage ?? null,
      completedAt: new Date(),
    })
    .where(and(
      eq(invoiceCommunicationEventsTable.id, eventId),
      eq(invoiceCommunicationEventsTable.invoiceId, invoiceId),
    ))
    .returning();
  if (!event) throw new Error("Invoice communication event not found");
  return event;
}

export async function listInvoiceCommunications(invoiceId: number) {
  return db.select().from(invoiceCommunicationEventsTable)
    .where(eq(invoiceCommunicationEventsTable.invoiceId, invoiceId))
    .orderBy(invoiceCommunicationEventsTable.requestedAt);
}

export async function confirmedGmailInvoiceIds(invoiceIds?: number[]): Promise<Set<number>> {
  const deliveries = await confirmedGmailInvoiceDeliveries(invoiceIds);
  return new Set(deliveries.keys());
}

export interface ConfirmedGmailInvoiceDelivery {
  invoiceId: number;
  completedAt: Date | string | null;
}

function isConfirmedGmailInvoiceEvent(row: {
  invoiceId: number;
  eventType: string;
  status: string;
  provider: string | null;
  providerMessageId: string | null;
}): boolean {
  return (row.eventType === "initial_invoice" || row.eventType === "resend_invoice")
    && row.status === "accepted"
    && row.provider === "gmail"
    && Boolean(row.providerMessageId);
}

/**
 * Return the latest verified Gmail delivery for each invoice.
 *
 * Provider acceptance alone is not enough: the event must have a Gmail
 * provider message ID, which is only recorded after the browser verifies the
 * message in Gmail's Sent folder.
 */
export async function confirmedGmailInvoiceDeliveries(invoiceIds?: number[]): Promise<Map<number, ConfirmedGmailInvoiceDelivery>> {
  if (invoiceIds && invoiceIds.length === 0) return new Map();
  const query = db
    .select({
      invoiceId: invoiceCommunicationEventsTable.invoiceId,
      eventType: invoiceCommunicationEventsTable.eventType,
      status: invoiceCommunicationEventsTable.status,
      provider: invoiceCommunicationEventsTable.provider,
      providerMessageId: invoiceCommunicationEventsTable.providerMessageId,
      completedAt: invoiceCommunicationEventsTable.completedAt,
    })
    .from(invoiceCommunicationEventsTable);
  const rows = invoiceIds
    ? await query.where(inArray(invoiceCommunicationEventsTable.invoiceId, invoiceIds))
    : await query;

  const deliveries = new Map<number, ConfirmedGmailInvoiceDelivery>();
  rows
    .filter(isConfirmedGmailInvoiceEvent)
    .sort((left, right) => {
      const leftTime = left.completedAt ? new Date(left.completedAt).getTime() : 0;
      const rightTime = right.completedAt ? new Date(right.completedAt).getTime() : 0;
      return rightTime - leftTime;
    })
    .forEach(row => {
      if (!deliveries.has(row.invoiceId)) {
        deliveries.set(row.invoiceId, {
          invoiceId: row.invoiceId,
          completedAt: row.completedAt,
        });
      }
    });
  return deliveries;
}

export async function reconcileConfirmedGmailInvoiceDelivery(
  invoice: { id: number; status: string },
): Promise<{ status: "sent"; sentAt: Date; sentMethod: "gmail" } | null> {
  if (invoice.status !== "approved") return null;
  const [delivery] = [...(await confirmedGmailInvoiceDeliveries([invoice.id])).values()];
  if (!delivery) return null;

  const sentAt = delivery.completedAt ? new Date(delivery.completedAt) : new Date();
  const compatibilityFields = { status: "sent" as const, sentAt, sentMethod: "gmail" as const };
  await db.update(invoicesTable)
    .set(compatibilityFields)
    .where(and(
      eq(invoicesTable.id, invoice.id),
      eq(invoicesTable.status, "approved"),
    ));
  return compatibilityFields;
}

export async function reconcileConfirmedGmailInvoiceDeliveries(
  invoices: Array<{ id: number; status: string }>,
): Promise<Map<number, { status: "sent"; sentAt: Date; sentMethod: "gmail" }>> {
  const candidates = invoices.filter(invoice => invoice.status === "approved");
  if (candidates.length === 0) return new Map();

  const deliveries = await confirmedGmailInvoiceDeliveries(candidates.map(invoice => invoice.id));
  const reconciled = new Map<number, { status: "sent"; sentAt: Date; sentMethod: "gmail" }>();
  await Promise.all(candidates.map(async invoice => {
    const delivery = deliveries.get(invoice.id);
    if (!delivery) return;
    const sentAt = delivery.completedAt ? new Date(delivery.completedAt) : new Date();
    const compatibilityFields = { status: "sent" as const, sentAt, sentMethod: "gmail" as const };
    await db.update(invoicesTable)
      .set(compatibilityFields)
      .where(and(
        eq(invoicesTable.id, invoice.id),
        eq(invoicesTable.status, "approved"),
      ));
    reconciled.set(invoice.id, compatibilityFields);
  }));
  return reconciled;
}

function normalizedEmail(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim().toLowerCase();
}

export async function verifyGmailSentMessage(input: {
  accessToken: string;
  messageId: string;
  deliveryId: string;
  recipient: string;
  subject: string;
}): Promise<boolean> {
  const { accessToken, messageId, deliveryId, recipient, subject } = input;
  if (![accessToken, messageId, deliveryId, recipient, subject].every(value => value.trim())) return false;
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=metadata&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=X-BuildPro-Delivery-ID&fields=id,labelIds,payload/headers`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) return false;
  const message = await response.json().catch(() => null) as {
    id?: string;
    labelIds?: string[];
    payload?: { headers?: Array<{ name?: string; value?: string }> };
  } | null;
  const headers = new Map(
    (message?.payload?.headers ?? []).map(header => [header.name?.toLowerCase() ?? "", header.value ?? ""]),
  );
  return message?.id === messageId
    && Array.isArray(message.labelIds)
    && message.labelIds.includes("SENT")
    && headers.get("x-buildpro-delivery-id") === deliveryId
    && normalizedEmail(headers.get("to") ?? "") === normalizedEmail(recipient)
    && (headers.get("subject") ?? "").trim() === subject.trim();
}

export async function sendAndRecordInvoiceCommunication<T extends ProviderDeliveryResult>(
  context: InvoiceCommunicationContext,
  send: () => Promise<T>,
): Promise<{ event: InvoiceCommunicationEvent; delivery: T; finalized: boolean; finalizationError?: string }> {
  const pending = await createPendingInvoiceCommunication(context);
  let delivery: T;
  try {
    delivery = await send();
  } catch (error) {
    try {
      await finalizeInvoiceCommunication(pending.id, context.invoiceId, {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    } catch (finalizeError) {
      console.error("[invoice-communications] Could not finalize failed event:", finalizeError);
    }
    throw error;
  }

  try {
    const event = await finalizeInvoiceCommunication(pending.id, context.invoiceId, {
      status: "accepted",
      provider: delivery.provider,
      providerMessageId: delivery.messageId,
      providerThreadId: delivery.threadId,
    });
    return { event, delivery, finalized: true };
  } catch (error) {
    return {
      event: pending,
      delivery,
      finalized: false,
      finalizationError: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function markInvoiceCommunicationAccepted(
  invoiceId: number,
  eventType: InvoiceCommunicationType,
  channel: string,
  provider: string,
  actor: { id?: string | null; name?: string | null },
) {
  const pending = await createPendingInvoiceCommunication({
    invoiceId,
    eventType,
    channel,
    provider,
    source: "user",
    actorUserId: actor.id,
    actorName: actor.name,
  });
  return finalizeInvoiceCommunication(pending.id, invoiceId, { status: "accepted", provider });
}

export async function updateCompatibilitySentFields(
  invoiceId: number,
  sentMethod: string,
) {
  // Only the first confirmed delivery moves Approved → Sent. Replays are
  // intentionally no-ops so they cannot rewrite sentAt or regress an invoice
  // that has already advanced to overdue, partially paid, or paid.
  await db.update(invoicesTable)
    .set({ status: "sent", sentAt: new Date(), sentMethod })
    .where(and(
      eq(invoicesTable.id, invoiceId),
      eq(invoicesTable.status, "approved"),
    ));
}