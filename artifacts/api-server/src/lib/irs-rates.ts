// IRS standard mileage rates — add new years as IRS publishes them
const IRS_MILEAGE_RATES: Record<number, number> = {
  2023: 0.655,
  2024: 0.670,
  2025: 0.700,
  2026: 0.700,
};

const FALLBACK_MILEAGE_RATE = 0.700; // most recent known rate

export function getIrsMileageRate(year: number): number {
  return IRS_MILEAGE_RATES[year] !== undefined ? IRS_MILEAGE_RATES[year] : FALLBACK_MILEAGE_RATE;
}
