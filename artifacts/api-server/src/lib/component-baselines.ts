import { createHash } from "node:crypto";
import type {
  MfhComponentBaselineSourceEvidence,
  MfhComponentBaselineSourceEvidenceJob,
} from "@workspace/db/schema";
import type {
  ProductionObservationComponent,
  ProductionObservationResponse,
} from "./production-observations";

export const COMPONENT_BASELINE_MINIMUM_SAMPLE_SIZE = 5;

export function buildComponentBaselineEvidence(
  summary: ProductionObservationResponse,
  businessId: number,
  learningKey: string,
): {
  component: ProductionObservationComponent;
  evidence: MfhComponentBaselineSourceEvidence;
  sourceJobIds: number[];
  sourceEvidenceHash: string;
} | null {
  const component = summary.observed.componentObservations.find(
    (candidate) => candidate.learningKey === learningKey,
  );
  if (!component || component.eligibleJobCount < COMPONENT_BASELINE_MINIMUM_SAMPLE_SIZE) {
    return null;
  }

  const jobsById = new Map(summary.jobs.map((job) => [job.id, job]));
  const jobs: MfhComponentBaselineSourceEvidenceJob[] = component.jobs
    .filter((job) => job.exclusionReason === null)
    .sort((left, right) => left.jobId - right.jobId)
    .map((job) => {
      const sourceJob = jobsById.get(job.jobId);
      return {
        jobId: job.jobId,
        title: job.title,
        expectedProductionDays: job.expectedProductionDays,
        actualWorkDays: job.actualWorkDays,
        expectedVsActualDays: job.expectedVsActualDays,
        workDates: [...job.workDates],
        conflictDates: [...job.conflictDates],
        explicitPauseDays: job.explicitPauseDays,
        unrecordedDays: job.unrecordedDays,
        presence: (sourceJob?.presence ?? []).map((presence) => ({
          ...(presence.id == null ? {} : { id: presence.id }),
          date: presence.date,
          state: presence.state,
          provenance: presence.provenance,
          notHereReason: presence.notHereReason,
          notes: presence.notes,
          ...(presence.updatedAt == null ? {} : { updatedAt: presence.updatedAt }),
        })),
        snapshotEvidence: job.snapshotEvidence.map((snapshot) => ({
          snapshotId: snapshot.snapshotId,
          snapshotVersion: snapshot.snapshotVersion,
          expectedProductionDays: snapshot.expectedProductionDays,
          sessionIds: [...snapshot.sessionIds].sort((a, b) => a - b),
        })),
      };
    });

  const evidence: MfhComponentBaselineSourceEvidence = {
    schemaVersion: 1,
    businessId,
    modelId: summary.modelId,
    learningKey: component.learningKey,
    componentKey: component.componentKey,
    componentLabel: component.componentLabel,
    variant: component.variant,
    customProfile: component.customProfile,
    observationMinimumJobs: summary.sample.minimumJobsRequired,
    observationEligibleJobCount: component.eligibleJobCount,
    jobs,
  };
  const sourceJobIds = jobs.map((job) => job.jobId);
  const sourceEvidenceHash = createHash("sha256")
    .update(JSON.stringify(evidence))
    .digest("hex");

  return { component, evidence, sourceJobIds, sourceEvidenceHash };
}