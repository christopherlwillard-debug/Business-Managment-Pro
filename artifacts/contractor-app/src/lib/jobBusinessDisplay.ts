export type JobBusinessIdentity = {
  businessId?: number | null;
  businessLine?: string | null;
};

export type JobBusinessLabelOption = {
  id: number;
  name: string;
  slug: string;
};

export function getJobOwningBusinessDisplay(
  job: JobBusinessIdentity,
  businesses: readonly JobBusinessLabelOption[],
): string {
  if (job.businessId != null) {
    const canonicalBusiness = businesses.find(business => business.id === job.businessId);
    return canonicalBusiness?.name ?? `Business #${job.businessId}`;
  }

  if (!job.businessLine) return "Unassigned";

  const legacySlug = job.businessLine === "contracting" ? "general_contracting"
    : job.businessLine === "asphalt" ? "asphalt_sealing"
    : job.businessLine;
  const legacyBusiness = businesses.find(business => business.slug === legacySlug);
  const legacyName = legacyBusiness?.name ?? job.businessLine.replace(/_/g, " ");
  return `Legacy · ${legacyName}`;
}
