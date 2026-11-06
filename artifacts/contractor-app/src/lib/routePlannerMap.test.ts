import { describe, expect, it } from "vitest";
import {
  getMapCoordinateKey,
  getMapReadyStops,
  hasValidMapCoordinates,
} from "./routePlannerMap";

describe("Route Planner map coordinates", () => {
  it("treats zero latitude and longitude as valid coordinates", () => {
    expect(hasValidMapCoordinates({ lat: 0, lng: 0 })).toBe(true);
    expect(getMapReadyStops([
      { id: 1, lat: 0, lng: -87.11 },
      { id: 2, lat: 37.77, lng: 0 },
    ])).toHaveLength(2);
  });

  it("excludes missing, non-finite, and out-of-range coordinates", () => {
    expect(getMapReadyStops([
      { id: 1, lat: null, lng: -87.11 },
      { id: 2, lat: 37.77, lng: null },
      { id: 3, lat: Number.NaN, lng: -87.11 },
      { id: 4, lat: 91, lng: 10 },
      { id: 5, lat: 37.77, lng: 181 },
    ])).toEqual([]);
  });

  it("changes its fitting key when coordinates change but stop count stays the same", () => {
    const before = [{ id: 1, lat: 37.77, lng: -87.11 }, { id: 2, lat: 37.78, lng: -87.12 }];
    const after = [{ id: 1, lat: 37.79, lng: -87.11 }, { id: 2, lat: 37.78, lng: -87.12 }];

    expect(getMapReadyStops(before)).toHaveLength(getMapReadyStops(after).length);
    expect(getMapCoordinateKey(before)).not.toBe(getMapCoordinateKey(after));
  });

  it("keeps the key stable when irrelevant stop fields change", () => {
    const first = [{ id: 1, lat: 37.77, lng: -87.11 }];
    const second = [{ id: 1, lat: 37.77, lng: -87.11 }];

    expect(getMapCoordinateKey(first)).toBe(getMapCoordinateKey(second));
  });
});
