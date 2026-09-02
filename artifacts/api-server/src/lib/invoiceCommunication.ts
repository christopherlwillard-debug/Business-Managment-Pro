import { and, eq, inArray, isNotNull } from "drizzle-orm";
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
  if (invoiceIds && invoiceIds.length === 0) return new Set();
  const conditions = [
    inArray(invoiceCommunicationEventsTable.eventType, ["initial_invoice", "resend_invoice"]),
    eq(invoiceCommunicationEventsTable.status, "accepted"),
    eq(invoiceCommunicationEventsTable.provider, "gmail"),
    isNotNull(invoiceCommunicationEventsTable.providerMessageId),
  ];
  if (invoiceIds) {
    conditions.push(inArray(invoiceCommunicationEventsTable.invoiceId, invoiceIds));
  }
  const rows = await db
    .select({ invoiceId: invoiceCommunicationEventsTable.invoiceId })
    .from(invoiceCommunicationEventsTable)
    .where(and(...conditions));
  return new Set(rows.map(row => row.invoiceId));
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