export type ObservationPresenceState = "unrecorded" | "here" | "not_here";

export type ObservationPresenceRecord = {
  date: string;
  state: ObservationPresenceState;
  provenance: string;
  notHereReason: string | null;
  notes: string | null;
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
  components?: ProductionObservationComponentInput[];
  workSessions?: ProductionObservationWorkSessionInput[];
};

export type ProductionObservationComponentInput = {
  id: number;
  jobId: number;
  componentKey: string;
  componentInstanceKey: string;
  componentLabel: string;
  variant: string | null;
  snapshotVersion: number;
  status: string;
  expectedDurationDays: number | null;
  knowledgeContext: Record<string, unknown> | null;
};

export type ProductionObservationWorkSessionInput = {
  id: number;
  jobId: number;
  productionComponentId: number;
  workDate: string;
};

export type ProductionObservationSnapshotEvidence = {
  snapshotId: number;
  snapshotVersion: number;
  expectedProductionDays: number | null;
  sessionIds: number[];
};

export type ProductionObservationComponentJob = {
  jobId: number;
  title: string;
  learningKey: string;
  componentKey: string;
  componentLabel: string;
  variant: string | null;
  customProfile: {
    id: number;
    key: string;
    name: string;
  } | null;
  expectedProductionDays: number | null;
  actualWorkDays: number | null;
  expectedVsActualDays: number | null;
  workDates: string[];
  conflictDates: string[];
  explicitPauseDays: number;
  unrecordedDays: number;
  snapshotEvidence: ProductionObservationSnapshotEvidence[];
  exclusionReason:
    | "no_component_work_evidence"
    | "missing_expected_duration"
    | "not_here_work_conflict"
    | "conflicting_snapshot_expectations"
    | "snapshot_job_mismatch"
    | "missing_custom_profile_snapshot"
    | null;
};

export type ProductionObservationComponent = {
  learningKey: string;
  componentKey: string;
  componentLabel: string;
  variant: string | null;
  customProfile: {
    id: number;
    key: string;
    name: string;
  } | null;
  eligibleJobCount: number;
  minimumJobsRequired: number;
  sufficient: boolean;
  expectedProductionDaysMedian: number | null;
  expectedProductionDaysRange: { min: number; max: number } | null;
  actualWorkDaysMedian: number | null;
  actualWorkDaysRange: { min: number; max: number } | null;
  expectedVsActualDaysMedian: number | null;
  expectedVsActualDaysRange: { min: number; max: number } | null;
  explicitPauseDaysTotal: number;
  unrecordedDaysTotal: number;
  jobs: ProductionObservationComponentJob[];
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
    componentObservations: ProductionObservationComponent[];
  };
  jobs: ProductionObservationJob[];
};

export const MINIMUM_SAMPLE_SIZE = 3;

const PRESENCE_PROVENANCE_RANK: Record<string, number> = {
  snapshot: 0,
  derived: 1,
  inferred: 2,
  confirmed: 3,
};

export function normalizeObservationPresence(records: ObservationPresenceRecord[]): ObservationPresenceRecord[] {
  const recordByDate = new Map<string, ObservationPresenceRecord>();
  for (const record of records) {
    const current = recordByDate.get(record.date);
    if (!current) {
      recordByDate.set(record.date, record);
      continue;
    }
    const currentRank = PRESENCE_PROVENANCE_RANK[current.provenance] ?? -1;
    const nextRank = PRESENCE_PROVENANCE_RANK[record.provenance] ?? -1;
    if (nextRank >= currentRank) recordByDate.set(record.date, record);
  }
  return [...recordByDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

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
  const confirmed = normalizeObservationPresence(records)
    .filter((record) => record.provenance === "confirmed");
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

function customProfileFromSnapshot(
  knowledgeContext: Record<string, unknown> | null,
): { id: number; key: string; name: string } | null {
  const value = knowledgeContext?.customProfile;
  if (!value || typeof value !== "object") return null;
  const profile = value as Record<string, unknown>;
  if (
    typeof profile.id !== "number" ||
    !Number.isInteger(profile.id) ||
    typeof profile.key !== "string" ||
    !profile.key.trim() ||
    typeof profile.name !== "string" ||
    !profile.name.trim()
  ) {
    return null;
  }
  return {
    id: profile.id,
    key: profile.key.trim(),
    name: profile.name.trim(),
  };
}

function learningKeyForComponent(component: ProductionObservationComponentInput): {
  learningKey: string;
  customProfile: { id: number; key: string; name: string } | null;
} | null {
  if (component.componentKey === "interior_finish") {
    if (component.variant !== "vog" && component.variant !== "hybrid" && component.variant !== "drywall") {
      return null;
    }
    return {
      learningKey: `interior_finish:${component.variant}`,
      customProfile: null,
    };
  }

  if (component.componentKey === "siding" || component.componentKey === "plumbing" || component.componentKey === "skirting") {
    return {
      learningKey: component.componentKey,
      customProfile: null,
    };
  }

  if (component.componentKey === "custom") {
    const customProfile = customProfileFromSnapshot(component.knowledgeContext);
    if (!customProfile) return null;
    return {
      learningKey: `custom:${customProfile.id}:${customProfile.key}`,
      customProfile,
    };
  }

  return null;
}

function buildComponentObservations(
  jobs: ProductionObservationJobInput[],
  observedJobs: ProductionObservationJob[],
): ProductionObservationComponent[] {
  const observedJobById = new Map(observedJobs.map((job) => [job.id, job]));
  const groups = new Map<string, {
    componentKey: string;
    componentLabel: string;
    variant: string | null;
    customProfile: { id: number; key: string; name: string } | null;
    jobs: ProductionObservationComponentJob[];
  }>();

  for (const job of jobs) {
    const observedJob = observedJobById.get(job.id);
    if (!observedJob || observedJob.exclusionReason !== null) continue;

    const sessionsByComponentId = new Map<number, ProductionObservationWorkSessionInput[]>();
    for (const session of job.workSessions ?? []) {
      const sessions = sessionsByComponentId.get(session.productionComponentId) ?? [];
      sessions.push(session);
      sessionsByComponentId.set(session.productionComponentId, sessions);
    }

    const componentGroups = new Map<string, ProductionObservationComponentInput[]>();
    for (const component of job.components ?? []) {
      const identity = learningKeyForComponent(component);
      if (!identity) {
        if (component.componentKey === "custom") {
          const fallbackKey = `custom:unresolved:${component.componentInstanceKey}`;
          const existing = componentGroups.get(fallbackKey) ?? [];
          existing.push(component);
          componentGroups.set(fallbackKey, existing);
        }
        continue;
      }
      const existing = componentGroups.get(identity.learningKey) ?? [];
      existing.push(component);
      componentGroups.set(identity.learningKey, existing);
    }

    const normalizedPresence = normalizeObservationPresence(job.presence);
    const confirmedNotHereDates = new Set(
      normalizedPresence
        .filter((record) => record.provenance === "confirmed" && record.state === "not_here")
        .map((record) => record.date),
    );

    for (const [learningKey, components] of componentGroups) {
      const firstComponent = components[0];
      const identity = learningKeyForComponent(firstComponent);
      const customProfile = identity?.customProfile ?? null;
      const snapshotEvidence: ProductionObservationSnapshotEvidence[] = [];
      const expectedValues = new Set<number>();
      const validDates = new Set<string>();
      const conflictDates = new Set<string>();
      let snapshotJobMismatch = false;
      let hasMissingExpectedDuration = false;

      for (const component of components) {
        if (component.jobId !== job.id) {
          snapshotJobMismatch = true;
        }
        if (component.status === "not_applicable") continue;
        if (component.expectedDurationDays == null) {
          hasMissingExpectedDuration = true;
        } else if (Number.isInteger(component.expectedDurationDays) && component.expectedDurationDays >= 0) {
          expectedValues.add(component.expectedDurationDays);
        } else {
          hasMissingExpectedDuration = true;
        }

        const componentSessions = sessionsByComponentId.get(component.id) ?? [];
        const sessionIds = componentSessions.map((session) => session.id).sort((a, b) => a - b);
        snapshotEvidence.push({
          snapshotId: component.id,
          snapshotVersion: component.snapshotVersion,
          expectedProductionDays: component.expectedDurationDays,
          sessionIds,
        });
        for (const session of componentSessions) {
          if (session.jobId !== job.id || component.jobId !== job.id) {
            snapshotJobMismatch = true;
            continue;
          }
          if (confirmedNotHereDates.has(session.workDate)) {
            conflictDates.add(session.workDate);
          } else {
            validDates.add(session.workDate);
          }
        }
      }

      snapshotEvidence.sort((a, b) => a.snapshotId - b.snapshotId);
      const sortedWorkDates = [...validDates].sort();
      const sortedConflictDates = [...conflictDates].sort();
      let exclusionReason: ProductionObservationComponentJob["exclusionReason"] = null;
      if (snapshotJobMismatch) exclusionReason = "snapshot_job_mismatch";
      else if (!identity && firstComponent.componentKey === "custom") {
        exclusionReason = "missing_custom_profile_snapshot";
      } else if (hasMissingExpectedDuration || expectedValues.size === 0) {
        exclusionReason = "missing_expected_duration";
      } else if (expectedValues.size > 1) {
        exclusionReason = "conflicting_snapshot_expectations";
      } else if (sortedWorkDates.length === 0) {
        exclusionReason = sortedConflictDates.length > 0
          ? "not_here_work_conflict"
          : "no_component_work_evidence";
      }

      const expectedProductionDays = expectedValues.size === 1 ? [...expectedValues][0] : null;
      const actualWorkDays = exclusionReason === null ? sortedWorkDates.length : null;
      const componentJob: ProductionObservationComponentJob = {
        jobId: job.id,
        title: job.title,
        learningKey,
        componentKey: firstComponent.componentKey,
        componentLabel: firstComponent.componentLabel,
        variant: firstComponent.variant,
        customProfile,
        expectedProductionDays,
        actualWorkDays,
        expectedVsActualDays: expectedProductionDays != null && actualWorkDays != null
          ? actualWorkDays - expectedProductionDays
          : null,
        workDates: sortedWorkDates,
        conflictDates: sortedConflictDates,
        explicitPauseDays: observedJob.explicitPauseDays,
        unrecordedDays: observedJob.unrecordedDays,
        snapshotEvidence,
        exclusionReason,
      };
      const group = groups.get(learningKey);
      if (group) {
        group.jobs.push(componentJob);
      } else {
        groups.set(learningKey, {
          componentKey: firstComponent.componentKey,
          componentLabel: firstComponent.componentLabel,
          variant: firstComponent.variant,
          customProfile,
          jobs: [componentJob],
        });
      }
    }
  }

  const range = (values: number[]): { min: number; max: number } | null =>
    values.length > 0 ? { min: Math.min(...values), max: Math.max(...values) } : null;

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([learningKey, group]) => {
      const eligibleJobs = group.jobs.filter((job) => job.exclusionReason === null);
      const expectedDays = eligibleJobs.flatMap((job) => job.expectedProductionDays == null ? [] : [job.expectedProductionDays]);
      const actualWorkDays = eligibleJobs.flatMap((job) => job.actualWorkDays == null ? [] : [job.actualWorkDays]);
      const deltas = eligibleJobs.flatMap((job) => job.expectedVsActualDays == null ? [] : [job.expectedVsActualDays]);
      const sufficient = eligibleJobs.length >= MINIMUM_SAMPLE_SIZE;
      return {
        learningKey,
        componentKey: group.componentKey,
        componentLabel: group.componentLabel,
        variant: group.variant,
        customProfile: group.customProfile,
        eligibleJobCount: eligibleJobs.length,
        minimumJobsRequired: MINIMUM_SAMPLE_SIZE,
        sufficient,
        expectedProductionDaysMedian: sufficient ? median(expectedDays) : null,
        expectedProductionDaysRange: sufficient ? range(expectedDays) : null,
        actualWorkDaysMedian: sufficient ? median(actualWorkDays) : null,
        actualWorkDaysRange: sufficient ? range(actualWorkDays) : null,
        expectedVsActualDaysMedian: sufficient ? median(deltas) : null,
        expectedVsActualDaysRange: sufficient ? range(deltas) : null,
        explicitPauseDaysTotal: eligibleJobs.reduce((total, job) => total + job.explicitPauseDays, 0),
        unrecordedDaysTotal: eligibleJobs.reduce((total, job) => total + job.unrecordedDays, 0),
        jobs: [...group.jobs].sort((left, right) => left.jobId - right.jobId),
      };
    });
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
    const presence = normalizeObservationPresence(job.presence);
    const observation = calculateProductionObservation(presence);
    observedJobs.push({
      id: job.id,
      title: job.title,
      status: job.status,
      presence,
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
      componentObservations: buildComponentObservations(jobs, observedJobs),
    },
    jobs: observedJobs,
  };
}