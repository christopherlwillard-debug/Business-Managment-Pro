import { describe, expect, it } from "vitest";
import { readLimitedResponseBuffer } from "./bidDocumentFetcher.js";

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
