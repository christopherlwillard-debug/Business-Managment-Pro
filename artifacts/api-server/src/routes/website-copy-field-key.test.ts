/**
 * Tests for deriveFieldKey logic (mirrors FloatingTextToolbar.tsx).
 *
 * deriveFieldKey is a pure function that maps the suffix of an inline-edit
 * field ID to a structured copy field key. The most critical correctness rule:
 * specific suffixes must be tested before their generic prefix counterparts
 * (e.g. "-subheadline" before "-headline") so endsWith() never swallows the
 * longer match.
 */

import { describe, it, expect } from "vitest";

/**
 * Canonical implementation — must stay in sync with
 * artifacts/contractor-app/src/pages/website/FloatingTextToolbar.tsx.
 */
function deriveFieldKey(id: string): string | null {
  const lower = id.toLowerCase();
  if (lower.endsWith("-subheadline")) return "hero-subheadline";
  if (lower.endsWith("-headline"))    return "hero-headline";
  if (lower.endsWith("-subheading"))  return "section-subheading";
  if (lower.endsWith("-heading"))     return "section-heading";
  if (lower.endsWith("-cta"))         return "cta-label";
  if (lower.endsWith("-body"))        return "about-body";
  if (lower.endsWith("-description")) return "service-description";
  if (lower.endsWith("-answer"))      return "faq-answer";
  return null;
}

describe("deriveFieldKey — suffix routing", () => {
  // ── Fields with structured backend variants ─────────────────────────────────

  it("maps -headline to hero-headline", () => {
    expect(deriveFieldKey("hero123-headline")).toBe("hero-headline");
  });

  it("maps -subheadline to hero-subheadline (not hero-headline)", () => {
    expect(deriveFieldKey("hero123-subheadline")).toBe("hero-subheadline");
  });

  it("maps -heading to section-heading", () => {
    expect(deriveFieldKey("services456-heading")).toBe("section-heading");
  });

  it("maps -subheading to section-subheading (not section-heading)", () => {
    expect(deriveFieldKey("services456-subheading")).toBe("section-subheading");
  });

  it("maps -cta to cta-label", () => {
    expect(deriveFieldKey("hero-cta")).toBe("cta-label");
  });

  it("maps -body to about-body", () => {
    expect(deriveFieldKey("about-body")).toBe("about-body");
  });

  it("maps -description to service-description", () => {
    expect(deriveFieldKey("service-s1-description")).toBe("service-description");
  });

  it("maps -answer to faq-answer", () => {
    expect(deriveFieldKey("faq-q1-answer")).toBe("faq-answer");
  });

  // ── Fields with NO structured variant (Rewrite button should be hidden) ─────

  it("returns null for -question (no backend structured variant)", () => {
    expect(deriveFieldKey("faq-q1-question")).toBeNull();
  });

  it("returns null for -title", () => {
    expect(deriveFieldKey("service-s1-title")).toBeNull();
  });

  it("returns null for unknown suffix", () => {
    expect(deriveFieldKey("some-field-xyz")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(deriveFieldKey("")).toBeNull();
  });

  // ── Case insensitivity ──────────────────────────────────────────────────────

  it("is case-insensitive for suffixes", () => {
    expect(deriveFieldKey("Hero123-HEADLINE")).toBe("hero-headline");
    expect(deriveFieldKey("Hero123-SUBHEADLINE")).toBe("hero-subheadline");
  });

  // ── Regression: specific-before-generic ordering ────────────────────────────
  // Verifies the ordering invariant that was previously broken:
  // "subheadline" contains "headline" as a suffix, so "-headline" must be
  // checked AFTER "-subheadline" to avoid misclassification.

  it("never misclassifies -subheadline as -headline", () => {
    const key = deriveFieldKey("section-subheadline");
    expect(key).toBe("hero-subheadline");
    expect(key).not.toBe("hero-headline");
  });

  it("never misclassifies -subheading as -heading", () => {
    const key = deriveFieldKey("section-subheading");
    expect(key).toBe("section-subheading");
    expect(key).not.toBe("section-heading");
  });

  // ── Show/hide toolbar button logic ──────────────────────────────────────────
  // The Rewrite button is shown only when deriveFieldKey returns non-null.

  const FIELDS_WITH_REWRITE = [
    "hero-headline", "hero-subheadline", "cta-cta",
    "services-heading", "services-subheading",
    "about-body", "service-s1-description", "faq-q1-answer",
  ];

  const FIELDS_WITHOUT_REWRITE = [
    "faq-q1-question", "service-s1-title", "footer-copyright",
    "gallery-caption", "stats-value", "",
  ];

  it.each(FIELDS_WITH_REWRITE)("shows Rewrite button for '%s'", id => {
    expect(deriveFieldKey(id)).not.toBeNull();
  });

  it.each(FIELDS_WITHOUT_REWRITE)("hides Rewrite button for '%s'", id => {
    expect(deriveFieldKey(id)).toBeNull();
  });
});
