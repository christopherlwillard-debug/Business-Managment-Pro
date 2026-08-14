/**
 * tax-estimate.ts — Pure tax calculation helpers.
 *
 * All constants and functions here are side-effect-free so they can be
 * unit-tested without any database or HTTP setup.
 *
 * Bracket and standard-deduction data are indexed by tax year.
 * Sources: IRS Rev. Proc. 2021-45 (2022), 2022-38 (2023), 2023-34 (2024),
 *          2024-40 (2025), 2025-61 (2026). Single-filer thresholds only.
 */

// ── Per-year tax constants ─────────────────────────────────────────────────────

interface TaxYearData {
  /** Standard deduction for a single filer (USD). */
  standardDeduction: number;
  /**
   * Progressive bracket ceilings paired with the marginal rate that applies
   * up to that ceiling. The final entry must have ceiling Infinity.
   */
  brackets: ReadonlyArray<{ rate: number; ceiling: number }>;
}

const TAX_YEAR_DATA: Record<number, TaxYearData> = {
  2022: {
    standardDeduction: 12_950,
    brackets: [
      { rate: 0.10, ceiling: 10_275 },
      { rate: 0.12, ceiling: 41_775 },
      { rate: 0.22, ceiling: 89_075 },
      { rate: 0.24, ceiling: 170_050 },
      { rate: 0.32, ceiling: 215_950 },
      { rate: 0.35, ceiling: 539_900 },
      { rate: 0.37, ceiling: Infinity },
    ],
  },
  2023: {
    standardDeduction: 13_850,
    brackets: [
      { rate: 0.10, ceiling: 11_000 },
      { rate: 0.12, ceiling: 44_725 },
      { rate: 0.22, ceiling: 95_375 },
      { rate: 0.24, ceiling: 182_050 },
      { rate: 0.32, ceiling: 231_250 },
      { rate: 0.35, ceiling: 578_125 },
      { rate: 0.37, ceiling: Infinity },
    ],
  },
  2024: {
    standardDeduction: 14_600,
    brackets: [
      { rate: 0.10, ceiling: 11_600 },
      { rate: 0.12, ceiling: 47_150 },
      { rate: 0.22, ceiling: 100_525 },
      { rate: 0.24, ceiling: 191_950 },
      { rate: 0.32, ceiling: 243_725 },
      { rate: 0.35, ceiling: 609_350 },
      { rate: 0.37, ceiling: Infinity },
    ],
  },
  2025: {
    standardDeduction: 15_000,
    brackets: [
      { rate: 0.10, ceiling: 11_925 },
      { rate: 0.12, ceiling: 48_475 },
      { rate: 0.22, ceiling: 103_350 },
      { rate: 0.24, ceiling: 197_300 },
      { rate: 0.32, ceiling: 250_525 },
      { rate: 0.35, ceiling: 626_350 },
      { rate: 0.37, ceiling: Infinity },
    ],
  },
  2026: {
    standardDeduction: 16_100,
    brackets: [
      { rate: 0.10, ceiling: 12_400 },
      { rate: 0.12, ceiling: 50_400 },
      { rate: 0.22, ceiling: 105_700 },
      { rate: 0.24, ceiling: 201_775 },
      { rate: 0.32, ceiling: 256_225 },
      { rate: 0.35, ceiling: 640_600 },
      { rate: 0.37, ceiling: Infinity },
    ],
  },
};

/** Minimum known tax year. Years before this fall back to 2022 data. */
const MIN_KNOWN_YEAR = 2022;
/** Maximum known tax year. Years after this fall back to the most recent known data. */
const MAX_KNOWN_YEAR = 2026;

/**
 * Return the tax year data for `year`, clamped to the known range.
 * Export so callers can read standardDeduction and brackets for UI labels.
 */
export function getTaxYearData(year: number): TaxYearData {
  const clamped = Math.min(Math.max(year, MIN_KNOWN_YEAR), MAX_KNOWN_YEAR);
  return TAX_YEAR_DATA[clamped];
}

/** 1.39% Owensboro occupational license tax rate (unchanged across years). */
export const OWENSBORO_OCC_RATE = 0.0139;

/**
 * Apply the given year's progressive federal income tax brackets
 * to post-deduction taxable income.
 *
 * The caller is responsible for subtracting all applicable deductions
 * (SE deduction, standard deduction, etc.) before passing the value in.
 */
export function calcFederalIncomeTax(taxableIncome: number, year: number): number {
  if (taxableIncome <= 0) return 0;
  const { brackets } = getTaxYearData(year);
  let tax = 0;
  let remaining = taxableIncome;
  let prevCeiling = 0;
  for (const bracket of brackets) {
    if (remaining <= 0) break;
    const bracketWidth = bracket.ceiling - prevCeiling;
    const taxable = Math.min(remaining, bracketWidth);
    tax += taxable * bracket.rate;
    remaining -= taxable;
    prevCeiling = bracket.ceiling;
  }
  return tax;
}

export interface TaxEstimate {
  /** IRS self-employment tax: netProfit × 92.35% × 15.3% */
  federalSE: number;
  /** IRS half-SE deduction that reduces federal income taxable base */
  seDeduction: number;
  /** Standard deduction for the selected tax year */
  standardDeduction: number;
  /** Federal taxable income after SE deduction and standard deduction */
  federalTaxableIncome: number;
  /** Progressive federal income tax on federalTaxableIncome (year-specific brackets) */
  federalIncome: number;
  /** Kentucky flat income tax: netProfit × 4% */
  kyState: number;
  /** Owensboro occupational/license tax: owensboroGross × 1.39% */
  occ: number;
  /** Full liability: federalSE + federalIncome + kyState + occ */
  total: number;
  /**
   * Partial total excluding federal income tax.
   * Used by /accounting and /business-reserve until Task #1872 adds
   * federal income to the required reserve.
   */
  totalWithoutFederalIncome: number;
}

/**
 * Compute all tax estimate components from net profit, Owensboro gross income,
 * and the selected tax year (defaults to current year).
 *
 * Assumes single-filer status and the year-appropriate standard deduction.
 * This is an estimate only — not tax advice. Consult a CPA for actual filing.
 */
export function computeTaxEstimate(
  netProfit: number,
  owensboroGross: number,
  year: number = new Date().getFullYear(),
): TaxEstimate {
  const { standardDeduction } = getTaxYearData(year);
  const federalSE = Math.max(0, netProfit * 0.9235 * 0.153);
  const seDeduction = federalSE * 0.5;
  const federalTaxableIncome = Math.max(0, netProfit - seDeduction - standardDeduction);
  const federalIncome = calcFederalIncomeTax(federalTaxableIncome, year);
  const kyState = Math.max(0, netProfit * 0.04);
  const occ = Math.max(0, owensboroGross * OWENSBORO_OCC_RATE);
  return {
    federalSE,
    seDeduction,
    standardDeduction,
    federalTaxableIncome,
    federalIncome,
    kyState,
    occ,
    total: federalSE + federalIncome + kyState + occ,
    totalWithoutFederalIncome: federalSE + kyState + occ,
  };
}
