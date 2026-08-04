/**
 * Tests for the AI Color Assistant utilities:
 *   - colorExtraction: hexToRgb, rgbToHex, kMeans
 *   - colorPalette: hexToHsl, hslToHex round-trip, darken/lighten/desaturate/saturate/shiftHue, generateColorPalettes
 */

import { describe, it, expect } from "vitest";
import {
  hexToRgb, rgbToHex, kMeans,
  type RGB,
} from "../lib/colorExtraction";
import {
  hexToHsl, hslToHex,
  darken, lighten, desaturate, saturate, shiftHue,
  clampLightness, ensureSaturation,
  generateColorPalettes,
} from "../lib/colorPalette";

// ── colorExtraction helpers ───────────────────────────────────────────────────

describe("hexToRgb / rgbToHex", () => {
  it("converts pure red", () => {
    expect(hexToRgb("#ff0000")).toEqual({ r: 255, g: 0, b: 0 });
    expect(rgbToHex({ r: 255, g: 0, b: 0 })).toBe("#ff0000");
  });

  it("round-trips arbitrary colors", () => {
    const colors = ["#1a56db", "#b5935a", "#3d7a4e", "#7c3aed"];
    for (const hex of colors) {
      expect(rgbToHex(hexToRgb(hex))).toBe(hex);
    }
  });

  it("handles #000000 and #ffffff", () => {
    expect(hexToRgb("#000000")).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb("#ffffff")).toEqual({ r: 255, g: 255, b: 255 });
  });
});

describe("kMeans", () => {
  it("returns at most k clusters", () => {
    const pixels: RGB[] = Array.from({ length: 100 }, (_, i) => ({
      r: (i * 7) % 256, g: (i * 13) % 256, b: (i * 17) % 256,
    }));
    const result = kMeans(pixels, 5);
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it("returns empty for empty input", () => {
    expect(kMeans([], 5)).toEqual([]);
  });

  it("handles fewer pixels than k", () => {
    const pixels: RGB[] = [{ r: 100, g: 150, b: 200 }];
    const result = kMeans(pixels, 5);
    expect(result.length).toBe(1);
  });

  it("sorts clusters by count descending", () => {
    // 90 red pixels + 10 blue pixels — red cluster should be first
    const pixels: RGB[] = [
      ...Array.from({ length: 90 }, () => ({ r: 220, g: 30, b: 30 })),
      ...Array.from({ length: 10 }, () => ({ r: 30, g: 30, b: 220 })),
    ];
    const result = kMeans(pixels, 2);
    expect(result[0].count).toBeGreaterThan(result[result.length - 1].count);
  });
});

// ── colorPalette HSL helpers ──────────────────────────────────────────────────

describe("hexToHsl / hslToHex", () => {
  it("round-trips pure red", () => {
    const [h, s, l] = hexToHsl("#ff0000");
    expect(h).toBe(0);
    expect(s).toBe(100);
    expect(l).toBe(50);
    expect(hslToHex(0, 100, 50)).toBe("#ff0000");
  });

  it("round-trips arbitrary colors within ±2 per channel", () => {
    const inputs = ["#1a56db", "#b5935a", "#3d7a4e"];
    for (const hex of inputs) {
      const [h, s, l] = hexToHsl(hex);
      const back = hslToHex(h, s, l);
      // Allow ±2 per channel due to rounding
      const orig = { r: parseInt(hex.slice(1,3),16), g: parseInt(hex.slice(3,5),16), b: parseInt(hex.slice(5,7),16) };
      const conv = { r: parseInt(back.slice(1,3),16), g: parseInt(back.slice(3,5),16), b: parseInt(back.slice(5,7),16) };
      expect(Math.abs(orig.r - conv.r)).toBeLessThanOrEqual(2);
      expect(Math.abs(orig.g - conv.g)).toBeLessThanOrEqual(2);
      expect(Math.abs(orig.b - conv.b)).toBeLessThanOrEqual(2);
    }
  });

  it("returns 0 saturation for grey", () => {
    const [, s] = hexToHsl("#808080");
    expect(s).toBe(0);
  });
});

describe("darken / lighten", () => {
  it("darken produces a color with lower lightness", () => {
    const [, , l1] = hexToHsl("#1a56db");
    const [, , l2] = hexToHsl(darken("#1a56db", 10));
    expect(l2).toBeLessThan(l1);
  });

  it("lighten produces a color with higher lightness", () => {
    const [, , l1] = hexToHsl("#1a56db");
    const [, , l2] = hexToHsl(lighten("#1a56db", 10));
    expect(l2).toBeGreaterThan(l1);
  });

  it("darken clamps at 0", () => {
    const result = darken("#000000", 20);
    expect(hexToHsl(result)[2]).toBe(0);
  });

  it("lighten clamps at 100", () => {
    const result = lighten("#ffffff", 20);
    expect(hexToHsl(result)[2]).toBe(100);
  });
});

describe("desaturate / saturate", () => {
  it("desaturate lowers saturation", () => {
    const [, s1] = hexToHsl("#1a56db");
    const [, s2] = hexToHsl(desaturate("#1a56db", 20));
    expect(s2).toBeLessThan(s1);
  });

  it("saturate raises saturation", () => {
    const grey = hslToHex(200, 10, 50); // low-saturation color
    const [, s1] = hexToHsl(grey);
    const [, s2] = hexToHsl(saturate(grey, 30));
    expect(s2).toBeGreaterThan(s1);
  });
});

describe("shiftHue", () => {
  it("shifts hue by the given degrees", () => {
    const [h1] = hexToHsl("#1a56db"); // blue-ish
    const [h2] = hexToHsl(shiftHue("#1a56db", 120));
    const diff = ((h2 - h1) + 360) % 360;
    expect(diff).toBeCloseTo(120, 0);
  });

  it("wraps hue around 360", () => {
    const shifted = shiftHue(hslToHex(350, 80, 50), 30);
    const [h] = hexToHsl(shifted);
    expect(h).toBeCloseTo(20, 0);
  });
});

describe("clampLightness / ensureSaturation", () => {
  it("clampLightness constrains lightness to range", () => {
    const clamped = clampLightness("#1a56db", 40, 60);
    const [, , l] = hexToHsl(clamped);
    expect(l).toBeGreaterThanOrEqual(40);
    expect(l).toBeLessThanOrEqual(60);
  });

  it("ensureSaturation raises saturation to minimum", () => {
    const grey = hslToHex(200, 5, 50);
    const result = ensureSaturation(grey, 40);
    const [, s] = hexToHsl(result);
    expect(s).toBeGreaterThanOrEqual(40);
  });
});

// ── generateColorPalettes ─────────────────────────────────────────────────────

describe("generateColorPalettes", () => {
  const suggestions = generateColorPalettes(["#1a56db", "#b5935a"]);

  it("returns exactly 4 suggestions", () => {
    expect(suggestions).toHaveLength(4);
  });

  it("each suggestion has required fields", () => {
    for (const s of suggestions) {
      expect(s.id).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(s.description).toBeTruthy();
      expect(Array.isArray(s.swatchColors)).toBe(true);
      expect(s.swatchColors.length).toBe(5);
      expect(s.palette).toBeDefined();
    }
  });

  it("all IDs are unique", () => {
    const ids = suggestions.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("each palette includes at minimum brandColor and bgColor", () => {
    for (const s of suggestions) {
      expect(s.palette.brandColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(s.palette.bgColor).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("swatch colors are valid hex strings", () => {
    const hexRe = /^#[0-9a-f]{6}$/i;
    for (const s of suggestions) {
      for (const c of s.swatchColors) {
        expect(c).toMatch(hexRe);
      }
    }
  });

  it("palette colors are valid hex strings", () => {
    const hexRe = /^#[0-9a-f]{6}$/i;
    for (const s of suggestions) {
      for (const [, v] of Object.entries(s.palette)) {
        if (typeof v === "string") expect(v).toMatch(hexRe);
      }
    }
  });

  it("works with a single dominant color (fallback path)", () => {
    const result = generateColorPalettes(["#dc2626"]);
    expect(result).toHaveLength(4);
    expect(result[0].palette.brandColor).toBeTruthy();
  });

  it("works with an empty input array (uses built-in default)", () => {
    const result = generateColorPalettes([]);
    expect(result).toHaveLength(4);
  });

  it("light theme has a light background", () => {
    const light = suggestions.find(s => s.id === "light-professional")!;
    expect(light).toBeDefined();
    const [, , l] = hexToHsl(light.palette.bgColor!);
    expect(l).toBeGreaterThanOrEqual(90);
  });

  it("dark theme has a dark background", () => {
    const dark = suggestions.find(s => s.id === "deep-confident")!;
    expect(dark).toBeDefined();
    const [, , l] = hexToHsl(dark.palette.bgColor!);
    expect(l).toBeLessThanOrEqual(25);
  });
});
