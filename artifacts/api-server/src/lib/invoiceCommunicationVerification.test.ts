import { afterEach, describe, expect, it, vi } from "vitest";
import { recoverGmailSentMessage, verifyGmailSentMessage } from "./invoiceCommunication";

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

describe("recoverGmailSentMessage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("recovers exactly one in-window Sent message with matching delivery evidence", async () => {
    const requestedAt = "2026-09-05T19:29:40.000Z";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [{ id: "gmail-message-49", threadId: "thread-49" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "gmail-message-49",
          threadId: "thread-49",
          internalDate: String(new Date(requestedAt).getTime() + 2_000),
          labelIds: ["SENT"],
          payload: {
            headers: [
              { name: "To", value: "Lisa.Stone@cavco.com" },
              { name: "Subject", value: "Invoice Wil-1049 from Willard's General Contracting, LLC" },
              { name: "X-BuildPro-Delivery-ID", value: "7" },
            ],
          },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(recoverGmailSentMessage({
      accessToken: "access-token",
      deliveryId: "7",
      recipient: "lisa.stone@cavco.com",
      subject: "Invoice Wil-1049 from Willard's General Contracting, LLC",
      requestedAt,
    })).resolves.toEqual({ messageId: "gmail-message-49", threadId: "thread-49" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("messages?q=");
  });

  it("does not recover a message outside the bounded delivery window", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [{ id: "old-message" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "old-message",
          internalDate: String(new Date("2026-08-01T00:00:00.000Z").getTime()),
          labelIds: ["SENT"],
          payload: { headers: [] },
        }),
      }));

    await expect(recoverGmailSentMessage({
      accessToken: "access-token",
      deliveryId: "7",
      recipient: "client@example.com",
      subject: "Invoice Wil-1049",
      requestedAt: "2026-09-05T19:29:40.000Z",
    })).resolves.toBeNull();
  });

  it("requires Gmail metadata permission for recovery", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    await expect(recoverGmailSentMessage({
      accessToken: "send-only-token",
      deliveryId: "7",
      recipient: "client@example.com",
      subject: "Invoice Wil-1049",
      requestedAt: "2026-09-05T19:29:40.000Z",
    })).rejects.toThrow(/metadata permission/i);
  });
});