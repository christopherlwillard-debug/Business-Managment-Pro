import { describe, expect, it } from "vitest";
import { buildChecklistShareTitle, escapeHtml } from "./checklistSharePreview";

describe("checklist share preview", () => {
  it("uses the work location name and address for the preview title", () => {
    expect(buildChecklistShareTitle({
      locationName: "Pope",
      address: "6453 N County Road 450 W",
      city: "Richland",
      state: "IN",
      templateName: "Manufactured Home Trim-Out",
    })).toBe("Pope — 6453 N County Road 450 W, Richland IN");
  });

  it("falls back to the checklist name when location details are missing", () => {
    expect(buildChecklistShareTitle({
      locationName: null,
      address: null,
      city: null,
      state: null,
      templateName: "Manufactured Home Trim-Out",
    })).toBe("Manufactured Home Trim-Out");
  });

  it("escapes user-provided metadata before placing it in HTML", () => {
    expect(escapeHtml(`Pope & Sons <Trim-Out>`)).toBe("Pope &amp; Sons &lt;Trim-Out&gt;");
  });
});