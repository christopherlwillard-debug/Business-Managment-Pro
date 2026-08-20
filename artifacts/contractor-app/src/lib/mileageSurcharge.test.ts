import { describe, expect, it } from "vitest";
import {
  calculateSurchargeDays,
  isMileageSurchargeLine,
  mergeMileageSurchargeLine,
} from "./mileageSurcharge";

describe("mileage surcharge draft behavior", () => {
  const surcharge = {
    description: "Mileage surcharge — 60.0 mi route",
    quantity: 3,
    unitPrice: 150,
  };

  it("uses inclusive dates and safely defaults incomplete or invalid dates to one day", () => {
    expect(calculateSurchargeDays("2026-08-20", "2026-08-22")).toBe(3);
    expect(calculateSurchargeDays("2026-08-20", null)).toBe(1);
    expect(calculateSurchargeDays("not-a-date", "2026-08-22")).toBe(1);
  });

  it("leaves draft lines unchanged when the prompt is declined", () => {
    const lines = [{ description: "Labor", quantity: 1, unitPrice: 500 }];
    expect(mergeMileageSurchargeLine(lines, null)).toBe(lines);
  });

  it("adds exactly one accepted line across repeated draft refreshes", () => {
    const initial = [{ description: "Labor", quantity: 1, unitPrice: 500 }];
    const accepted = mergeMileageSurchargeLine(initial, surcharge);
    const refreshed = mergeMileageSurchargeLine(accepted, surcharge);

    expect(refreshed).toEqual([...initial, surcharge]);
    expect(refreshed.filter(isMileageSurchargeLine)).toHaveLength(1);
    expect(refreshed.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)).toBe(950);
  });
});