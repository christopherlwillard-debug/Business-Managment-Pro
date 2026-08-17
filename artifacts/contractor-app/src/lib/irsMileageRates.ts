interface IrsRateEntry {
  effectiveDate: string;
  rate: number;
}

const IRS_MILEAGE_RATES: IrsRateEntry[] = [
  { effectiveDate: "2022-01-01", rate: 0.585 },
  { effectiveDate: "2022-07-01", rate: 0.625 },
  { effectiveDate: "2023-01-01", rate: 0.655 },
  { effectiveDate: "2024-01-01", rate: 0.670 },
  { effectiveDate: "2025-01-01", rate: 0.700 },
  { effectiveDate: "2026-01-01", rate: 0.725 }, // IRS Notice 2025-87 — H1 2026
  { effectiveDate: "2026-07-01", rate: 0.760 }, // IRS mid-year increase — H2 2026
];

export function getIrsRate(dateStr: string): number {
  const sorted = [...IRS_MILEAGE_RATES].sort((a, b) =>
    b.effectiveDate.localeCompare(a.effectiveDate)
  );
  const match = sorted.find(e => dateStr >= e.effectiveDate);
  return match?.rate ?? 0.585;
}

export function getCurrentIrsRate(): number {
  const today = new Date().toISOString().slice(0, 10);
  return getIrsRate(today);
}

export { IRS_MILEAGE_RATES };
