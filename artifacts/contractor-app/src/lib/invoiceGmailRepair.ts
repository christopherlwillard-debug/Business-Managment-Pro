export type InvoiceGmailFinalizationRecovery = {
  invoiceId: number;
  eventId: number;
  providerMessageId: string;
  providerThreadId: string | null;
};

export function readStoredInvoiceGmailRecovery(
  storage: Pick<Storage, "getItem" | "removeItem">,
  invoiceId: number,
): InvoiceGmailFinalizationRecovery | null {
  const key = `invoice-gmail-finalization:${invoiceId}`;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<InvoiceGmailFinalizationRecovery>;
    if (
      parsed.invoiceId !== invoiceId
      || !Number.isInteger(parsed.eventId)
      || typeof parsed.providerMessageId !== "string"
      || !parsed.providerMessageId.trim()
    ) {
      storage.removeItem(key);
      return null;
    }
    return {
      invoiceId,
      eventId: parsed.eventId!,
      providerMessageId: parsed.providerMessageId.trim(),
      providerThreadId: typeof parsed.providerThreadId === "string"
        ? parsed.providerThreadId
        : null,
    };
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export async function reconnectAndRepairInvoiceGmail(
  reconnect: () => Promise<string>,
  repair: (eventId: number | undefined, gmailAccessToken: string) => Promise<void>,
  eventId?: number,
): Promise<void> {
  const freshToken = await reconnect();
  await repair(eventId, freshToken);
}