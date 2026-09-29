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