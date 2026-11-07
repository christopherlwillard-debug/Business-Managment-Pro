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
  it("recognizes WOSB and EDWOSB restricted codes without awarding points", () => {
    expect(normalizeSetAsideType("WOSB")).toBe("cert_other");
    expect(normalizeSetAsideType("WOSBSS")).toBe("cert_other");
    expect(normalizeSetAsideType("EDWOSB")).toBe("cert_other");
    expect(normalizeSetAsideType("EDWOSBSS")).toBe("cert_other");
  });

  it("recognizes HUBZone set-aside and sole-source codes without awarding points", () => {
    expect(normalizeSetAsideType("HZC")).toBe("hubzone");
    expect(normalizeSetAsideType("HZS")).toBe("hubzone");
  });

  it("recognizes 8(a) competed and sole-source codes without awarding points", () => {
    expect(normalizeSetAsideType("8A")).toBe("8a");
    expect(normalizeSetAsideType("8AN")).toBe("8a");
  });

  it("recognizes SDVOSB official SAM.gov variants", () => {
    expect(normalizeSetAsideType("SDVOSBC")).toBe("sdvosb");
    expect(normalizeSetAsideType("SDVOSBS")).toBe("sdvosb");
  });

  it("recognizes VOSB and partial small-business variants", () => {
    expect(normalizeSetAsideType("VSA")).toBe("vosb");
    expect(normalizeSetAsideType("VSS")).toBe("vosb");
    expect(normalizeSetAsideType("SBP")).toBe("small_business");
  });

  it("recognizes other certification-specific codes without awarding points", () => {
    expect(normalizeSetAsideType("ISBEE")).toBe("cert_other");
    expect(normalizeSetAsideType("BICiv")).toBe("cert_other");
    expect(normalizeSetAsideType("IEE")).toBe("cert_other");
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
