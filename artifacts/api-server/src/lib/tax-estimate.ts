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

export interface TaxAssumptions {
  federalSeRate: number;
  federalSeBase: number;
  seDeductionRate: number;
  federalIncomeRate: number;
  kentuckyIncomeRate: number;
  occupationalRate: number;
  mealDeductionRate: number;
  taxReserveRate: number;
  jurisdiction: { federal: string; state: string; local: string };
  source: "default" | "business_override";
}

export interface TaxAssumptionConfig {
  defaults?: Partial<Omit<TaxAssumptions, "jurisdiction" | "source">>;
  byYear?: Record<string, Partial<Omit<TaxAssumptions, "jurisdiction" | "source">>>;
  jurisdiction?: Partial<TaxAssumptions["jurisdiction"]>;
}

const DEFAULT_ASSUMPTIONS: Omit<TaxAssumptions, "source"> = {
  federalSeRate: 0.153,
  federalSeBase: 0.9235,
  seDeductionRate: 0.5,
  federalIncomeRate: 0.22,
  kentuckyIncomeRate: 0.04,
  occupationalRate: 0.0139,
  mealDeductionRate: 0.5,
  taxReserveRate: 0.25,
  jurisdiction: { federal: "US", state: "KY", local: "Owensboro" },
};

export function getTaxAssumptions(year: number, config?: TaxAssumptionConfig | null): TaxAssumptions {
  const yearOverride = config?.byYear?.[String(year)] ?? {};
  const values = { ...DEFAULT_ASSUMPTIONS, ...(config?.defaults ?? {}), ...yearOverride };
  return {
    ...values,
    jurisdiction: { ...DEFAULT_ASSUMPTIONS.jurisdiction, ...(config?.jurisdiction ?? {}) },
    source: Object.keys(config?.defaults ?? {}).length || Object.keys(yearOverride).length ? "business_override" : "default",
  };
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
export const OWENSBORO_OCC_RATE = DEFAULT_ASSUMPTIONS.occupationalRate;

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
  assumptionsUsed: TaxAssumptions;
}

export function validateTaxAssumptionConfig(config: unknown): TaxAssumptionConfig | null {
  if (config == null) return null;
  if (typeof config !== "object" || Array.isArray(config)) throw new Error("taxAssumptions must be an object");
  const candidate = config as TaxAssumptionConfig;
  const values = [candidate.defaults, ...(Object.values(candidate.byYear ?? {}))];
  for (const group of values) {
    if (!group) continue;
    for (const [key, value] of Object.entries(group)) {
      if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${key} must be a finite number`);
      if (value < 0 || value > 1) throw new Error(`${key} must be between 0 and 1`);
    }
  }
  return candidate;
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
  config?: TaxAssumptionConfig | null,
): TaxEstimate {
  const assumptions = getTaxAssumptions(year, config);
  const { standardDeduction } = getTaxYearData(year);
  const federalSE = Math.max(0, netProfit * assumptions.federalSeBase * assumptions.federalSeRate);
  const seDeduction = federalSE * assumptions.seDeductionRate;
  const federalTaxableIncome = Math.max(0, netProfit - seDeduction - standardDeduction);
  const federalIncome = calcFederalIncomeTax(federalTaxableIncome, year);
  const kyState = Math.max(0, netProfit * assumptions.kentuckyIncomeRate);
  const occ = Math.max(0, owensboroGross * assumptions.occupationalRate);
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
    assumptionsUsed: assumptions,
  };
}
