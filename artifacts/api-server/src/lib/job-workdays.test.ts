import { describe, expect, it } from "vitest";
import { countActualWorkdays } from "./job-workdays.js";

describe("countActualWorkdays", () => {
  it("counts the union of daily-log and subcontractor-hour dates", () => {
    expect(countActualWorkdays(
      ["2026-09-02", "2026-09-03"],
      ["2026-08-31", "2026-09-02"],
    )).toBe(3);
  });

  it("includes component work-session dates in the worked-day union", () => {
    expect(countActualWorkdays(
      ["2026-09-02"],
      ["2026-08-31"],
      ["2026-09-01", "2026-09-02"],
    )).toBe(3);
  });

  it("uses three worked dates instead of a four-day scheduled span", () => {
    const scheduledSpan = ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03"];

    expect(countActualWorkdays(
      ["2026-09-02", "2026-09-03"],
      ["2026-08-31"],
    )).toBe(3);
    expect(scheduledSpan).toHaveLength(4);
  });

  it("does not infer worked days when no work-date evidence exists", () => {
    expect(countActualWorkdays([], [], [])).toBeNull();
  });

  it("ignores blank dates and de-duplicates repeated entries", () => {
    expect(countActualWorkdays(
      ["", "2026-08-31", "2026-08-31"],
      [null, "2026-08-31"],
    )).toBe(1);
  });
});