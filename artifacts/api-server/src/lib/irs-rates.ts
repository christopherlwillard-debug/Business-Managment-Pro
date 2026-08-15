// IRS standard mileage rates — add new years as IRS publishes them.
//
// 2026 is a split year: $0.725/mi for Jan 1–Jun 30, $0.760/mi effective Jul 1.
// getIrsRateForDate() in mileage.ts handles the per-trip split precisely.
// getIrsMileageRate() returns the H2/current rate for 2026 — used only for display.
const IRS_MILEAGE_RATES: Record<number, number> = {
  2023: 0.655,
  2024: 0.670,
  2025: 0.700,
  // 2026 split year: H1 = $0.725, H2 = $0.760 (effective 2026-07-01).
  // Store H2 rate here so the display card shows the current applicable rate.
  2026: 0.760,
};

const FALLBACK_MILEAGE_RATE = 0.760; // most recent known rate

export function getIrsMileageRate(year: number): number {
  return IRS_MILEAGE_RATES[year] !== undefined ? IRS_MILEAGE_RATES[year] : FALLBACK_MILEAGE_RATE;
}
