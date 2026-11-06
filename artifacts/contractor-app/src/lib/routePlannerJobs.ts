export type RoutePlannerJobLink = {
  id: number;
  businessLine: string | null;
};

export function findRoutePlannerJob<T extends RoutePlannerJobLink>(
  jobId: number | null | undefined,
  jobs: T[],
  activeBusinessSlug: string | null | undefined,
): T | undefined {
  if (jobId == null) return undefined;
  const job = jobs.find(candidate => candidate.id === jobId);
  if (!job) return undefined;
  if (activeBusinessSlug && job.businessLine !== activeBusinessSlug) return undefined;
  return job;
}
