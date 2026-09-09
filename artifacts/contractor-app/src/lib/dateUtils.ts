import { endOfWeek, format, startOfWeek } from "date-fns";

const SUNDAY_WEEK_OPTIONS = { weekStartsOn: 0 as const };

export function getSundaySaturdayWeekRange(date: Date) {
  return {
    start: startOfWeek(date, SUNDAY_WEEK_OPTIONS),
    end: endOfWeek(date, SUNDAY_WEEK_OPTIONS),
  };
}

export function formatSundaySaturdayWeekRange(date: Date) {
  const { start, end } = getSundaySaturdayWeekRange(date);
  return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
}