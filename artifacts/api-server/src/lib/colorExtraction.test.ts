import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { extractDominantColors } from "./colorExtraction";

describe("extractDominantColors", () => {
  it("extracts colors from a valid small image", async () => {
    const image = await sharp({
      create: { width: 12, height: 12, channels: 3, background: "#336699" },
    }).png().toBuffer();
    const colors = await extractDominantColors(image);
    expect(colors.length).toBeGreaterThan(0);
    expect(colors[0]).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("rejects empty and oversized input buffers before image decoding", async () => {
    await expect(extractDominantColors(Buffer.alloc(0))).rejects.toThrow("between 1 byte and 5 MB");
    await expect(extractDominantColors(Buffer.alloc(5 * 1024 * 1024 + 1))).rejects.toThrow("between 1 byte and 5 MB");
  });
});
