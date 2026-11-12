export type JobPropertyIdentity = {
  propertyId?: number | null;
  propertyLabel?: string | null;
  propertyStreet?: string | null;
  propertyCity?: string | null;
  propertyState?: string | null;
  propertyZip?: string | null;
};

export type JobPropertyDisplay = {
  label: string;
  address: string | null;
};

export function getJobPropertyDisplay(job: JobPropertyIdentity): JobPropertyDisplay {
  if (job.propertyId == null) return { label: "No property linked", address: null };

  const label = job.propertyLabel?.trim();
  if (!label) return { label: "Property details unavailable", address: null };

  const address = [job.propertyStreet, job.propertyCity, job.propertyState, job.propertyZip]
    .map(value => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(", ");

  return { label, address: address || null };
}
