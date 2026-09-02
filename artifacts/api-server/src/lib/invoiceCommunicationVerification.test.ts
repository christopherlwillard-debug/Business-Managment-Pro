import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyGmailSentMessage } from "./invoiceCommunication";

describe("verifyGmailSentMessage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts only the requested Gmail message when it is in the Sent folder", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "gmail-message-1",
        labelIds: ["SENT"],
        payload: {
          headers: [
            { name: "To", value: "client@example.com" },
            { name: "Subject", value: "Invoice INV-100" },
            { name: "X-BuildPro-Delivery-ID", value: "42" },
          ],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyGmailSentMessage({
      accessToken: "access-token",
      messageId: "gmail-message-1",
      deliveryId: "42",
      recipient: "client@example.com",
      subject: "Invoice INV-100",
    })).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/messages/gmail-message-1"),
      { headers: { Authorization: "Bearer access-token" } },
    );
  });

  it.each([
    [{ ok: false, json: async () => ({}) }, false],
    [{ ok: true, json: async () => ({ id: "different-message", labelIds: ["SENT"] }) }, false],
    [{ ok: true, json: async () => ({ id: "gmail-message-1", labelIds: ["INBOX"] }) }, false],
  ])("rejects unverified Gmail responses", async (response, expected) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await expect(verifyGmailSentMessage({
      accessToken: "access-token",
      messageId: "gmail-message-1",
      deliveryId: "42",
      recipient: "client@example.com",
      subject: "Invoice INV-100",
    })).resolves.toBe(expected);
  });
});