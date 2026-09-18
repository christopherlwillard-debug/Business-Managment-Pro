import type { PresenceState } from "./production-intelligence-contract";

export type ProductionPresenceCalculationRecord = {
  date: string;
  state: PresenceState;
};

export type ProductionTiming = {
  expectedDurationDays: number | null;
  expectedDurationSource?: "job_override" | "component" | "unset";
  actualProductionStartDate: string | null;
  lastWorkDate: string | null;
  calendarSpanDays: number | null;
  actualProductionDays: number;
  pausedNotHereDays: number;
  productionDayVariance: number | null;
};

export function applicationDate(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = new Map(parts.map(part => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function dateValue(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function dayDistance(start: string, end: string): number {
  return Math.round((dateValue(end) - dateValue(start)) / 86_400_000);
}

export function calculateProductionTiming(
  records: ProductionPresenceCalculationRecord[],
  expectedDurationDays: number | null | undefined,
  currentDate: string = applicationDate(),
): ProductionTiming {
  const liveRecords = records.filter(record => record.date <= currentDate);
  const hereDates = Array.from(new Set(liveRecords
    .filter(record => record.state === "here")
    .map(record => record.date)))
    .sort();
  const actualProductionStartDate = hereDates[0] ?? null;
  const lastWorkDate = hereDates[hereDates.length - 1] ?? null;
  const pausedNotHereDays = actualProductionStartDate && lastWorkDate
    ? liveRecords.filter(record =>
      record.state === "not_here" &&
      record.date >= actualProductionStartDate &&
      record.date <= lastWorkDate,
    ).length
    : 0;
  const normalizedExpected = expectedDurationDays != null && expectedDurationDays > 0
    ? expectedDurationDays
    : null;

  return {
    expectedDurationDays: normalizedExpected,
    actualProductionStartDate,
    lastWorkDate,
    calendarSpanDays: actualProductionStartDate && lastWorkDate
      ? dayDistance(actualProductionStartDate, lastWorkDate) + 1
      : null,
    actualProductionDays: hereDates.length,
    pausedNotHereDays,
    productionDayVariance: normalizedExpected != null && actualProductionStartDate
      ? hereDates.length - normalizedExpected
      : null,
  };
}