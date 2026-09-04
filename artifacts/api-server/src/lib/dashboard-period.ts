/**
 * Returns the Monday that begins the calendar week containing `now`.
 *
 * Dashboard financial records use date-only values. UTC date arithmetic keeps
 * this helper aligned with the existing report query boundaries regardless of
 * the API process's local timezone.
 */
export function getWeekToDateStart(now: Date): string {
  const start = new Date(now);
  const daysSinceMonday = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  return start.toISOString().slice(0, 10);
}