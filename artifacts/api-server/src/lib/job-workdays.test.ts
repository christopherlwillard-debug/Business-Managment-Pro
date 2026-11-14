import { describe, expect, it } from "vitest";
import { calculateDaysOnSiteFromDateSpan, countConfirmedHereWorkdays, requiresManualDaysOnSite } from "./job-workdays.js";

describe("countConfirmedHereWorkdays", () => {
  it("counts distinct confirmed Here dates rather than the scheduled span", () => {
    const scheduledSpan = ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03"];

    expect(countConfirmedHereWorkdays([
      { date: "2026-08-31", state: "here", provenance: "confirmed" },
      { date: "2026-09-01", state: "here", provenance: "confirmed" },
      { date: "2026-09-02", state: "here", provenance: "confirmed" },
    ])).toBe(3);
    expect(scheduledSpan).toHaveLength(4);
  });

  it("deduplicates Here dates and ignores blank dates", () => {
    expect(countConfirmedHereWorkdays([
      { date: "2026-09-01", state: "here", provenance: "confirmed" },
      { date: "2026-09-01", state: "here", provenance: "confirmed" },
      { date: "", state: "here", provenance: "confirmed" },
      { date: "2026-09-02", state: "here", provenance: "confirmed" },
    ])).toBe(2);
  });

  it("does not count Not Here, unrecorded, or inferred presence", () => {
    expect(countConfirmedHereWorkdays([
      { date: "2026-09-01", state: "not_here", provenance: "confirmed" },
      { date: "2026-09-02", state: "unrecorded", provenance: "confirmed" },
      { date: "2026-09-03", state: "here", provenance: "inferred" },
    ])).toBeNull();
  });

  it("returns unavailable when there are no confirmed Here dates", () => {
    expect(countConfirmedHereWorkdays([])).toBeNull();
  });
});

describe("calculateDaysOnSiteFromDateSpan", () => {
  it("uses a complete date span when both dates are present", () => {
    expect(calculateDaysOnSiteFromDateSpan("2026-09-01", "2026-09-03")).toBe(3);
  });

  it("requires a manual value when either date is missing", () => {
    expect(calculateDaysOnSiteFromDateSpan(null, "2026-09-03")).toBeNull();
    expect(calculateDaysOnSiteFromDateSpan("2026-09-01", null)).toBeNull();
    expect(calculateDaysOnSiteFromDateSpan(null, null)).toBeNull();
  });
});

describe("requiresManualDaysOnSite", () => {
  it("requires a value only for new reviews without a complete date span", () => {
    expect(requiresManualDaysOnSite(null, null, false)).toBe(true);
    expect(requiresManualDaysOnSite(3, null, false)).toBe(false);
    expect(requiresManualDaysOnSite(null, 2, false)).toBe(false);
    expect(requiresManualDaysOnSite(null, null, true)).toBe(false);
  });
});