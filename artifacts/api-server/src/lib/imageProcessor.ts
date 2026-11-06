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
 * Auto-rotates from EXIF so all uploaded variants are correctly oriented.
 */
/** Animated GIFs must keep their original bytes; a default Sharp conversion would flatten them to one frame. */
export function shouldGenerateWebsiteMediaVariants(mimetype: string): boolean {
  return mimetype.startsWith("image/") && mimetype !== "image/svg+xml" && mimetype !== "image/gif";
}

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
 * Returns the enhanced image as WebP. EXIF orientation is applied only when
 * the user selects the Straighten option.
 *
 * Originals must never be passed here — always operate on a copy.
 */
export async function applyEnhancements(
  inputBuffer: Buffer,
  opts: EnhancementOptions,
): Promise<Buffer> {
  // Step 1 — correct EXIF orientation only when explicitly requested.
  const source = sharp(inputBuffer);
  const base = await (opts.straighten ? source.rotate() : source).toBuffer();

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


/**
 * Validate untrusted enhancement options before they reach Sharp. In particular,
 * a truthy but unsupported crop value must never reach applyEnhancements,
 * where it would otherwise cause an opaque server error.
 */
export type EnhancementOptionsValidation =
  | { ok: true; options: EnhancementOptions }
  | { ok: false; error: string };

export function validateEnhancementOptions(value: unknown): EnhancementOptionsValidation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Enhancements must be an object." };
  }

  const input = value as Record<string, unknown>;
  for (const key of ["brighten", "straighten", "removeBackground"] as const) {
    if (input[key] !== undefined && typeof input[key] !== "boolean") {
      return { ok: false, error: `${key} must be true or false.` };
    }
  }

  if (input.removeBackground === true) {
    return { ok: false, error: "Background removal is not available yet." };
  }

  if (input.crop !== undefined && input.crop !== null &&
      !(CROP_RATIOS as readonly unknown[]).includes(input.crop)) {
    return { ok: false, error: "Crop must be 16:9, 4:3, or 1:1." };
  }

  const options: EnhancementOptions = {
    brighten: input.brighten as boolean | undefined,
    straighten: input.straighten as boolean | undefined,
    crop: input.crop as CropRatio | null | undefined,
  };

  if (!options.brighten && !options.straighten && !options.crop) {
    return { ok: false, error: "Choose at least one supported enhancement." };
  }

  return { ok: true, options };
}
