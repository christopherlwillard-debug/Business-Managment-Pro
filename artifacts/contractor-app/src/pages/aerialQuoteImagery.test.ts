import { describe, expect, it } from "vitest";
import { buildArcGisImageTileUrl, getStateImagerySource } from "./aerialQuoteImagery";

describe("Aerial Quote imagery sources", () => {
  it("matches supported state names and abbreviations", () => {
    expect(getStateImagerySource("Kentucky")?.stateCode).toBe("KY");
    expect(getStateImagerySource(" in ")?.stateCode).toBe("IN");
    expect(getStateImagerySource("Ill.")?.stateCode).toBe("IL");
    expect(getStateImagerySource("Ohio")).toBeNull();
    expect(getStateImagerySource(null)).toBeNull();
  });

  it("builds a Web Mercator image request for one 256px map tile", () => {
    const url = new URL(buildArcGisImageTileUrl(
      "https://example.test/ImageServer",
      { x: 0, y: 0, z: 0 },
    ));

    expect(url.pathname).toBe("/ImageServer/exportImage");
    expect(url.searchParams.get("bbox")).toBe("-20037508.343,-20037508.343,20037508.343,20037508.343");
    expect(url.searchParams.get("bboxSR")).toBe("3857");
    expect(url.searchParams.get("imageSR")).toBe("3857");
    expect(url.searchParams.get("size")).toBe("256,256");
    expect(url.searchParams.get("format")).toBe("png32");
  });
});
