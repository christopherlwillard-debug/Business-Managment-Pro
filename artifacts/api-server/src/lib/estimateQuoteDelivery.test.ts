import { afterEach, describe, expect, it } from "vitest";
import { getEstimateQuoteToken, hashEstimateQuoteToken } from "./estimateQuoteDelivery.js";

const originalSecret = process.env.SESSION_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSecret;
});

describe("estimate quote token derivation", () => {
  it("derives a stable opaque token for a revision and stores only its digest", () => {
    process.env.SESSION_SECRET = "test-session-secret";
    const token = getEstimateQuoteToken(42, 3, "content-hash");
    expect(token).toBe(getEstimateQuoteToken(42, 3, "content-hash"));
    expect(token).not.toBe(getEstimateQuoteToken(42, 4, "content-hash"));
    expect(token).toMatch(/^[A-Za-z0-9_-]{40,100}$/);
    expect(hashEstimateQuoteToken(token)).not.toBe(token);
  });

  it("fails closed when the signing key is missing", () => {
    delete process.env.SESSION_SECRET;
    expect(() => getEstimateQuoteToken(42, 1, "content-hash")).toThrow("not configured");
  });
});
