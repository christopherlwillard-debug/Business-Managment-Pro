export type ObservationPresenceState = "unrecorded" | "here" | "not_here";

export type ObservationPresenceRecord = {
  date: string;
  state: ObservationPresenceState;
  provenance: string;
};

export type ObservationServiceScope = {
  id: number;
  name: string;
  customProfile?: {
    id: number;
    key: string;
    name: string;
  } | null;
};

export type ProductionObservationJobInput = {
  id: number;
  title: string;
  status: string;
  workflow: string | null;
  serviceScopes: ObservationServiceScope[];
  presence: ObservationPresenceRecord[];
};

export type ProductionObservationJob = {
  id: number;
  title: string;
  status: string;
  presence: ObservationPresenceRecord[];
  productionDays: number | null;
  calendarSpanDays: number | null;
  explicitPauseDays: number;
  unrecordedDays: number;
  firstProductionDate: string | null;
  lastProductionDate: string | null;
  serviceScopes: ObservationServiceScope[];
  exclusionReason: "no_confirmed_presence" | null;
};

export type ProductionObservationResponse = {
  modelId: number;
  benchmark: {
    id: number | null;
    jobType: string | null;
    estimatedHours: number | null;
  };
  sample: {
    eligibleJobCount: number;
    minimumJobsRequired: number;
    sufficient: boolean;
    lastObservedDate: string | null;
  };
  observed: {
    productionDaysMedian: number | null;
    productionDaysRange: { min: number; max: number } | null;
    calendarSpanMedian: number | null;
    calendarSpanRange: { min: number; max: number } | null;
    explicitPauseDaysTotal: number;
    serviceScopes: Array<ObservationServiceScope & { jobCount: number }>;
  };
  jobs: ProductionObservationJob[];
};

export const MINIMUM_SAMPLE_SIZE = 3;

function parseDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function inclusiveDays(start: string, end: string): number {
  return Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / 86_400_000) + 1;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function calculateProductionObservation(records: ObservationPresenceRecord[]): {
  productionDays: number;
  calendarSpanDays: number;
  explicitPauseDays: number;
  unrecordedDays: number;
  firstProductionDate: string;
  lastProductionDate: string;
} | null {
  const confirmed = records
    .filter((record) => record.provenance === "confirmed")
    .sort((a, b) => a.date.localeCompare(b.date));
  const hereDates = confirmed.filter((record) => record.state === "here").map((record) => record.date);
  if (hereDates.length === 0) return null;

  const firstProductionDate = hereDates[0];
  const lastProductionDate = hereDates[hereDates.length - 1];
  const calendarSpanDays = inclusiveDays(firstProductionDate, lastProductionDate);
  const confirmedByDate = new Map(confirmed.map((record) => [record.date, record.state]));

  let productionDays = 0;
  let explicitPauseDays = 0;
  let unrecordedDays = 0;
  for (let offset = 0; offset < calendarSpanDays; offset += 1) {
    const date = formatDate(addDays(parseDate(firstProductionDate), offset));
    const state = confirmedByDate.get(date);
    if (state === "here") productionDays += 1;
    else if (state === "not_here") explicitPauseDays += 1;
    else unrecordedDays += 1;
  }

  return {
    productionDays,
    calendarSpanDays,
    explicitPauseDays,
    unrecordedDays,
    firstProductionDate,
    lastProductionDate,
  };
}

export function buildProductionObservationResponse(
  modelId: number,
  jobs: ProductionObservationJobInput[],
  benchmark: { id: number | null; jobType: string | null; estimatedHours: number | null },
): ProductionObservationResponse {
  const observedJobs: ProductionObservationJob[] = [];

  for (const job of jobs) {
    if (job.status !== "completed" && job.status !== "invoiced") continue;
    if (job.workflow !== "mh_production" || job.serviceScopes.length === 0) continue;
    const observation = calculateProductionObservation(job.presence);
    observedJobs.push({
      id: job.id,
      title: job.title,
      status: job.status,
      presence: job.presence,
      productionDays: observation?.productionDays ?? null,
      calendarSpanDays: observation?.calendarSpanDays ?? null,
      explicitPauseDays: observation?.explicitPauseDays ?? 0,
      unrecordedDays: observation?.unrecordedDays ?? 0,
      firstProductionDate: observation?.firstProductionDate ?? null,
      lastProductionDate: observation?.lastProductionDate ?? null,
      serviceScopes: job.serviceScopes,
      exclusionReason: observation ? null : "no_confirmed_presence",
    });
  }

  const eligibleJobs = observedJobs.filter((job) => job.exclusionReason === null);
  const productionDays = eligibleJobs.flatMap((job) => job.productionDays == null ? [] : [job.productionDays]);
  const calendarSpans = eligibleJobs.flatMap((job) => job.calendarSpanDays == null ? [] : [job.calendarSpanDays]);
  const sufficient = eligibleJobs.length >= MINIMUM_SAMPLE_SIZE;
  const range = (values: number[]): { min: number; max: number } | null =>
    values.length > 0 ? { min: Math.min(...values), max: Math.max(...values) } : null;
  const serviceCounts = new Map<number, ObservationServiceScope & { jobCount: number }>();
  for (const job of eligibleJobs) {
    for (const service of job.serviceScopes) {
      const existing = serviceCounts.get(service.id);
      if (existing) existing.jobCount += 1;
      else serviceCounts.set(service.id, { ...service, jobCount: 1 });
    }
  }

  return {
    modelId,
    benchmark,
    sample: {
      eligibleJobCount: eligibleJobs.length,
      minimumJobsRequired: MINIMUM_SAMPLE_SIZE,
      sufficient,
      lastObservedDate: eligibleJobs
        .map((job) => job.lastProductionDate)
        .filter((date): date is string => date != null)
        .sort()
        .at(-1) ?? null,
    },
    observed: {
      productionDaysMedian: sufficient ? median(productionDays) : null,
      productionDaysRange: sufficient ? range(productionDays) : null,
      calendarSpanMedian: sufficient ? median(calendarSpans) : null,
      calendarSpanRange: sufficient ? range(calendarSpans) : null,
      explicitPauseDaysTotal: eligibleJobs.reduce((total, job) => total + job.explicitPauseDays, 0),
      serviceScopes: [...serviceCounts.values()],
    },
    jobs: observedJobs,
  };
}