export async function reconnectAndRepairInvoiceGmail(
  reconnect: () => Promise<string>,
  repair: (eventId: number | undefined, gmailAccessToken: string) => Promise<void>,
  eventId?: number,
): Promise<void> {
  const freshToken = await reconnect();
  await repair(eventId, freshToken);
}