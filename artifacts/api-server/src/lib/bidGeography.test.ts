import { describe, expect, it } from "vitest";
import { classifyBidGeography } from "./bidGeography.js";

describe("classifyBidGeography", () => {
  it.each([
    ["Owensboro, KY", "local"],
    ["Daviess County, Kentucky", "local"],
    ["Hancock County KY", "local"],
    ["Western Kentucky", "regional"],
    ["Evansville, IN", "regional"],
    ["Southern Indiana", "regional"],
    ["Austin, TX", "outside_area"],
    ["Germany", "outside_area"],
    ["", "unknown"],
  ])("classifies %s as %s", (place, expected) => {
    expect(classifyBidGeography(place).geography).toBe(expected);
  });

  it("uses a local scraper's jurisdiction when the listing has no formal location", () => {
    const result = classifyBidGeography(null, "Daviess County Government");
    expect(result.geography).toBe("local");
    expect(result.placeOfPerformance).toBe("Owensboro / Daviess County, KY");
  });

  it("keeps an unrecognized location visible as unknown", () => {
    expect(classifyBidGeography("Somewhere, XYZ").geography).toBe("unknown");
  });
});