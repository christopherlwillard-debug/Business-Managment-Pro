export const JOB_MILEAGE_SOURCES = {
  client: "job_client_route",
  business: "job_business_route",
} as const;

export type JobMileageSource =
  (typeof JOB_MILEAGE_SOURCES)[keyof typeof JOB_MILEAGE_SOURCES];

const jobMileageSourceSet = new Set<string>(Object.values(JOB_MILEAGE_SOURCES));
const publicMileageSourceSet = new Set(["gps", "manual"]);

export function isJobGeneratedMileageSource(
  source: string | null | undefined,
): source is JobMileageSource {
  return source != null && jobMileageSourceSet.has(source);
}

export function isPublicMileageSource(source: unknown): source is "gps" | "manual" {
  return typeof source === "string" && publicMileageSourceSet.has(source);
}