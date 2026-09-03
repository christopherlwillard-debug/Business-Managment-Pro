import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestLoginProof,
  getSafeReturnTo,
  verifyTestLoginProof,
} from "./auth";

describe("authentication safety helpers", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "unit-test-session-secret";
  });

  afterEach(() => {
    delete process.env.SESSION_SECRET;
    vi.useRealTimers();
  });

  it("only accepts same-origin relative return paths", () => {
    expect(getSafeReturnTo("/people?tab=subcontractors")).toBe("/people?tab=subcontractors");
    expect(getSafeReturnTo("//attacker.example/path")).toBe("/");
    expect(getSafeReturnTo("/\\attacker.example/path")).toBe("/");
    expect(getSafeReturnTo("https://attacker.example/path")).toBe("/");
  });

  it("accepts a fresh signed test-login proof and rejects tampering", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T12:00:00Z"));
    const returnTo = "/subcontractors";
    const proof = createTestLoginProof(returnTo);

    expect(verifyTestLoginProof({ ...proof, returnTo })).toBe(true);
    expect(verifyTestLoginProof({ ...proof, returnTo: "/jobs" })).toBe(false);
  });

  it("rejects expired test-login proofs", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T12:00:00Z"));
    const returnTo = "/subcontractors";
    const proof = createTestLoginProof(returnTo);
    vi.advanceTimersByTime(60_001);

    expect(verifyTestLoginProof({ ...proof, returnTo })).toBe(false);
  });
});