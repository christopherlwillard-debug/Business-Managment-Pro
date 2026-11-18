import { describe, expect, it } from "vitest";
import { sanitizeEmailDeliveryError } from "./emailDeliveryError.js";

describe("email delivery error sanitization", () => {
  it("replaces provider messages and details with a safe category and reference", () => {
    const raw = Object.assign(
      new Error("535 invalid password secret-sentinel for client@example.test"),
      { code: "EAUTH", response: "AUTH PLAIN secret-sentinel" },
    );
    const safe = sanitizeEmailDeliveryError(raw);
    expect(safe.errorCode).toBe("email_authentication");
    expect(safe.message).toContain(safe.referenceId);
    expect(safe.message).not.toContain("secret-sentinel");
    expect(safe.message).not.toContain("client@example.test");
    expect(safe.message).not.toContain("535");
  });

  it("uses a bounded fallback category for unknown provider failures", () => {
    const safe = sanitizeEmailDeliveryError(new Error("provider response secret-sentinel"));
    expect(safe.errorCode).toBe("email_unknown");
    expect(safe.message).not.toContain("provider response");
    expect(safe.message).not.toContain("secret-sentinel");
  });

  it("classifies socket failures as connection errors", () => {
    expect(sanitizeEmailDeliveryError(Object.assign(new Error("socket detail"), { code: "ESOCKET" })).errorCode)
      .toBe("email_connection");
  });
});
