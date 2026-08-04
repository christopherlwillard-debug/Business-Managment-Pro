/**
 * colorExtraction.ts
 *
 * Pure Node.js dominant-color extraction using sharp (already a project dep).
 * No Puppeteer, no canvas — works identically in dev and production.
 *
 * Algorithm:
 *   1. Resize the input image to a 60×60 thumbnail.
 *   2. Convert to raw 3-channel RGB (strips alpha).
 *   3. Filter out near-white (avg > 240) and near-black (avg < 15) pixels,
 *      which are almost always background fill, not brand colors.
 *   4. Run k-means (k=6, 12 iterations) to cluster similar colors.
 *   5. Sort clusters by size and return the top 5 as hex strings.
 */

import sharp from "sharp";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RGB { r: number; g: number; b: number }

// ── Helpers ───────────────────────────────────────────────────────────────────

export function rgbToHex({ r, g, b }: RGB): string {
  return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
}

export function hexToRgb(hex: string): RGB {
  const clean = hex.replace(/^#/, "");
  const n = parseInt(clean.length === 3 ? clean.split("").map(c => c + c).join("") : clean, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function euclidean(a: RGB, b: RGB): number {
  return (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2;
}

// ── K-means clustering ────────────────────────────────────────────────────────

/**
 * Simple k-means on RGB pixels.
 * Returns clusters sorted by descending pixel count.
 */
export function kMeans(
  pixels: RGB[],
  k: number,
  iterations = 12,
): { color: RGB; count: number }[] {
  if (pixels.length === 0) return [];
  k = Math.min(k, pixels.length);

  // Seed centroids from evenly-spaced samples
  const step = Math.floor(pixels.length / k);
  let centroids: RGB[] = Array.from({ length: k }, (_, i) => ({ ...pixels[i * step] }));

  for (let iter = 0; iter < iterations; iter++) {
    const sums  = Array.from({ length: k }, () => ({ r: 0, g: 0, b: 0, n: 0 }));

    for (const px of pixels) {
      let minD = Infinity, ci = 0;
      for (let i = 0; i < k; i++) {
        const d = euclidean(px, centroids[i]);
        if (d < minD) { minD = d; ci = i; }
      }
      sums[ci].r += px.r; sums[ci].g += px.g; sums[ci].b += px.b; sums[ci].n++;
    }

    centroids = sums.map((s, i) =>
      s.n === 0
        ? centroids[i]
        : { r: Math.round(s.r / s.n), g: Math.round(s.g / s.n), b: Math.round(s.b / s.n) },
    );
  }

  // Final assignment for counts
  const counts = new Array<number>(k).fill(0);
  for (const px of pixels) {
    let minD = Infinity, ci = 0;
    for (let i = 0; i < k; i++) {
      const d = euclidean(px, centroids[i]);
      if (d < minD) { minD = d; ci = i; }
    }
    counts[ci]++;
  }

  return centroids
    .map((color, i) => ({ color, count: counts[i] }))
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Extract the top 5 dominant colors from an image buffer.
 * Near-white and near-black pixels are excluded so background fill
 * doesn't dominate the palette.
 *
 * @returns Hex color strings sorted by dominance (most common first).
 */
export async function extractDominantColors(buffer: Buffer): Promise<string[]> {
  const raw = await sharp(buffer)
    .resize(60, 60, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer();

  const pixels: RGB[] = [];
  for (let i = 0; i < raw.length; i += 3) {
    const r = raw[i], g = raw[i + 1], b = raw[i + 2];
    const avg = (r + g + b) / 3;
    // Discard near-white (background) and near-black (shadow/outline)
    if (avg > 240 || avg < 15) continue;
    pixels.push({ r, g, b });
  }

  // If every pixel was filtered (e.g. a pure black & white logo), include all
  if (pixels.length < 10) {
    for (let i = 0; i < raw.length; i += 3) {
      pixels.push({ r: raw[i], g: raw[i + 1], b: raw[i + 2] });
    }
  }

  const clusters = kMeans(pixels, 6, 12);
  return clusters.slice(0, 5).map(c => rgbToHex(c.color));
}
