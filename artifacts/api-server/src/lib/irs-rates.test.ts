import { describe, expect, it } from "vitest";
import { calculateMileageDeduction, getIrsMileageRate, getIrsRateForDate, summarizeMileageRecords } from "./irs-rates";

describe("authoritative IRS mileage rate engine", () => {
  it("uses the exact 2026 split boundary", () => {
    expect(getIrsRateForDate("2026-06-30")).toBe(0.725);
    expect(getIrsRateForDate("2026-07-01")).toBe(0.760);
  });

  it("selects historical rates by effective date", () => {
    expect(getIrsRateForDate("2025-12-31")).toBe(0.700);
    expect(getIrsRateForDate("2024-01-01")).toBe(0.670);
    expect(getIrsRateForDate("2022-06-30")).toBe(0.585);
    expect(getIrsRateForDate("2022-07-01")).toBe(0.625);
  });

  it("does not create a deduction for personal or zero-mile trips", () => {
    expect(calculateMileageDeduction(100, "personal", "2026-07-01")).toEqual({ rate: 0.760, deduction: 0 });
    expect(calculateMileageDeduction(0, "business", "2026-07-01")).toEqual({ rate: 0.760, deduction: 0 });
  });

  it("keeps the display helper aligned with the latest rate in a year", () => {
    expect(getIrsMileageRate(2026)).toBe(0.760);
    expect(getIrsMileageRate(2025)).toBe(0.700);
  });

  it("keeps split-year rates separate and sums only their deductions", () => {
    const result = summarizeMileageRecords([
      { date: "2026-06-30", miles: "3113.80", classification: "business" },
      { date: "2026-07-01", miles: "2394.40", classification: "business" },
    ]);

    expect(result.totalMiles).toBeCloseTo(5508.2, 2);
    expect(result.totalDeduction).toBeCloseTo(4077.249, 3);
    expect(result.ratePerMile).toBeNull();
    expect(result.ratePeriods).toEqual([
      expect.objectContaining({
        periodStart: "2026-01-01",
        periodEnd: "2026-06-30",
        rate: 0.725,
        miles: 3113.8,
      }),
      expect.objectContaining({
        periodStart: "2026-07-01",
        periodEnd: "2026-12-31",
        rate: 0.760,
        miles: 2394.4,
      }),
    ]);
  });
});