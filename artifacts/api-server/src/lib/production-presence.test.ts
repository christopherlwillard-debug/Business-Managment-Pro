import { describe, expect, it } from "vitest";
import { calculateProductionTiming } from "./production-presence";

describe("calculateProductionTiming", () => {
  it("keeps unrecorded distinct, counts only here days, and counts explicit pauses", () => {
    const timing = calculateProductionTiming(
      [
        { date: "2026-08-31", state: "not_here" },
        { date: "2026-09-01", state: "unrecorded" },
        { date: "2026-09-02", state: "here" },
        { date: "2026-09-03", state: "not_here" },
        { date: "2026-09-04", state: "here" },
        { date: "2026-09-05", state: "not_here" },
      ],
      3,
    );

    expect(timing).toEqual({
      expectedDurationDays: 3,
      actualProductionStartDate: "2026-09-02",
      lastWorkDate: "2026-09-04",
      calendarSpanDays: 3,
      actualProductionDays: 2,
      pausedNotHereDays: 1,
      productionDayVariance: -1,
    });
  });

  it("does not infer timing from not-here or unrecorded-only records", () => {
    expect(calculateProductionTiming(
      [
        { date: "2026-09-01", state: "unrecorded" },
        { date: "2026-09-02", state: "not_here" },
      ],
      null,
    )).toEqual({
      expectedDurationDays: null,
      actualProductionStartDate: null,
      lastWorkDate: null,
      calendarSpanDays: null,
      actualProductionDays: 0,
      pausedNotHereDays: 0,
      productionDayVariance: null,
    });
  });
});