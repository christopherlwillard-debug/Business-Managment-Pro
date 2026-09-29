import { describe, expect, it } from "vitest";
import { countConfirmedHereWorkdays } from "./job-workdays.js";

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