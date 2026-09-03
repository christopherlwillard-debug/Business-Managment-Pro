/**
 * Count the distinct dates on which work is evidenced for a job.
 *
 * Calendar start/end dates describe a scheduled span, not attendance. Daily
 * logs and subcontractor hour entries are the existing raw work-day records.
 * A job may have either or both, so the count is the union of both date sets.
 */
export function countActualWorkdays(
  subHoursDates: unknown[],
  dailyLogDates: unknown[],
): number | null {
  const dates = new Set<string>();

  for (const value of [...subHoursDates, ...dailyLogDates]) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      dates.add(value.toISOString().slice(0, 10));
    } else if (typeof value === "string" && value.trim()) {
      dates.add(value.trim());
    }
  }

  return dates.size > 0 ? dates.size : null;
}