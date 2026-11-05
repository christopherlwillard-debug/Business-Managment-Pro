/**
 * imageProcessor.ts
 *
 * Sharp-based image processing utilities for M9 – AI Photo Optimizer.
 * Sharp is a project dependency (^0.34.5).
 *
 * Creates three variants of every uploaded photo:
 *   • WebP   — full-resolution WebP at 85% quality (best for modern browsers)
 *   • Thumb  — 300×200 cover-cropped WebP (media library grids, lazy-load)
 *   • Display — 1200px-wide WebP (display resolution; never upscales)
 *
 * The Enhance flow lets contractors fix common phone-photo problems:
 *   • Auto-rotate — applies EXIF orientation (many phone photos need this)
 *   • Brighten    — +15% brightness, +5% saturation
 *   • Crop        — center-crops to 16:9 / 4:3 / 1:1 aspect ratio
 *
 * Originals are NEVER overwritten; enhancements produce new derived records.
 */

import sharp from "sharp";

const WEBSITE_MEDIA_MIME_TYPES: Readonly<Record<string, string>> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  tiff: "image/tiff",
  svg: "image/svg+xml",
};

/**
 * Detect a supported image format from its bytes, not the client-supplied MIME
 * type. SVG is retained for image use; every public Website Studio image route
 * applies a sandbox CSP so an SVG opened directly cannot execute active content.
 * Returns null for malformed or unsupported formats.
 */
export async function detectWebsiteMediaMimeType(inputBuffer: Buffer): Promise<string | null> {
  try {
    const metadata = await sharp(inputBuffer).metadata();
    if (metadata.format === "heif") {
      if (metadata.compression === "av1") return "image/avif";
      if (metadata.compression === "hevc") return "image/heic";
      return null;
    }
    return WEBSITE_MEDIA_MIME_TYPES[metadata.format ?? ""] ?? null;
  } catch {
    return null;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MediaVariants {
  webpBuffer:     Buffer;
  thumbBuffer:    Buffer;
  displayBuffer:  Buffer;
}

export interface EnhancementOptions {
  /** Apply EXIF orientation correction (straighten phone photos). */
  straighten?: boolean;
  /** Boost brightness (+15%) and saturation (+5%). */
  brighten?: boolean;
  /** Center-crop to a fixed aspect ratio. null or undefined = no crop. */
  crop?: "16:9" | "4:3" | "1:1" | null;
  /** Not implemented at launch — reserved for future AI bg-removal. */
  removeBackground?: boolean;
}

// ── Variant generation ────────────────────────────────────────────────────────

/**
 * Generate three size/format variants from a raw upload buffer.
 * Always auto-rotates from EXIF so all variants are correctly oriented.
 */
export async function createMediaVariants(inputBuffer: Buffer): Promise<MediaVariants> {
  // Always fix EXIF orientation first so all variants are upright.
  const base = await sharp(inputBuffer).rotate().toBuffer();

  const [webpBuffer, thumbBuffer, displayBuffer] = await Promise.all([
    // Full-resolution WebP
    sharp(base)
      .webp({ quality: 85 })
      .toBuffer(),

    // 300×200 thumbnail — cover-crop (never letterbox)
    sharp(base)
      .resize(300, 200, { fit: "cover", position: "entropy" })
      .webp({ quality: 80 })
      .toBuffer(),

    // Display-resolution — at most 1200px wide, never upscale
    sharp(base)
      .resize(1200, undefined, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer(),
  ]);

  return { webpBuffer, thumbBuffer, displayBuffer };
}

// ── Enhancement pipeline ──────────────────────────────────────────────────────

/**
 * Apply Willard's chosen enhancements to an image buffer.
 * Returns the enhanced image as a JPEG or WebP buffer (preserves input format).
 *
 * Originals must never be passed here — always operate on a copy.
 */
export async function applyEnhancements(
  inputBuffer: Buffer,
  opts: EnhancementOptions,
): Promise<Buffer> {
  // Step 1 — always auto-rotate from EXIF
  let base = await sharp(inputBuffer).rotate().toBuffer();

  // Step 2 — get dimensions of the (now correctly-oriented) image
  const meta = await sharp(base).metadata();
  const origWidth  = meta.width  ?? 0;
  const origHeight = meta.height ?? 0;

  // Start building the pipeline
  let pipeline = sharp(base);

  // Step 3 — brightness / saturation
  if (opts.brighten) {
    pipeline = pipeline.modulate({ brightness: 1.15, saturation: 1.05 });
  }

  // Step 4 — center-crop to aspect ratio
  if (opts.crop && origWidth > 0 && origHeight > 0) {
    const ratioMap: Record<string, [number, number]> = {
      "16:9": [16, 9],
      "4:3":  [4,  3],
      "1:1":  [1,  1],
    };
    const [wr, hr] = ratioMap[opts.crop];
    const targetRatio  = wr / hr;
    const currentRatio = origWidth / origHeight;

    if (Math.abs(currentRatio - targetRatio) > 0.02) {
      if (currentRatio > targetRatio) {
        // Image is wider than target → crop left and right
        const newWidth = Math.round(origHeight * targetRatio);
        const left     = Math.round((origWidth - newWidth) / 2);
        pipeline = pipeline.extract({ left, top: 0, width: newWidth, height: origHeight });
      } else {
        // Image is taller than target → crop top and bottom
        const newHeight = Math.round(origWidth / targetRatio);
        const top       = Math.round((origHeight - newHeight) / 2);
        pipeline = pipeline.extract({ left: 0, top, width: origWidth, height: newHeight });
      }
    }
  }

  // Return as WebP for maximum compression on derived images
  return pipeline.webp({ quality: 88 }).toBuffer();
}

// ── Aspect ratio helpers ──────────────────────────────────────────────────────

export const CROP_RATIOS = ["16:9", "4:3", "1:1"] as const;
export type CropRatio = (typeof CROP_RATIOS)[number];

export function cropRatioLabel(ratio: CropRatio): string {
  const labels: Record<CropRatio, string> = {
    "16:9": "Widescreen (16:9)",
    "4:3":  "Standard (4:3)",
    "1:1":  "Square (1:1)",
  };
  return labels[ratio];
}
