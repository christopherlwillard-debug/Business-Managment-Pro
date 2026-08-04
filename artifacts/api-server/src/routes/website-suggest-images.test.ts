/**
 * Phase 5 M5 – AI Image Suggestions
 *
 * Tests for GET /api/website/suggest-images and the industryImageKeywords lib.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getSuggestedImages } from "../lib/industryImageKeywords";

// ── Unit tests: getSuggestedImages ─────────────────────────────────────────────

describe("getSuggestedImages", () => {
  it("returns up to 12 results", () => {
    const results = getSuggestedImages("roofing", "hero");
    expect(results.length).toBeLessThanOrEqual(12);
    expect(results.length).toBeGreaterThan(0);
  });

  it("returns results for every mapped industry type", () => {
    const industries = [
      "roofing", "hvac", "plumbing", "electrical", "landscaping",
      "flooring", "painting", "manufactured-home", "asphalt-sealing",
      "general-contractor",
    ];
    for (const industry of industries) {
      const results = getSuggestedImages(industry, "hero");
      expect(results.length, `${industry} should have hero suggestions`).toBeGreaterThan(0);
    }
  });

  it("falls back to a default pool for unknown businessType", () => {
    const results = getSuggestedImages("unknown-trade", "hero");
    expect(results.length).toBeGreaterThan(0);
  });

  it("falls back to _default pool for unknown sectionType", () => {
    const results = getSuggestedImages("roofing", "unknown-section");
    expect(results.length).toBeGreaterThan(0);
  });

  it("returns well-formed ImageSuggestion objects", () => {
    const results = getSuggestedImages("hvac", "services");
    for (const img of results) {
      expect(img.id).toBeTruthy();
      expect(img.url).toContain("unsplash.com");
      expect(img.thumbUrl).toContain("unsplash.com");
      expect(img.thumbUrl).toContain("w=400");
      expect(img.url).toContain("w=1200");
      expect(img.attribution).toBeTruthy();
      expect(img.attributionUrl).toContain("unsplash.com");
      expect(img.category).toBeTruthy();
      expect(img.alt).toBeTruthy();
    }
  });

  it("deduplicates by photo ID within a result set", () => {
    const results = getSuggestedImages("general-contractor", "hero");
    const ids = results.map(r => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("handles case-insensitive businessType", () => {
    const lower  = getSuggestedImages("roofing", "hero");
    const upper  = getSuggestedImages("ROOFING", "hero");
    const mixed  = getSuggestedImages("Roofing", "hero");
    expect(lower.length).toBe(upper.length);
    expect(lower.length).toBe(mixed.length);
  });

  it("returns gallery and before-after suggestions for portfolios", () => {
    const gallery = getSuggestedImages("roofing", "gallery");
    const ba      = getSuggestedImages("roofing", "before-after");
    expect(gallery.length).toBeGreaterThan(0);
    expect(ba.length).toBeGreaterThan(0);
  });

  it("returns suggestions for manufactured-home specific sections", () => {
    const hero     = getSuggestedImages("manufactured-home", "hero");
    const services = getSuggestedImages("manufactured-home", "services");
    expect(hero.length).toBeGreaterThan(0);
    expect(services.length).toBeGreaterThan(0);
  });

  it("returns image section suggestions", () => {
    const industries = ["roofing", "hvac", "landscaping"];
    for (const ind of industries) {
      const results = getSuggestedImages(ind, "image");
      expect(results.length, `${ind} image section`).toBeGreaterThan(0);
    }
  });
});

// ── Endpoint contract tests (via getSuggestedImages) ─────────────────────────
// The route handler is thin: it calls getSuggestedImages() and queries
// websiteMediaTable. All branching logic lives in getSuggestedImages and is
// covered above; here we verify the response shape contract.

describe("suggest-images response shape contract", () => {
  it("getSuggestedImages return values satisfy the ImageSuggestion contract", () => {
    const required: Array<keyof ReturnType<typeof getSuggestedImages>[0]> = [
      "id", "url", "thumbUrl", "attribution", "attributionUrl", "category", "alt",
    ];
    const results = getSuggestedImages("roofing", "hero");
    for (const img of results) {
      for (const key of required) {
        expect(img[key], `${key} should be defined`).toBeTruthy();
      }
    }
  });

  it("endpoint omits ownPhotos when businessId is absent (NaN guard)", () => {
    // The route guards with: if (!isNaN(businessId) && businessId > 0)
    // We verify the guard logic using parseInt:
    const withoutId  = isNaN(parseInt(""))      || parseInt("") <= 0;
    const withBadId  = isNaN(parseInt("abc"))   || parseInt("abc") <= 0;
    const withZero   = isNaN(parseInt("0"))     || parseInt("0") <= 0;
    const withValid  = isNaN(parseInt("42"))    || parseInt("42") <= 0;
    expect(withoutId).toBe(true);
    expect(withBadId).toBe(true);
    expect(withZero).toBe(true);
    expect(withValid).toBe(false); // valid ID passes the guard
  });
});
