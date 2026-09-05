import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MileIQImportPreviewSummary } from "./MileIQImportPreviewSummary";

describe("MileIQImportPreviewSummary", () => {
  it("shows the CSV totals and explains how to recover omitted unclassified drives", () => {
    const markup = renderToStaticMarkup(
      <MileIQImportPreviewSummary tripCount={146} totalMiles={2938} />,
    );

    expect(markup).toContain("146 detailed trips");
    expect(markup).toContain("2,938.0 miles");
    expect(markup).toContain("classify any outstanding drives");
    expect(markup).toContain("Unclassified drives may be left out of the CSV");
  });
});