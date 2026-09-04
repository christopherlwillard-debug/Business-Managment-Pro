import { describe, expect, it } from "vitest";
import { getWeekToDateStart } from "./dashboard-period";

describe("getWeekToDateStart", () => {
  it("starts on Monday when the current week crosses a month boundary", () => {
    expect(getWeekToDateStart(new Date("2026-09-04T01:22:32.230Z"))).toBe("2026-08-31");
  });

  it("keeps Monday as the start when today is Monday", () => {
    expect(getWeekToDateStart(new Date("2026-08-31T12:00:00.000Z"))).toBe("2026-08-31");
  });

  it("starts on the immediately preceding Monday for Sunday", () => {
    expect(getWeekToDateStart(new Date("2026-09-06T12:00:00.000Z"))).toBe("2026-08-31");
  });
});