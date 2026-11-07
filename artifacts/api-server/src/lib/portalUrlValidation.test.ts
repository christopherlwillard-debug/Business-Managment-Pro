import { describe, expect, it } from "vitest";
import { validatePortalUrl } from "./portalUrlValidation.js";

describe("validatePortalUrl", () => {
  it("accepts valid HTTP and HTTPS URLs", () => {
    expect(validatePortalUrl("https://vendor.example.com/login")).toEqual({
      ok: true,
      value: "https://vendor.example.com/login",
    });
    expect(validatePortalUrl("http://vendor.example.com")).toEqual({
      ok: true,
      value: "http://vendor.example.com/",
    });
  });

  it("rejects script and other non-web protocols", () => {
    expect(validatePortalUrl("javascript:alert(1)").ok).toBe(false);
    expect(validatePortalUrl("data:text/html,hello").ok).toBe(false);
    expect(validatePortalUrl("ftp://vendor.example.com/file").ok).toBe(false);
  });

  it("rejects URLs containing embedded usernames or passwords", () => {
    expect(validatePortalUrl("https://user:pass@vendor.example.com").ok).toBe(false);
    expect(validatePortalUrl("https://user@vendor.example.com").ok).toBe(false);
  });

  it("rejects malformed URLs", () => {
    expect(validatePortalUrl("not a URL")).toMatchObject({ ok: false });
  });

  it("normalizes blank input to an explicit clear value", () => {
    expect(validatePortalUrl("   ")).toEqual({ ok: true, value: null });
  });
});
