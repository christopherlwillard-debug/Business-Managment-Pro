import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { calculateJobMargin } from "./jobMargin";
import { JobMarginCard } from "../components/JobMarginCard";

describe("job margin", () => {
  it("calculates a positive margin and presents it in green", () => {
    const margin = calculateJobMargin(250, 1000);
    const markup = renderToStaticMarkup(JobMarginCard({ margin }));

    expect(margin).toBe(25);
    expect(markup).toContain("Margin");
    expect(markup).toContain("25%");
    expect(markup).toContain("emerald");
  });

  it("calculates a negative margin and presents it in red", () => {
    const margin = calculateJobMargin(-125, 1000);
    const markup = renderToStaticMarkup(JobMarginCard({ margin }));

    expect(margin).toBe(-12);
    expect(markup).toContain("Margin");
    expect(markup).toContain("-12%");
    expect(markup).toContain("red");
  });

  it("hides margin when collected revenue is zero", () => {
    const margin = calculateJobMargin(250, 0);

    expect(margin).toBeNull();
    expect(JobMarginCard({ margin })).toBeNull();
  });
});