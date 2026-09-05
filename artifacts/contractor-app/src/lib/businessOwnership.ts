export function belongsToSelectedBusiness(
  record: { businessId?: number | string | null; businessLine?: string | null },
  business: { id: number; slug: string },
): boolean {
  return record.businessId != null
    ? Number(record.businessId) === business.id
    : record.businessLine === business.slug;
}