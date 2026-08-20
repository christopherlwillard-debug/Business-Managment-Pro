/**
 * Unit tests for computeTaxEstimate, calcFederalIncomeTax, and getTaxYearData.
 *
 * All pure-function tests — no DB, no HTTP, no mocking required.
 * Covers: zero income, standard-deduction threshold, each bracket boundary,
 * OCC calculation, total reconciliation, and year-specific behavior.
 */
import { describe, it, expect } from "vitest";
import {
  computeTaxEstimate,
  calcFederalIncomeTax,
  getTaxYearData,
  OWENSBORO_OCC_RATE,
  getTaxAssumptions,
} from "./tax-estimate.js";

describe("tax assumptions", () => {
  it("uses documented defaults and jurisdiction context", () => {
    const a = getTaxAssumptions(2026);
    expect(a.federalSeBase).toBe(0.9235);
    expect(a.mealDeductionRate).toBe(0.5);
    expect(a.jurisdiction).toEqual({ federal: "US", state: "KY", local: "Owensboro" });
    expect(a.source).toBe("default");
  });

  it("applies business overrides by tax year without changing another year", () => {
    const config = {
      defaults: { kentuckyIncomeRate: 0.035, mealDeductionRate: 0.8 },
      byYear: { "2026": { kentuckyIncomeRate: 0.04 } },
    };
    expect(getTaxAssumptions(2026, config).kentuckyIncomeRate).toBe(0.04);
    expect(getTaxAssumptions(2026, config).mealDeductionRate).toBe(0.8);
    expect(getTaxAssumptions(2025, config).kentuckyIncomeRate).toBe(0.035);
  });

  it("uses an overridden meal percentage in the estimate metadata", () => {
    const result = computeTaxEstimate(50_000, 0, 2026, { defaults: { mealDeductionRate: 0.8 } });
    expect(result.assumptionsUsed.mealDeductionRate).toBe(0.8);
    expect(result.assumptionsUsed.source).toBe("business_override");
  });
});

// ── getTaxYearData ─────────────────────────────────────────────────────────────

describe("getTaxYearData — year lookup and clamping", () => {
  it("returns 2026 data for year 2026", () => {
    const d = getTaxYearData(2026);
    expect(d.standardDeduction).toBe(16_100);
    expect(d.brackets[0].ceiling).toBe(12_400);
  });

  it("returns 2025 data for year 2025", () => {
    const d = getTaxYearData(2025);
    expect(d.standardDeduction).toBe(15_000);
    expect(d.brackets[0].ceiling).toBe(11_925);
  });

  it("returns 2024 data for year 2024", () => {
    const d = getTaxYearData(2024);
    expect(d.standardDeduction).toBe(14_600);
  });

  it("returns 2023 data for year 2023", () => {
    const d = getTaxYearData(2023);
    expect(d.standardDeduction).toBe(13_850);
  });

  it("returns 2022 data for year 2022", () => {
    const d = getTaxYearData(2022);
    expect(d.standardDeduction).toBe(12_950);
  });

  it("clamps years before 2022 to 2022 data", () => {
    const d = getTaxYearData(2019);
    expect(d.standardDeduction).toBe(12_950); // 2022 data
  });

  it("clamps years after 2026 to 2026 data", () => {
    const d = getTaxYearData(2030);
    expect(d.standardDeduction).toBe(16_100); // 2026 data
  });

  it("each year's brackets are in strictly ascending order", () => {
    for (const year of [2022, 2023, 2024, 2025, 2026]) {
      const { brackets } = getTaxYearData(year);
      let prev = 0;
      for (const b of brackets) {
        expect(b.ceiling).toBeGreaterThan(prev);
        prev = b.ceiling === Infinity ? prev : b.ceiling;
      }
    }
  });

  it("each year's last bracket has ceiling Infinity", () => {
    for (const year of [2022, 2023, 2024, 2025, 2026]) {
      const { brackets } = getTaxYearData(year);
      expect(brackets[brackets.length - 1].ceiling).toBe(Infinity);
    }
  });
});

// ── calcFederalIncomeTax ───────────────────────────────────────────────────────

describe("calcFederalIncomeTax — 2026 progressive brackets", () => {
  const Y = 2026;

  it("returns 0 for zero income", () => {
    expect(calcFederalIncomeTax(0, Y)).toBe(0);
  });

  it("returns 0 for negative income", () => {
    expect(calcFederalIncomeTax(-5000, Y)).toBe(0);
  });

  it("taxes $1 at 10%", () => {
    expect(calcFederalIncomeTax(1, Y)).toBeCloseTo(0.10, 10);
  });

  it("taxes income entirely within the 10% bracket correctly", () => {
    // 2026: 10% ceiling = $12,400; $10,000 is fully within
    expect(calcFederalIncomeTax(10_000, Y)).toBeCloseTo(10_000 * 0.10, 10);
  });

  it("taxes income at the exact 10% bracket ceiling ($12,400)", () => {
    expect(calcFederalIncomeTax(12_400, Y)).toBeCloseTo(12_400 * 0.10, 10);
  });

  it("crosses into 12% bracket correctly at $12,401", () => {
    const expected = 12_400 * 0.10 + 1 * 0.12;
    expect(calcFederalIncomeTax(12_401, Y)).toBeCloseTo(expected, 10);
  });

  it("taxes income spanning 10% and 12% brackets", () => {
    // $40,000: first $12,400 @ 10%, next $27,600 @ 12%
    const expected = 12_400 * 0.10 + (40_000 - 12_400) * 0.12;
    expect(calcFederalIncomeTax(40_000, Y)).toBeCloseTo(expected, 10);
  });

  it("crosses into 22% bracket at $50,401", () => {
    const expected = 12_400 * 0.10 + (50_400 - 12_400) * 0.12 + 1 * 0.22;
    expect(calcFederalIncomeTax(50_401, Y)).toBeCloseTo(expected, 10);
  });

  it("taxes income spanning 10%, 12%, and 22% brackets", () => {
    const expected =
      12_400 * 0.10 +
      (50_400 - 12_400) * 0.12 +
      (80_000 - 50_400) * 0.22;
    expect(calcFederalIncomeTax(80_000, Y)).toBeCloseTo(expected, 10);
  });

  it("taxes income at the 22% ceiling ($105,700)", () => {
    const expected =
      12_400 * 0.10 +
      (50_400 - 12_400) * 0.12 +
      (105_700 - 50_400) * 0.22;
    expect(calcFederalIncomeTax(105_700, Y)).toBeCloseTo(expected, 10);
  });

  it("crosses into 24% bracket", () => {
    const income = 150_000;
    const expected =
      12_400 * 0.10 +
      (50_400 - 12_400) * 0.12 +
      (105_700 - 50_400) * 0.22 +
      (income - 105_700) * 0.24;
    expect(calcFederalIncomeTax(income, Y)).toBeCloseTo(expected, 10);
  });
});

describe("calcFederalIncomeTax — year-specific bracket differences", () => {
  it("produces a lower tax for the same income in 2025 vs 2026 (lower brackets)", () => {
    // 2025 first bracket ceiling is $11,925 vs $12,400 in 2026
    // For $50,000 taxable income, more income falls in the lower brackets in 2026
    const tax2025 = calcFederalIncomeTax(50_000, 2025);
    const tax2026 = calcFederalIncomeTax(50_000, 2026);
    expect(tax2025).toBeGreaterThan(tax2026);
  });

  it("uses 2022 brackets for year 2022 (smallest bracket ceilings)", () => {
    // 2022 first bracket ceiling is $10,275
    const d = getTaxYearData(2022);
    const firstCeiling = d.brackets[0].ceiling;
    const expected = firstCeiling * 0.10 + (20_000 - firstCeiling) * 0.12;
    expect(calcFederalIncomeTax(20_000, 2022)).toBeCloseTo(expected, 10);
  });
});

// ── computeTaxEstimate ────────────────────────────────────────────────────────

describe("computeTaxEstimate — full liability calculation", () => {
  it("returns all zeros for zero net profit and no Owensboro gross", () => {
    const r = computeTaxEstimate(0, 0, 2026);
    expect(r.federalSE).toBe(0);
    expect(r.seDeduction).toBe(0);
    expect(r.federalIncome).toBe(0);
    expect(r.kyState).toBe(0);
    expect(r.occ).toBe(0);
    expect(r.total).toBe(0);
    expect(r.totalWithoutFederalIncome).toBe(0);
  });

  it("returns all zeros for negative net profit", () => {
    const r = computeTaxEstimate(-10_000, 0, 2026);
    expect(r.federalSE).toBe(0);
    expect(r.federalIncome).toBe(0);
    expect(r.kyState).toBe(0);
    expect(r.total).toBe(0);
  });

  it("produces zero federal income when net profit is below the standard-deduction threshold", () => {
    // At $10,000 profit, federalTaxableIncome is zero after SD subtraction
    const r = computeTaxEstimate(10_000, 0, 2026);
    expect(r.federalIncome).toBe(0);
    expect(r.federalTaxableIncome).toBe(0);
  });

  it("standardDeduction in result matches the selected year", () => {
    expect(computeTaxEstimate(0, 0, 2026).standardDeduction).toBe(16_100);
    expect(computeTaxEstimate(0, 0, 2025).standardDeduction).toBe(15_000);
    expect(computeTaxEstimate(0, 0, 2024).standardDeduction).toBe(14_600);
    expect(computeTaxEstimate(0, 0, 2022).standardDeduction).toBe(12_950);
  });

  it("computes SE tax at 15.3% × 92.35% of net profit", () => {
    const netProfit = 50_000;
    const expected = netProfit * 0.9235 * 0.153;
    expect(computeTaxEstimate(netProfit, 0, 2026).federalSE).toBeCloseTo(expected, 10);
  });

  it("seDeduction is exactly half of SE tax", () => {
    const r = computeTaxEstimate(50_000, 0, 2026);
    expect(r.seDeduction).toBeCloseTo(r.federalSE * 0.5, 10);
  });

  it("federalTaxableIncome = max(0, netProfit - seDeduction - standardDeduction)", () => {
    const netProfit = 80_000;
    const r = computeTaxEstimate(netProfit, 0, 2026);
    const expected = Math.max(0, netProfit - r.seDeduction - 16_100);
    expect(r.federalTaxableIncome).toBeCloseTo(expected, 10);
  });

  it("computes Kentucky state tax at 4% of net profit", () => {
    const netProfit = 60_000;
    expect(computeTaxEstimate(netProfit, 0, 2026).kyState).toBeCloseTo(netProfit * 0.04, 10);
  });

  it("computes Owensboro OCC at 1.39% of owensboroGross", () => {
    const r = computeTaxEstimate(0, 10_000, 2026);
    expect(r.occ).toBeCloseTo(10_000 * OWENSBORO_OCC_RATE, 10);
  });

  it("total = federalSE + federalIncome + kyState + occ", () => {
    const r = computeTaxEstimate(100_000, 5_000, 2026);
    expect(r.total).toBeCloseTo(r.federalSE + r.federalIncome + r.kyState + r.occ, 10);
  });

  it("totalWithoutFederalIncome = total - federalIncome", () => {
    const r = computeTaxEstimate(100_000, 5_000, 2026);
    expect(r.totalWithoutFederalIncome).toBeCloseTo(r.total - r.federalIncome, 10);
  });

  it("OCC is zero when owensboroGross is zero", () => {
    expect(computeTaxEstimate(50_000, 0, 2026).occ).toBe(0);
  });

  it("federal income tax activates once netProfit clears the standard deduction", () => {
    const low = computeTaxEstimate(10_000, 0, 2026);
    const high = computeTaxEstimate(100_000, 0, 2026);
    expect(low.federalIncome).toBe(0);
    expect(high.federalIncome).toBeGreaterThan(0);
  });

  it("year-end total liability includes OCC (regression: OCC was omitted before this fix)", () => {
    const r = computeTaxEstimate(50_000, 20_000, 2026);
    const sumOfParts = r.federalSE + r.federalIncome + r.kyState + r.occ;
    expect(r.total).toBeCloseTo(sumOfParts, 10);
    expect(r.occ).toBeGreaterThan(0);
  });

  it("2025 report uses 2025 standard deduction ($15,000) and different brackets", () => {
    const r2025 = computeTaxEstimate(80_000, 0, 2025);
    const r2026 = computeTaxEstimate(80_000, 0, 2026);
    expect(r2025.standardDeduction).toBe(15_000);
    expect(r2026.standardDeduction).toBe(16_100);
    // 2026 has higher standard deduction → lower taxable income → lower or equal federal tax
    expect(r2026.federalIncome).toBeLessThanOrEqual(r2025.federalIncome);
  });

  it("spot-check: netProfit=$80,000, owensboroGross=$5,000, year=2026", () => {
    const netProfit = 80_000;
    const owensboroGross = 5_000;
    const r = computeTaxEstimate(netProfit, owensboroGross, 2026);

    const expectedSE = netProfit * 0.9235 * 0.153;          // ~11,303.64
    const expectedSEDed = expectedSE * 0.5;
    const expectedTaxable = Math.max(0, netProfit - expectedSEDed - 16_100); // ~58,248
    // $58,248 spans 10% (→$12,400), 12% ($12,401–$50,400), and 22% ($50,401–$58,248)
    const expectedFederal =
      12_400 * 0.10 +
      (50_400 - 12_400) * 0.12 +
      (expectedTaxable - 50_400) * 0.22;
    const expectedKY = netProfit * 0.04;
    const expectedOCC = owensboroGross * 0.0139;

    expect(r.federalSE).toBeCloseTo(expectedSE, 6);
    expect(r.federalIncome).toBeCloseTo(expectedFederal, 6);
    expect(r.kyState).toBeCloseTo(expectedKY, 6);
    expect(r.occ).toBeCloseTo(expectedOCC, 6);
    expect(r.total).toBeCloseTo(expectedSE + expectedFederal + expectedKY + expectedOCC, 6);
  });

  it("spot-check: netProfit=$50,000, year=2025 (prior year report uses correct SD)", () => {
    const netProfit = 50_000;
    const r = computeTaxEstimate(netProfit, 0, 2025);

    const expectedSE = netProfit * 0.9235 * 0.153;
    const expectedSEDed = expectedSE * 0.5;
    const expectedTaxable = Math.max(0, netProfit - expectedSEDed - 15_000); // 2025 SD
    // 2025 brackets: 10%→$11,925; 12%→$48,475
    const expectedFederal =
      expectedTaxable <= 11_925
        ? expectedTaxable * 0.10
        : 11_925 * 0.10 + (expectedTaxable - 11_925) * 0.12;

    expect(r.standardDeduction).toBe(15_000);
    expect(r.federalIncome).toBeCloseTo(expectedFederal, 6);
  });
});
