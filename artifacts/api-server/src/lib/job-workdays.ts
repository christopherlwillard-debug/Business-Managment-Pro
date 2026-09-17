/**
 * Count the distinct dates on which work is evidenced for a job.
 *
 * Calendar start/end dates describe a scheduled span, not attendance. Daily
 * logs, subcontractor hour entries, and component work sessions are the
 * existing raw work-day records. A job may have any combination of them, so
 * the count is the union of all recorded date sets.
 */
export function countActualWorkdays(
  subHoursDates: unknown[],
  dailyLogDates: unknown[],
  componentSessionDates: unknown[] = [],
): number | null {
  const dates = new Set<string>();

  for (const value of [...subHoursDates, ...dailyLogDates, ...componentSessionDates]) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      dates.add(value.toISOString().slice(0, 10));
    } else if (typeof value === "string" && value.trim()) {
      dates.add(value.trim());
    }
  }

  return dates.size > 0 ? dates.size : null;
}