import { Job, JobPlanningState, JobPriority, JobResourceDemand } from "@workspace/api-client-react";

export interface ReadinessBlocker {
  id: number;
  jobId: number;
  reason: "electricity" | "water" | "materials" | "inspection" | "crew" | "access" | "other";
  detail: string | null;
  expectedDate: string | null;
  clearedAt: string | null;
  createdAt: string;
}

export type ExtendedJob = Job & {
  activeReadinessCondition?: ReadinessBlocker | null;
};
