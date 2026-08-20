// IRS standard mileage rates, ordered newest effective date first.
// This is the sole authority used by mileage writes, reports, and imports.
const IRS_MILEAGE_RATES = [
  { effectiveDate: "2026-07-01", rate: 0.760 },
  { effectiveDate: "2026-01-01", rate: 0.725 },
  { effectiveDate: "2025-01-01", rate: 0.700 },
  { effectiveDate: "2024-01-01", rate: 0.670 },
  { effectiveDate: "2023-01-01", rate: 0.655 },
  { effectiveDate: "2022-07-01", rate: 0.625 },
  { effectiveDate: "2022-01-01", rate: 0.585 },
] as const;

const FALLBACK_MILEAGE_RATE = IRS_MILEAGE_RATES[IRS_MILEAGE_RATES.length - 1].rate;

export function getIrsRateForDate(dateStr: string): number {
  return IRS_MILEAGE_RATES.find(entry => dateStr >= entry.effectiveDate)?.rate ?? FALLBACK_MILEAGE_RATE;
}

export function calculateMileageDeduction(
  miles: number | string,
  classification: string | null | undefined,
  dateStr: string,
): { rate: number; deduction: number } {
  const milesNum = Number(miles) || 0;
  const rate = getIrsRateForDate(dateStr);
  return { rate, deduction: classification === "business" ? milesNum * rate : 0 };
}

// Retained for existing display consumers. For split years, this returns the
// latest applicable rate in that calendar year.
export function getIrsMileageRate(year: number): number {
  return IRS_MILEAGE_RATES.find(entry => entry.effectiveDate.startsWith(`${year}-`))?.rate ?? FALLBACK_MILEAGE_RATE;
}