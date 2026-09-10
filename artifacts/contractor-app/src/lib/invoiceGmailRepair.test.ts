import { describe, expect, it, vi } from "vitest";
import {
  readStoredInvoiceGmailRecovery,
  reconnectAndRepairInvoiceGmail,
} from "./invoiceGmailRepair";

describe("reconnectAndRepairInvoiceGmail", () => {
  it("hands the newly returned token directly to the selected event repair", async () => {
    const reconnect = vi.fn().mockResolvedValue("fresh-gmail-token");
    const repair = vi.fn().mockResolvedValue(undefined);

    await reconnectAndRepairInvoiceGmail(reconnect, repair, 77);

    expect(reconnect).toHaveBeenCalledOnce();
    expect(repair).toHaveBeenCalledOnce();
    expect(repair).toHaveBeenCalledWith(77, "fresh-gmail-token");
  });

  it("propagates metadata denial from the recovery-only verifier", async () => {
    const reconnect = vi.fn().mockResolvedValue("fresh-gmail-token");
    const repair = vi.fn().mockRejectedValue(new Error("Gmail metadata permission is required"));

    await expect(reconnectAndRepairInvoiceGmail(reconnect, repair, 77))
      .rejects.toThrow("Gmail metadata permission is required");

    expect(reconnect).toHaveBeenCalledOnce();
    expect(repair).toHaveBeenCalledWith(77, "fresh-gmail-token");
  });

  it("returns a validated message identity for the matching invoice", () => {
    const storage = {
      getItem: vi.fn().mockReturnValue(JSON.stringify({
        invoiceId: 42,
        eventId: 77,
        providerMessageId: " gmail-message-1 ",
        providerThreadId: "gmail-thread-1",
      })),
      removeItem: vi.fn(),
    };

    expect(readStoredInvoiceGmailRecovery(storage, 42)).toEqual({
      invoiceId: 42,
      eventId: 77,
      providerMessageId: "gmail-message-1",
      providerThreadId: "gmail-thread-1",
    });
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it.each([
    JSON.stringify({ invoiceId: 99, eventId: 77, providerMessageId: "gmail-message-1" }),
    JSON.stringify({ invoiceId: 42, eventId: 77, providerMessageId: "" }),
    "{not-json",
  ])("rejects an invalid or mismatched browser checkpoint", raw => {
    const storage = {
      getItem: vi.fn().mockReturnValue(raw),
      removeItem: vi.fn(),
    };

    expect(readStoredInvoiceGmailRecovery(storage, 42)).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith("invoice-gmail-finalization:42");
  });
});