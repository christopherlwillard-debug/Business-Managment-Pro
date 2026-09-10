import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GmailAuthenticationError,
  GmailMetadataPermissionError,
  recoverGmailSentMessage,
  recoverGmailSentMessageFromConnector,
  verifyGmailSentMessage,
} from "./invoiceCommunication";

const connector = vi.hoisted(() => ({
  proxy: vi.fn(),
}));

vi.mock("@replit/connectors-sdk", () => ({
  ReplitConnectors: class {
    proxy = connector.proxy;
  },
}));

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
    [{ ok: false, status: 500, clone() { return this; }, json: async () => ({}) }, false],
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

  it("distinguishes an expired Gmail token from missing metadata scope", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: {
          status: "PERMISSION_DENIED",
          message: "Request had insufficient authentication scopes.",
          errors: [{ reason: "insufficientPermissions" }],
        },
      }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })));

    const input = {
      accessToken: "access-token",
      messageId: "gmail-message-1",
      deliveryId: "42",
      recipient: "client@example.com",
      subject: "Invoice INV-100",
    };
    await expect(verifyGmailSentMessage(input)).rejects.toBeInstanceOf(GmailAuthenticationError);
    await expect(verifyGmailSentMessage(input)).rejects.toBeInstanceOf(GmailMetadataPermissionError);
  });
});

describe("recoverGmailSentMessage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    connector.proxy.mockReset();
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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: {
        status: "PERMISSION_DENIED",
        message: "Request had insufficient authentication scopes.",
        errors: [{ reason: "insufficientPermissions" }],
      },
    }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    })));
    await expect(recoverGmailSentMessage({
      accessToken: "send-only-token",
      deliveryId: "7",
      recipient: "client@example.com",
      subject: "Invoice Wil-1049",
      requestedAt: "2026-09-05T19:29:40.000Z",
    })).rejects.toThrow(/metadata permission/i);
  });
});

describe("recoverGmailSentMessageFromConnector", () => {
  afterEach(() => {
    connector.proxy.mockReset();
  });

  it("uses the server Gmail connector for one bounded exact Sent match", async () => {
    const requestedAt = "2026-09-05T15:46:15.663Z";
    connector.proxy
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          messages: [{ id: "1a0723fd0a12bb27", threadId: "1a0723fd0a12bb27" }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: "1a0723fd0a12bb27",
          threadId: "1a0723fd0a12bb27",
          internalDate: String(new Date(requestedAt).getTime() + 3_337),
          labelIds: ["SENT"],
          payload: {
            headers: [
              { name: "To", value: "Lejend.Wilborn@claytonhomes.com" },
              { name: "Subject", value: "Invoice Wil-1047 from Willard's General Contracting, LLC" },
              { name: "X-BuildPro-Delivery-ID", value: "6" },
            ],
          },
        }),
      });

    await expect(recoverGmailSentMessageFromConnector({
      deliveryId: "6",
      recipient: "Lejend.Wilborn@claytonhomes.com",
      subject: "Invoice Wil-1047 from Willard's General Contracting, LLC",
      requestedAt,
    })).resolves.toEqual({
      messageId: "1a0723fd0a12bb27",
      threadId: "1a0723fd0a12bb27",
    });
    expect(connector.proxy).toHaveBeenCalledTimes(2);
    expect(connector.proxy.mock.calls[0]?.[0]).toBe("google-mail");
    expect(String(connector.proxy.mock.calls[0]?.[1])).toContain("messages?q=");
    expect(connector.proxy.mock.calls.every(([, path]) => !String(path).includes("/send"))).toBe(true);
  });

  it("does not reconcile ambiguous connector matches", async () => {
    const requestedAt = "2026-09-05T19:32:11.233Z";
    connector.proxy
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          messages: [
            { id: "message-1", threadId: "thread-1" },
            { id: "message-2", threadId: "thread-2" },
          ],
        }),
      });
    for (const id of ["message-1", "message-2"]) {
      connector.proxy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id,
          threadId: id.replace("message", "thread"),
          internalDate: String(new Date(requestedAt).getTime()),
          labelIds: ["SENT"],
          payload: {
            headers: [
              { name: "To", value: "client@example.com" },
              { name: "Subject", value: "Invoice Wil-1049" },
              { name: "X-BuildPro-Delivery-ID", value: "7" },
            ],
          },
        }),
      });
    }

    await expect(recoverGmailSentMessageFromConnector({
      deliveryId: "7",
      recipient: "client@example.com",
      subject: "Invoice Wil-1049",
      requestedAt,
    })).rejects.toThrow(/Multiple Gmail messages matched/);
  });
});