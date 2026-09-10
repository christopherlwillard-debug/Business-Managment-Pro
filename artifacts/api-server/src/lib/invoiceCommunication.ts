import { and, eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  invoiceCommunicationEventsTable,
  invoicesTable,
  type InvoiceCommunicationEvent,
} from "@workspace/db/schema";

export type InvoiceCommunicationStatus = "pending" | "accepted" | "failed" | "unknown";

export class InvoiceCommunicationConflictError extends Error {
  constructor() {
    super("Invoice communication is no longer pending");
    this.name = "InvoiceCommunicationConflictError";
  }
}
export class GmailAuthenticationError extends Error {
  constructor() {
    super("The Gmail connection is invalid or expired. Reconnect Gmail and retry this delivery verification.");
    this.name = "GmailAuthenticationError";
  }
}
export class GmailMetadataPermissionError extends Error {
  constructor() {
    super("Gmail metadata permission is required to verify this delivery.");
    this.name = "GmailMetadataPermissionError";
  }
}
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
    metadata?: Record<string, unknown>;
  },
  expectedStatus?: InvoiceCommunicationStatus,
): Promise<InvoiceCommunicationEvent> {
  const [event] = await db.update(invoiceCommunicationEventsTable)
    .set({
      status: result.status,
      provider: result.provider ?? undefined,
      providerMessageId: result.providerMessageId ?? null,
      providerThreadId: result.providerThreadId ?? null,
      errorCode: result.errorCode ?? null,
      errorMessage: result.errorMessage ?? null,
      metadata: result.metadata,
      completedAt: new Date(),
    })
    .where(and(
      eq(invoiceCommunicationEventsTable.id, eventId),
      eq(invoiceCommunicationEventsTable.invoiceId, invoiceId),
      ...(expectedStatus ? [eq(invoiceCommunicationEventsTable.status, expectedStatus)] : []),
    ))
    .returning();
  if (!event && expectedStatus) throw new InvoiceCommunicationConflictError();
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

export async function gmailRepairRequiredInvoiceIds(
  invoices: Array<{ id: number; status: string; acceptedAt?: Date | string | null }>,
): Promise<Set<number>> {
  const candidates = invoices.filter(invoice =>
    ["approved", "sent", "overdue", "partiallyPaid"].includes(invoice.status),
  );
  if (candidates.length === 0) return new Set();

  const acceptedAtByInvoiceId = new Map(
    candidates.map(invoice => [
      invoice.id,
      invoice.acceptedAt ? new Date(invoice.acceptedAt).getTime() : 0,
    ]),
  );
  const rows = await db
    .select({
      invoiceId: invoiceCommunicationEventsTable.invoiceId,
      eventType: invoiceCommunicationEventsTable.eventType,
      status: invoiceCommunicationEventsTable.status,
      provider: invoiceCommunicationEventsTable.provider,
      providerMessageId: invoiceCommunicationEventsTable.providerMessageId,
      metadata: invoiceCommunicationEventsTable.metadata,
      requestedAt: invoiceCommunicationEventsTable.requestedAt,
    })
    .from(invoiceCommunicationEventsTable)
    .where(inArray(invoiceCommunicationEventsTable.invoiceId, candidates.map(invoice => invoice.id)));

  const confirmedInvoiceIds = new Set(
    rows.filter(isConfirmedGmailInvoiceEvent).map(row => row.invoiceId),
  );
  return new Set(rows.filter(row => {
    return !confirmedInvoiceIds.has(row.invoiceId)
      && (row.eventType === "initial_invoice" || row.eventType === "resend_invoice")
      && (row.status === "pending" || row.status === "accepted")
      && row.provider === "gmail"
      && (row.status === "pending" || !row.providerMessageId)
      && new Date(row.requestedAt).getTime() >= (acceptedAtByInvoiceId.get(row.invoiceId) ?? 0);
  }).map(row => row.invoiceId));
}

function isConfirmedGmailInvoiceEvent(row: {
  invoiceId: number;
  eventType: string;
  status: string;
  provider: string | null;
  providerMessageId: string | null;
  metadata: unknown;
}): boolean {
  return (row.eventType === "initial_invoice" || row.eventType === "resend_invoice")
    && row.status === "accepted"
    && row.provider === "gmail"
    && Boolean(row.providerMessageId);
}

/**
 * Return the latest verified Gmail delivery for each invoice.
 *
 * Gmail acceptance plus its returned provider message ID is sufficient
 * delivery evidence. Optional metadata reconciliation may add a stricter
 * audit marker, but does not gate the accepted event.
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
      metadata: invoiceCommunicationEventsTable.metadata,
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

type GmailMessageMetadata = {
  id?: string;
  threadId?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: { headers?: Array<{ name?: string; value?: string }> };
};

async function throwForGmailMetadataAccess(response: Response): Promise<void> {
  if (response.status === 401) {
    throw new GmailAuthenticationError();
  }
  if (response.status !== 403) return;

  const body = await response.clone().json().catch(() => null) as {
    error?: {
      message?: string;
      errors?: Array<{ reason?: string }>;
      status?: string;
    };
  } | null;
  const reasons = body?.error?.errors?.map(error => error.reason?.toLowerCase() ?? "") ?? [];
  const message = body?.error?.message?.toLowerCase() ?? "";
  const status = body?.error?.status?.toLowerCase() ?? "";
  const insufficientScope = reasons.some(reason =>
    reason === "insufficientpermissions" || reason === "forbidden"
  ) || message.includes("insufficient authentication scopes")
    || message.includes("insufficient permission")
    || status === "permission_denied";

  if (insufficientScope) {
    throw new GmailMetadataPermissionError();
  }
  throw new Error("Gmail denied the metadata verification request.");
}

function matchesGmailSentMessage(
  message: GmailMessageMetadata | null,
  input: {
    messageId?: string;
    deliveryId: string;
    recipient: string;
    subject: string;
  },
): boolean {
  const headers = new Map(
    (message?.payload?.headers ?? []).map(header => [header.name?.toLowerCase() ?? "", header.value ?? ""]),
  );
  return (!input.messageId || message?.id === input.messageId)
    && Array.isArray(message?.labelIds)
    && message.labelIds.includes("SENT")
    && headers.get("x-buildpro-delivery-id") === input.deliveryId
    && normalizedEmail(headers.get("to") ?? "") === normalizedEmail(input.recipient)
    && (headers.get("subject") ?? "").trim() === input.subject.trim();
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
  if (!response.ok) {
    await throwForGmailMetadataAccess(response);
    return false;
   }
  const message = await response.json().catch(() => null) as GmailMessageMetadata | null;
  return matchesGmailSentMessage(message, { messageId, deliveryId, recipient, subject });
}

export async function recoverGmailSentMessage(input: {
  accessToken: string;
  deliveryId: string;
  recipient: string;
  subject: string;
  requestedAt: Date | string;
  windowHours?: number;
}): Promise<{ messageId: string; threadId: string | null } | null> {
  const { accessToken, deliveryId, recipient, subject, requestedAt } = input;
  if (![accessToken, deliveryId, recipient, subject].every(value => value.trim())) return null;
  const requestedMs = new Date(requestedAt).getTime();
  if (!Number.isFinite(requestedMs)) return null;

  const windowMs = Math.min(Math.max(input.windowHours ?? 48, 1), 168) * 60 * 60 * 1000;
  const after = new Date(requestedMs - windowMs).toISOString().slice(0, 10).replaceAll("-", "/");
  const before = new Date(requestedMs + windowMs + 24 * 60 * 60 * 1000).toISOString().slice(0, 10).replaceAll("-", "/");
  const quote = (value: string) => `"${value.replace(/[\\"]/g, " ").trim()}"`;
  const query = `in:sent to:${quote(recipient)} subject:${quote(subject)} after:${after} before:${before}`;
  const listResponse = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=50&fields=messages(id,threadId)`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!listResponse.ok) {
    await throwForGmailMetadataAccess(listResponse);
    throw new Error("Gmail metadata search failed while repairing this delivery.");
   }
  const list = await listResponse.json().catch(() => null) as {
    messages?: Array<{ id?: string; threadId?: string }>;
  } | null;

  const matches: Array<{ messageId: string; threadId: string | null }> = [];
  for (const candidate of list?.messages ?? []) {
    if (!candidate.id) continue;
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(candidate.id)}?format=metadata&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=X-BuildPro-Delivery-ID&fields=id,threadId,internalDate,labelIds,payload/headers`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!response.ok) {
      await throwForGmailMetadataAccess(response);
      continue;
     }
    const message = await response.json().catch(() => null) as GmailMessageMetadata | null;
    const sentMs = Number(message?.internalDate);
    if (!Number.isFinite(sentMs) || Math.abs(sentMs - requestedMs) > windowMs) continue;
    if (!matchesGmailSentMessage(message, { deliveryId, recipient, subject })) continue;
    matches.push({
      messageId: message!.id!,
      threadId: message?.threadId ?? candidate.threadId ?? null,
    });
  }

  if (matches.length > 1) {
    throw new Error("Multiple Gmail messages matched this delivery. No history was changed.");
  }
  return matches[0] ?? null;
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
  completedAt: Date | string | null,
) {
  if (!completedAt) {
    throw new Error("Verified invoice delivery is missing its completion timestamp");
  }
  const sentAt = completedAt instanceof Date ? completedAt : new Date(completedAt);
  if (!Number.isFinite(sentAt.getTime())) {
    throw new Error("Verified invoice delivery has an invalid completion timestamp");
  }
  // Only the first confirmed delivery moves Approved → Sent. Replays are
  // intentionally no-ops so they cannot rewrite sentAt or regress an invoice
  // that has already advanced to overdue, partially paid, or paid.
  await db.update(invoicesTable)
    .set({ status: "sent", sentAt, sentMethod })
    .where(and(
      eq(invoicesTable.id, invoiceId),
      eq(invoicesTable.status, "approved"),
    ));
}