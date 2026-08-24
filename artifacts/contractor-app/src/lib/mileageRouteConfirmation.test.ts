import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MileageRouteConfirmation } from "../components/MileageRouteConfirmation";
import { clearRouteDistanceConfirmation, confirmRouteDistance } from "./mileageRouteConfirmation";

describe("mileage route confirmation", () => {
  it("shows confirmation after a successful route distance calculation", () => {
    const confirmedMiles = confirmRouteDistance(18.36);
    const markup = renderToStaticMarkup(createElement(MileageRouteConfirmation, { miles: confirmedMiles }));

    expect(markup).toContain("18.4 mi via driving route");
    expect(markup).toContain("from address lookup");
  });

  it("clears confirmation when miles are manually edited", () => {
    const confirmedMiles = confirmRouteDistance(18.3);
    const editedMiles = clearRouteDistanceConfirmation();

    expect(confirmedMiles).toBe(18.3);
    expect(editedMiles).toBeNull();
    expect(MileageRouteConfirmation({ miles: editedMiles })).toBeNull();
  });

  it.each(["start address", "end address"])("clears stale confirmation when the %s changes", () => {
    const confirmedMiles = confirmRouteDistance(18.3);
    const clearedMiles = clearRouteDistanceConfirmation();

    expect(confirmedMiles).toBe(18.3);
    expect(clearedMiles).toBeNull();
    expect(MileageRouteConfirmation({ miles: clearedMiles })).toBeNull();
  });
});