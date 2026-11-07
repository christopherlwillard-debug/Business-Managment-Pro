import { describe, expect, it } from "vitest";
import { extractTextFromPdf, isUnsafeIpAddress, readLimitedResponseBuffer } from "./bidDocumentFetcher.js";

describe("bid document URL safety", () => {
  it("blocks private, loopback, link-local, shared, and non-routable IPv4 ranges", () => {
    for (const address of [
      "0.0.0.0",
      "10.0.0.1",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "192.0.2.10",
      "192.168.1.1",
      "198.18.0.1",
      "198.51.100.10",
      "203.0.113.10",
      "224.0.0.1",
      "255.255.255.255",
    ]) {
      expect(isUnsafeIpAddress(address), address).toBe(true);
    }
  });

  it("blocks non-global IPv6 ranges and allows public unicast addresses", () => {
    for (const address of ["::", "::1", "fc00::1", "fd12::1", "fe80::1", "ff02::1", "::ffff:127.0.0.1", "2001:db8::1"]) {
      expect(isUnsafeIpAddress(address), address).toBe(true);
    }
    expect(isUnsafeIpAddress("2606:4700:4700::1111")).toBe(false);
  });
});

describe("bid document response size limits", () => {
  it("rejects a PDF whose declared content length exceeds the limit", async () => {
    const response = new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-length": "1000" },
    });

    await expect(readLimitedResponseBuffer(response, 10)).resolves.toBeNull();
  });

  it("rejects chunked responses that exceed the limit without buffering the full body", async () => {
    const response = new Response(new Uint8Array(32));

    await expect(readLimitedResponseBuffer(response, 16)).resolves.toBeNull();
  });

  it("returns the complete buffer when the response is within the limit", async () => {
    const response = new Response(new Uint8Array([1, 2, 3, 4]));

    const result = await readLimitedResponseBuffer(response, 4);
    expect(result).toEqual(Buffer.from([1, 2, 3, 4]));
  });
});

describe("bid PDF extraction fallback", () => {
  it("returns empty extracted text for a malformed PDF instead of throwing", async () => {
    await expect(extractTextFromPdf(Buffer.from("this is not a PDF"))).resolves.toBe("");
  });
});
