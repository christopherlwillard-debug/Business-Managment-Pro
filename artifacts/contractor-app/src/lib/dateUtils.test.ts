import { describe, expect, it } from "vitest";
import { formatSundaySaturdayWeekRange, getSundaySaturdayWeekRange } from "./dateUtils";

describe("Sunday-to-Saturday week utilities", () => {
  it("uses the same week when the selected date is Sunday or Saturday", () => {
    const sunday = new Date(2026, 8, 6, 12);
    const saturday = new Date(2026, 8, 12, 12);

    expect(formatSundaySaturdayWeekRange(sunday)).toBe("Sep 6 – Sep 12, 2026");
    expect(formatSundaySaturdayWeekRange(saturday)).toBe("Sep 6 – Sep 12, 2026");
  });

  it("keeps both years visible when a week crosses December into January", () => {
    expect(formatSundaySaturdayWeekRange(new Date(2026, 11, 30, 12)))
      .toBe("Dec 27 – Jan 2, 2027");
  });

  it("returns date objects that match the formatted range", () => {
    const { start, end } = getSundaySaturdayWeekRange(new Date(2026, 8, 9, 12));

    expect(start.getDay()).toBe(0);
    expect(end.getDay()).toBe(6);
    expect(formatSundaySaturdayWeekRange(start)).toBe("Sep 6 – Sep 12, 2026");
  });
});