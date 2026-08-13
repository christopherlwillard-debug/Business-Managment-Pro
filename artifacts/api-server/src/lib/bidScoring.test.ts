import { describe, it, expect } from "vitest";
import { normalizeSetAsideType } from "./bidScoring.js";

describe("normalizeSetAsideType", () => {
  // ── Full-and-open ───────────────────────────────────────────────────────────
  it('maps explicit "none" to "open"', () => {
    expect(normalizeSetAsideType("none")).toBe("open");
  });

  it('maps "None" (mixed-case) to "open"', () => {
    expect(normalizeSetAsideType("None")).toBe("open");
  });

  it('maps "NONE" to "open"', () => {
    expect(normalizeSetAsideType("NONE")).toBe("open");
  });

  // ── Absent / unknown — no bonus ─────────────────────────────────────────────
  it("returns undefined for null (absent from SAM response)", () => {
    expect(normalizeSetAsideType(null)).toBeUndefined();
  });

  it("returns undefined for undefined (non-SAM source)", () => {
    expect(normalizeSetAsideType(undefined)).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(normalizeSetAsideType("")).toBeUndefined();
  });

  // ── Veteran-owned programs ─────────────────────────────────────────────────
  // SDVOSB = Service-Disabled Veteran-Owned → "sdvosb"
  // VOSB / VSBAOP = Veteran-Owned (not service-disabled) → "vosb" (distinct tier)
  it('maps "SDVOSB" to "sdvosb"', () => {
    expect(normalizeSetAsideType("SDVOSB")).toBe("sdvosb");
  });

  it('maps "VOSB" to "vosb" (distinct from SDVOSB)', () => {
    expect(normalizeSetAsideType("VOSB")).toBe("vosb");
  });

  it('maps "VSBAOP" to "vosb" (VOSB small business combined set-aside)', () => {
    expect(normalizeSetAsideType("VSBAOP")).toBe("vosb");
  });

  it('maps lowercase "sdvosb" to "sdvosb"', () => {
    expect(normalizeSetAsideType("sdvosb")).toBe("sdvosb");
  });

  // ── Total small-business set-aside → "small_business" ──────────────────────
  it('maps "SBA" to "small_business"', () => {
    expect(normalizeSetAsideType("SBA")).toBe("small_business");
  });

  it('maps lowercase "sba" to "small_business"', () => {
    expect(normalizeSetAsideType("sba")).toBe("small_business");
  });

  // ── Certification-specific programs → undefined (no bonus) ─────────────────
  it("returns undefined for WOSB (Women-Owned — requires certification)", () => {
    expect(normalizeSetAsideType("WOSB")).toBeUndefined();
  });

  it("returns undefined for EDWOSB (Economically Disadvantaged WOSB)", () => {
    expect(normalizeSetAsideType("EDWOSB")).toBeUndefined();
  });

  it("returns undefined for HZC (HUBZone — requires certification)", () => {
    expect(normalizeSetAsideType("HZC")).toBeUndefined();
  });

  it("returns undefined for 8A (8(a) program — requires certification)", () => {
    expect(normalizeSetAsideType("8A")).toBeUndefined();
  });

  it("returns undefined for 8AN (8(a) sole source)", () => {
    expect(normalizeSetAsideType("8AN")).toBeUndefined();
  });

  it("returns undefined for ISBEE (Indian Small Business)", () => {
    expect(normalizeSetAsideType("ISBEE")).toBeUndefined();
  });

  it("returns undefined for an unrecognised future code", () => {
    expect(normalizeSetAsideType("FUTURE_CERT_CODE")).toBeUndefined();
  });

  // ── Whitespace tolerance ────────────────────────────────────────────────────
  it("trims surrounding whitespace before matching", () => {
    expect(normalizeSetAsideType("  SDVOSB  ")).toBe("sdvosb");
    expect(normalizeSetAsideType(" SBA ")).toBe("small_business");
    expect(normalizeSetAsideType(" none ")).toBe("open");
  });
});
