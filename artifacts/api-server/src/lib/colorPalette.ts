/**
 * colorPalette.ts
 *
 * Builds 4 named ThemeOverrides suggestions from a set of dominant colors.
 * All color manipulation is done in HSL space with no external dependencies.
 *
 * The four styles are:
 *   1. "Light & Professional"  — white bg, brand primary as CTA
 *   2. "Deep & Confident"      — dark bg using a deep shade of the brand color
 *   3. "Bold Contrast"         — high-saturation brand color, complementary accent
 *   4. "Muted Professional"    — desaturated palette, navy/slate tones
 */

import type { ThemeOverrides } from "./colorPaletteTypes";
export type { ThemeOverrides };

// ── HSL ↔ Hex helpers ─────────────────────────────────────────────────────────

/** Parse a 6-digit hex string to [h (0–360), s (0–100), l (0–100)]. */
export function hexToHsl(hex: string): [number, number, number] {
  const c = hex.replace(/^#/, "");
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
    case g: h = ((b - r) / d + 2) / 6; break;
    case b: h = ((r - g) / d + 4) / 6; break;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1/6) return p + (q - p) * 6 * t;
  if (t < 1/2) return q;
  if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
  return p;
}

/** Encode [h (0–360), s (0–100), l (0–100)] to a #rrggbb hex string. */
export function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100, ln = l / 100, hn = h / 360;
  let r: number, g: number, b: number;
  if (sn === 0) {
    r = g = b = ln;
  } else {
    const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
    const p = 2 * ln - q;
    r = hue2rgb(p, q, hn + 1/3);
    g = hue2rgb(p, q, hn);
    b = hue2rgb(p, q, hn - 1/3);
  }
  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// ── Derived color helpers ─────────────────────────────────────────────────────

/** Clamp a value to [0, max]. */
function clamp(v: number, max: number): number { return Math.max(0, Math.min(max, v)); }

export function darken(hex: string, amount: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, s, clamp(l - amount, 100));
}

export function lighten(hex: string, amount: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, s, clamp(l + amount, 100));
}

export function desaturate(hex: string, amount: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, clamp(s - amount, 100), l);
}

export function saturate(hex: string, amount: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, clamp(s + amount, 100), l);
}

/** Shift hue by `degrees` (wraps around 360). */
export function shiftHue(hex: string, degrees: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex((h + degrees + 360) % 360, s, l);
}

/** Ensure a color has at least `minSat` saturation — useful for muted inputs. */
export function ensureSaturation(hex: string, minSat: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, Math.max(s, minSat), l);
}

/** Ensure a color's lightness is within [min, max]. */
export function clampLightness(hex: string, min: number, max: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, s, Math.max(min, Math.min(max, l)));
}

// ── Suggestion type ───────────────────────────────────────────────────────────

export interface ColorSuggestion {
  id: string;
  name: string;
  description: string;
  /** Ordered preview swatches: [primary, secondary, accent, bg, surface] */
  swatchColors: string[];
  palette: ThemeOverrides;
}

// ── Palette builder ───────────────────────────────────────────────────────────

/**
 * Generate 4 named ThemeOverrides suggestions from an array of extracted
 * dominant colors (most prominent first) or a single base color.
 *
 * @param dominantColors - Up to 5 hex colors sorted by dominance.
 * @returns 4 ColorSuggestion objects suitable for one-click application.
 */
export function generateColorPalettes(dominantColors: string[]): ColorSuggestion[] {
  // Ensure we always have at least one color to work with
  const colors = dominantColors.length > 0 ? dominantColors : ["#1a56db"];

  // Primary: most dominant color, clamped to useful saturation/lightness
  const primary = clampLightness(ensureSaturation(colors[0], 35), 25, 65);

  // Secondary: darker shade of primary
  const secondary = darken(primary, 12);

  // Accent: second dominant color if very different hue; else shifted +40°
  const [ph] = hexToHsl(primary);
  let accent: string;
  if (colors.length >= 2) {
    const [ah] = hexToHsl(colors[1]);
    const hueDiff = Math.abs(ph - ah);
    accent = hueDiff > 30 && hueDiff < 330 ? clampLightness(ensureSaturation(colors[1], 40), 35, 65) : shiftHue(primary, 40);
  } else {
    accent = shiftHue(primary, 40);
  }

  // Surface tint: very light version of primary
  const surfaceTint = hslToHex(...hexToHsl(primary).map((v, i) => i === 1 ? Math.min(v, 25) : i === 2 ? 96 : v) as [number, number, number]);

  // ── 1. Light & Professional ───────────────────────────────────────────────
  const light: ColorSuggestion = {
    id: "light-professional",
    name: "Light & Professional",
    description: "Clean white background with your brand color as the primary call-to-action. Works for almost any industry.",
    swatchColors: [primary, secondary, accent, "#ffffff", surfaceTint],
    palette: {
      brandColor:     primary,
      secondaryColor: secondary,
      accentColor:    accent,
      bgColor:        "#ffffff",
      surfaceColor:   surfaceTint,
      textColor:      "#111827",
      textMutedColor: "#6b7280",
      headerBgColor:  "#ffffff",
      headerTextColor: "#111827",
      footerBgColor:  secondary,
      footerTextColor: "#ffffff",
      footerLinkColor: lighten(accent, 20),
      focusRingColor: primary,
    },
  };

  // ── 2. Deep & Confident ───────────────────────────────────────────────────
  const deepBg    = clampLightness(desaturate(primary, 20), 10, 18);
  const deepSurf  = clampLightness(desaturate(primary, 10), 16, 24);
  const deepAccent = clampLightness(ensureSaturation(accent, 55), 55, 75);

  const dark: ColorSuggestion = {
    id: "deep-confident",
    name: "Deep & Confident",
    description: "Dark background rooted in your brand color — professional and striking for high-trust trades.",
    swatchColors: [lighten(primary, 10), deepAccent, accent, deepBg, deepSurf],
    palette: {
      brandColor:     lighten(primary, 10),
      secondaryColor: lighten(primary, 20),
      accentColor:    deepAccent,
      bgColor:        deepBg,
      surfaceColor:   deepSurf,
      textColor:      "#f3f4f6",
      textMutedColor: "#9ca3af",
      headerBgColor:  deepBg,
      headerTextColor: "#f3f4f6",
      footerBgColor:  darken(deepBg, 5),
      footerTextColor: "#e5e7eb",
      footerLinkColor: deepAccent,
      focusRingColor:  deepAccent,
    },
  };

  // ── 3. Bold Contrast ──────────────────────────────────────────────────────
  const bold      = saturate(clampLightness(primary, 35, 55), 20);
  const boldComp  = shiftHue(bold, 180); // complementary
  const boldSurf  = lighten(desaturate(bold, 60), 40);

  const boldSuggestion: ColorSuggestion = {
    id: "bold-contrast",
    name: "Bold Contrast",
    description: "High-saturation brand color with a complementary accent — eye-catching without being garish.",
    swatchColors: [bold, darken(bold, 15), boldComp, "#ffffff", boldSurf],
    palette: {
      brandColor:     bold,
      secondaryColor: darken(bold, 15),
      accentColor:    clampLightness(boldComp, 35, 55),
      bgColor:        "#ffffff",
      surfaceColor:   boldSurf,
      textColor:      "#0f172a",
      textMutedColor: "#475569",
      headerBgColor:  bold,
      headerTextColor: "#ffffff",
      footerBgColor:  darken(bold, 20),
      footerTextColor: "#ffffff",
      footerLinkColor: lighten(boldComp, 20),
      focusRingColor:  bold,
    },
  };

  // ── 4. Muted Professional ─────────────────────────────────────────────────
  const muted     = desaturate(clampLightness(primary, 30, 50), 40);
  const mutedSurf = hslToHex(hexToHsl(muted)[0], 8, 97);
  const mutedAcc  = shiftHue(saturate(muted, 30), 15);

  const mutedSuggestion: ColorSuggestion = {
    id: "muted-professional",
    name: "Muted Professional",
    description: "Understated palette — desaturated brand tones with clean typography. Ideal for premium or specialist contractors.",
    swatchColors: [muted, darken(muted, 12), mutedAcc, "#fafafa", mutedSurf],
    palette: {
      brandColor:     muted,
      secondaryColor: darken(muted, 12),
      accentColor:    mutedAcc,
      bgColor:        "#fafafa",
      surfaceColor:   mutedSurf,
      textColor:      "#1e293b",
      textMutedColor: "#64748b",
      headerBgColor:  "#fafafa",
      headerTextColor: "#1e293b",
      footerBgColor:  darken(muted, 18),
      footerTextColor: "#f1f5f9",
      footerLinkColor: lighten(mutedAcc, 25),
      focusRingColor:  muted,
    },
  };

  return [light, dark, boldSuggestion, mutedSuggestion];
}
