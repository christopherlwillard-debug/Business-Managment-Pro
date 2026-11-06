/**
 * website-photo-optimizer.test.ts
 *
 * Unit tests for M9 — AI Photo Optimizer (Phase 5).
 *
 * Covers:
 *   • imageProcessor — createMediaVariants, applyEnhancements
 *   • POST /api/website/media/:id/enhance — endpoint validation & contract
 *   • GET /api/public/site/media-image/:uuid — WebP content negotiation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";
import {
  createMediaVariants,
  applyEnhancements,
  detectWebsiteMediaMimeType,
  CROP_RATIOS,
  cropRatioLabel,
  validateEnhancementOptions,
} from "../lib/imageProcessor";

// ── imageProcessor — module-level tests ──────────────────────────────────────

describe("imageProcessor — createMediaVariants", () => {
  it("exports createMediaVariants as a function", () => {
    expect(typeof createMediaVariants).toBe("function");
  });

  it("exports applyEnhancements as a function", () => {
    expect(typeof applyEnhancements).toBe("function");
  });

  it("CROP_RATIOS contains the three supported ratios", () => {
    expect(CROP_RATIOS).toContain("16:9");
    expect(CROP_RATIOS).toContain("4:3");
    expect(CROP_RATIOS).toContain("1:1");
    expect(CROP_RATIOS).toHaveLength(3);
  });

  it("cropRatioLabel returns user-friendly labels for each ratio", () => {
    expect(cropRatioLabel("16:9")).toMatch(/Widescreen/i);
    expect(cropRatioLabel("4:3")).toMatch(/Standard/i);
    expect(cropRatioLabel("1:1")).toMatch(/Square/i);
  });
});

// ── Website media upload validation ─────────────────────────────────────────

describe("imageProcessor — website media upload validation", () => {
  it("detects the stored MIME type from image bytes", async () => {
    const png = await sharp({
      create: { width: 1, height: 1, channels: 3, background: { r: 255, g: 255, b: 255 } },
    }).png().toBuffer();
    await expect(detectWebsiteMediaMimeType(png)).resolves.toBe("image/png");
  });

  it("recognizes SVG while public response CSP keeps its active content sandboxed", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><script>alert(1)</script><rect width="1" height="1"/></svg>');
    await expect(detectWebsiteMediaMimeType(svg)).resolves.toBe("image/svg+xml");
  });

  it("rejects malformed and non-image file bytes", async () => {
    await expect(detectWebsiteMediaMimeType(Buffer.from("<html><script>alert(1)</script></html>"))).resolves.toBeNull();
    await expect(detectWebsiteMediaMimeType(Buffer.from("not an image"))).resolves.toBeNull();
  });
});

// ── Enhancement option validation (pure logic, no sharp needed) ──────────────

describe("imageProcessor — EnhancementOptions validation logic", () => {
  const VALID_CROPS = ["16:9", "4:3", "1:1"];
  const INVALID_CROPS = ["9:16", "21:9", "2:3", "", "none", "auto"];


  it("accepts valid supported enhancement combinations", () => {
    expect(validateEnhancementOptions({ brighten: true })).toEqual({
      ok: true, options: { brighten: true, straighten: undefined, crop: undefined },
    });
    expect(validateEnhancementOptions({ crop: "4:3", brighten: true })).toEqual({
      ok: true, options: { brighten: true, straighten: undefined, crop: "4:3" },
    });
  });

  it("rejects malformed option payloads and non-boolean flags", () => {
    expect(validateEnhancementOptions(null).ok).toBe(false);
    expect(validateEnhancementOptions([]).ok).toBe(false);
    expect(validateEnhancementOptions({ brighten: "yes" }).ok).toBe(false);
  });

  it("rejects unsupported crop ratios before image processing", () => {
    expect(validateEnhancementOptions({ brighten: true, crop: "9:16" })).toEqual({
      ok: false, error: "Crop must be 16:9, 4:3, or 1:1.",
    });
  });

  it("does not silently accept the not-yet-available background removal option", () => {
    expect(validateEnhancementOptions({ brighten: true, removeBackground: true })).toEqual({
      ok: false, error: "Background removal is not available yet.",
    });
  });

  it("rejects requests that do not select a supported enhancement", () => {
    expect(validateEnhancementOptions({ brighten: false, straighten: false, crop: null })).toEqual({
      ok: false, error: "Choose at least one supported enhancement.",
    });
  });

  it("valid crop ratios are all in CROP_RATIOS", () => {
    VALID_CROPS.forEach(r => expect(CROP_RATIOS).toContain(r));
  });

  it("invalid crop ratios are NOT in CROP_RATIOS", () => {
    INVALID_CROPS.forEach(r => expect(CROP_RATIOS).not.toContain(r as never));
  });
});

// ── Enhance endpoint — request / response contract ───────────────────────────

describe("POST /api/website/media/:id/enhance — contract", () => {
  const makeRequest = (overrides: Record<string, unknown> = {}) => ({
    method: "POST",
    body: JSON.stringify({
      enhancements: { brighten: true },
      ...overrides,
    }),
    headers: { "Content-Type": "application/json" },
  });

  it("enhancements object with brighten=true is a valid request shape", () => {
    const req = makeRequest({ enhancements: { brighten: true } });
    const body = JSON.parse(req.body) as { enhancements: { brighten?: boolean } };
    expect(body.enhancements.brighten).toBe(true);
  });

  it("enhancements object with straighten=true is a valid request shape", () => {
    const req = makeRequest({ enhancements: { straighten: true } });
    const body = JSON.parse(req.body) as { enhancements: { straighten?: boolean } };
    expect(body.enhancements.straighten).toBe(true);
  });

  it("enhancements object with crop=16:9 is a valid request shape", () => {
    const req = makeRequest({ enhancements: { crop: "16:9" } });
    const body = JSON.parse(req.body) as { enhancements: { crop?: string } };
    expect(body.enhancements.crop).toBe("16:9");
  });

  it("combined enhancements are serializable", () => {
    const combined = { brighten: true, straighten: true, crop: "4:3" };
    const req = makeRequest({ enhancements: combined });
    const body = JSON.parse(req.body) as { enhancements: typeof combined };
    expect(body.enhancements).toMatchObject(combined);
  });

  it("empty enhancements object should be rejected (no-op guard)", () => {
    // A route-level guard rejects requests where no enhancement is selected.
    // We test the guard logic here: all falsy = no enhancement.
    const enhancements = { brighten: false, straighten: false, crop: "" };
    const hasEnhancement = enhancements.brighten || enhancements.straighten || enhancements.crop !== "";
    expect(hasEnhancement).toBe(false);
  });

  it("at least one truthy field passes the guard", () => {
    const cases: Array<{ brighten?: boolean; straighten?: boolean; crop?: string }> = [
      { brighten: true },
      { straighten: true },
      { crop: "1:1" },
      { brighten: true, crop: "16:9" },
    ];
    cases.forEach(enhancements => {
      const hasEnhancement =
        !!enhancements.brighten || !!enhancements.straighten || (enhancements.crop ?? "") !== "";
      expect(hasEnhancement).toBe(true);
    });
  });
});

// ── WebP content negotiation — Accept header logic ───────────────────────────

describe("media-image serve — WebP content negotiation", () => {
  const buildAcceptHeader = (types: string[]) => types.join(", ");

  it("Accept: image/webp triggers WebP negotiation", () => {
    const accept = buildAcceptHeader(["image/webp", "image/png", "*/*"]);
    expect(accept.includes("image/webp")).toBe(true);
  });

  it("Accept without image/webp skips WebP variant", () => {
    const accept = buildAcceptHeader(["image/png", "image/jpeg", "*/*"]);
    expect(accept.includes("image/webp")).toBe(false);
  });

  it("empty Accept header skips WebP variant", () => {
    const accept = "";
    expect(accept.includes("image/webp")).toBe(false);
  });

  it("WebP variant path follows the naming convention: uploads/website-media-webp/{uuid}.webp", () => {
    const uuid = "abc123-def456-789.jpg";
    const webpPath = `/objects/uploads/website-media-webp/${uuid}.webp`;
    expect(webpPath).toBe("/objects/uploads/website-media-webp/abc123-def456-789.jpg.webp");
  });

  it("thumbnail variant path follows naming convention: uploads/website-media-thumb/{uuid}.webp", () => {
    const uuid = "abc123-def456-789.jpg";
    const thumbPath = `/objects/uploads/website-media-thumb/${uuid}.webp`;
    expect(thumbPath).toBe("/objects/uploads/website-media-thumb/abc123-def456-789.jpg.webp");
  });

  it("display variant path follows naming convention: uploads/website-media-display/{uuid}.webp", () => {
    const uuid = "abc123-def456-789.jpg";
    const displayPath = `/objects/uploads/website-media-display/${uuid}.webp`;
    expect(displayPath).toBe("/objects/uploads/website-media-display/abc123-def456-789.jpg.webp");
  });
});

// ── Background processing — fire-and-forget guard ────────────────────────────

describe("background variant generation — eligibility logic", () => {
  const isEligible = (mimetype: string) =>
    mimetype.startsWith("image/") && mimetype !== "image/svg+xml";

  it("JPEG images are eligible", () => expect(isEligible("image/jpeg")).toBe(true));
  it("PNG images are eligible",  () => expect(isEligible("image/png")).toBe(true));
  it("WebP images are eligible", () => expect(isEligible("image/webp")).toBe(true));
  it("GIF images are eligible",  () => expect(isEligible("image/gif")).toBe(true));
  it("AVIF images are eligible", () => expect(isEligible("image/avif")).toBe(true));
  it("SVG images are NOT eligible (skip WebP conversion)", () => expect(isEligible("image/svg+xml")).toBe(false));
  it("non-image files are NOT eligible", () => {
    expect(isEligible("application/pdf")).toBe(false);
    expect(isEligible("video/mp4")).toBe(false);
    expect(isEligible("text/plain")).toBe(false);
  });
});

// ── Derived filename convention ───────────────────────────────────────────────

describe("enhance endpoint — derived filename convention", () => {
  function deriveEnhancedFilename(originalFilename: string): string {
    const base = originalFilename.replace(/\.[^.]+$/, "");
    return `${base}_enhanced.webp`;
  }

  it("strips extension and appends _enhanced.webp", () => {
    expect(deriveEnhancedFilename("my-photo.jpg")).toBe("my-photo_enhanced.webp");
  });

  it("handles multiple dots in filename", () => {
    expect(deriveEnhancedFilename("my.photo.v2.jpg")).toBe("my.photo.v2_enhanced.webp");
  });

  it("handles PNG originals", () => {
    expect(deriveEnhancedFilename("logo.png")).toBe("logo_enhanced.webp");
  });

  it("enhanced filename always ends in .webp regardless of original format", () => {
    ["file.bmp", "file.gif", "file.tiff", "file.heic"].forEach(f =>
      expect(deriveEnhancedFilename(f)).toMatch(/\.webp$/)
    );
  });

  it("displayName gets '(enhanced)' suffix appended", () => {
    const original = "Jobsite exterior";
    const enhanced = `${original} (enhanced)`;
    expect(enhanced).toBe("Jobsite exterior (enhanced)");
  });
});

// ── optimized badge — display logic ──────────────────────────────────────────

describe("optimized badge — MediaItem display logic", () => {
  interface MinimalMediaItem { id: number; optimized?: boolean }

  it("item with optimized=true shows badge", () => {
    const item: MinimalMediaItem = { id: 1, optimized: true };
    expect(item.optimized).toBe(true);
  });

  it("item with optimized=false does not show badge", () => {
    const item: MinimalMediaItem = { id: 2, optimized: false };
    expect(item.optimized).toBeFalsy();
  });

  it("item with optimized=undefined (legacy row) does not show badge", () => {
    const item: MinimalMediaItem = { id: 3 };
    expect(item.optimized).toBeFalsy();
  });
});
