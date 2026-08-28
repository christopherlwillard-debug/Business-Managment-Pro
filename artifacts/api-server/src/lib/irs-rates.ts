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

function getIrsRateEntryForDate(dateStr: string) {
  return IRS_MILEAGE_RATES.find(entry => dateStr >= entry.effectiveDate)
    ?? IRS_MILEAGE_RATES[IRS_MILEAGE_RATES.length - 1];
}

export function getIrsRateForDate(dateStr: string): number {
  return getIrsRateEntryForDate(dateStr).rate;
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

export interface MileageRatePeriod {
  effectiveDate: string;
  periodStart: string;
  periodEnd: string;
  rate: number;
  miles: number;
  deduction: number;
}

function dayBefore(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function summarizeMileageRecords(
  logs: Array<{ miles: number | string; classification: string | null | undefined; date: string }>,
): {
  totalMiles: number;
  totalDeduction: number;
  ratePerMile: number | null;
  ratePeriods: MileageRatePeriod[];
} {
  const periodMap = new Map<string, MileageRatePeriod>();

  for (const log of logs) {
    if (log.classification !== "business") continue;

    const miles = Number(log.miles) || 0;
    const entry = getIrsRateEntryForDate(log.date);
    const entryIndex = IRS_MILEAGE_RATES.indexOf(entry);
    const year = log.date.slice(0, 4);
    const nextEntry = entryIndex > 0 ? IRS_MILEAGE_RATES[entryIndex - 1] : null;
    const periodStart = entry.effectiveDate > `${year}-01-01`
      ? entry.effectiveDate
      : `${year}-01-01`;
    const periodEnd = nextEntry?.effectiveDate.slice(0, 4) === year
      ? dayBefore(nextEntry.effectiveDate)
      : `${year}-12-31`;
    const key = `${year}:${entry.effectiveDate}`;
    const period = periodMap.get(key) ?? {
      effectiveDate: entry.effectiveDate,
      periodStart,
      periodEnd,
      rate: entry.rate,
      miles: 0,
      deduction: 0,
    };

    period.miles += miles;
    period.deduction += miles * entry.rate;
    periodMap.set(key, period);
  }

  const ratePeriods = [...periodMap.values()]
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart));
  const totalMiles = ratePeriods.reduce((sum, period) => sum + period.miles, 0);
  const totalDeduction = ratePeriods.reduce((sum, period) => sum + period.deduction, 0);

  return {
    totalMiles,
    totalDeduction,
    ratePerMile: ratePeriods.length === 1 ? ratePeriods[0].rate : null,
    ratePeriods,
  };
}

// Retained for existing display consumers. For split years, this returns the
// latest applicable rate in that calendar year.
export function getIrsMileageRate(year: number): number {
  return IRS_MILEAGE_RATES.find(entry => entry.effectiveDate.startsWith(`${year}-`))?.rate ?? FALLBACK_MILEAGE_RATE;
}