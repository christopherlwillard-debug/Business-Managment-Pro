import { describe, expect, it } from "vitest";
import { aerialMapGeometryNote, getAerialMapGeometryJson } from "./aerialQuoteMapUtils";

describe("aerial map measurement geometry", () => {
  it("keeps polygon and line outlines with their saved measurement entries", () => {
    const polygon = [[37.77, -87.11], [37.771, -87.11], [37.771, -87.109]] as [number, number][];
    const line = [[37.77, -87.11], [37.771, -87.109]] as [number, number][];

    const restored = JSON.parse(getAerialMapGeometryJson([
      { notes: aerialMapGeometryNote("area", polygon) },
      { notes: aerialMapGeometryNote("length", line) },
    ]));

    expect(restored).toEqual({ polygons: [polygon], lines: [line] });
  });

  it("ignores malformed or unrelated entry notes", () => {
    const restored = JSON.parse(getAerialMapGeometryJson([
      { notes: "ordinary measurement note" },
      { notes: "aerial-map-geometry:{not-json" },
    ]));

    expect(restored).toEqual({ polygons: [], lines: [] });
  });
});
