/**
 * Count distinct dates explicitly confirmed as Here in Daily Presence.
 *
 * Estimated fuel days use attendance, not the scheduled span or other dated
 * work records. Missing or non-confirmed presence is not inferred as Here.
 */
export function countConfirmedHereWorkdays(
  presence: { date: unknown; state: string; provenance: string }[] = [],
): number | null {
  const dates = new Set<string>();

  for (const { date: value, state, provenance } of presence) {
    if (state !== "here" || provenance !== "confirmed") continue;

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      dates.add(value.toISOString().slice(0, 10));
    } else if (typeof value === "string" && value.trim()) {
      dates.add(value.trim());
    }
  }

  return dates.size > 0 ? dates.size : null;
}

export function calculateDaysOnSiteFromDateSpan(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): number | null {
  if (!startDate || !endDate) return null;
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return days > 0 ? days : null;
}

export function requiresManualDaysOnSite(
  derivedDays: number | null,
  manualDays: number | null,
  hasExistingRecord: boolean,
): boolean {
  return !hasExistingRecord && derivedDays == null && manualDays == null;
}