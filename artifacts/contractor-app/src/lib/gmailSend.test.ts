import { afterEach, describe, expect, it, vi } from "vitest";
import { assertGmailMessageFits, GMAIL_MAX_MESSAGE_BYTES, GmailSendUncertainError, sendViaGmail } from "./gmailSend";

const baseOptions = {
  token: "test-token",
  to: "recipient@example.com",
  subject: "Invoice WIL-1052",
  html: "<p>Corrected invoice</p>",
  pdfBase64: "JVBERi0x",
  pdfFilename: "Invoice-WIL-1052.pdf",
};

afterEach(() => vi.unstubAllGlobals());

describe("invoice Gmail message size", () => {
  it("accepts a corrected invoice PDF without job photos", () => {
    expect(() => assertGmailMessageFits(baseOptions)).not.toThrow();
  });

  it("rejects the oversized 16-photo scenario before contacting Gmail", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const opts = {
      ...baseOptions,
      extraAttachments: Array.from({ length: 16 }, (_, index) => ({
        filename: `photo-${index}.jpg`,
        base64: "A".repeat(Math.ceil((GMAIL_MAX_MESSAGE_BYTES / 16) * 4 / 3)),
      })),
    };
    expect(() => assertGmailMessageFits(opts)).toThrow(/too large for Gmail/);
    await expect(sendViaGmail(opts)).rejects.toThrow(/Nothing was sent/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records a successful provider acknowledgement only when Gmail returns its ID", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "gmail-message-id", threadId: "gmail-thread-id" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendViaGmail({ ...baseOptions, deliveryId: "42" });
    expect(result).toEqual({ provider: "gmail", messageId: "gmail-message-id", threadId: "gmail-thread-id" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const raw = JSON.parse(fetchMock.mock.calls[0][1].body).raw as string;
    const padded = raw.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(raw.length / 4) * 4, "=");
    expect(atob(padded)).toContain("X-BuildPro-Delivery-ID: 42");
  });

  it("sends the full HTML invoice when PDF rendering is unavailable", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "html-gmail-message-id" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendViaGmail({
      ...baseOptions,
      pdfBase64: undefined,
      pdfFilename: undefined,
      deliveryId: "43",
    });
    expect(result.messageId).toBe("html-gmail-message-id");
    const raw = JSON.parse(fetchMock.mock.calls[0][1].body).raw as string;
    const padded = raw.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(raw.length / 4) * 4, "=");
    const mime = atob(padded);
    expect(mime).toContain("X-BuildPro-Delivery-ID: 43");
    expect(mime).toContain("Content-Type: text/html");
    expect(mime).not.toContain("Content-Disposition: attachment");
  });

  it("does not claim acceptance when Gmail rejects the message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 413,
      json: async () => ({ error: { message: "Request entity too large" } }),
    }));
    await expect(sendViaGmail(baseOptions)).rejects.toThrow("Request entity too large");
  });

  it("treats a dropped connection after POST as uncertain, not a confirmed failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(sendViaGmail(baseOptions)).rejects.toBeInstanceOf(GmailSendUncertainError);
  });
});