import { describe, expect, it } from "vitest";
import { createPlannerEntries } from "./JobsPlanner";
import type { ScheduleJob } from "@/pages/Jobs";

describe("JobsPlanner production event projection", () => {
  it("projects each server-provided planned occurrence as a distinct calendar entry", () => {
    const job = {
      id: 7,
      title: "Clayton home",
      checklistItems: [{
        id: 1,
        title: "Confirm access",
        completed: false,
        skipped: false,
        scheduledDate: "2026-09-04",
        assignedSubcontractorId: null,
        assignedSubcontractorName: null,
        sectionName: "Prep",
      }],
      productionPlanItems: [{
        occurrenceKey: "production-7-interior-2026-09-03",
        componentInstanceKey: "interior",
        componentLabel: "Interior Finish",
        componentKey: "interior_finish",
        variant: "vog",
        status: "in_progress",
        expectedDurationDays: 2,
        plannedDate: "2026-09-03",
        plannedStartDate: "2026-09-03",
        plannedEndDate: "2026-09-04",
        isOverflow: false,
      }, {
        occurrenceKey: "production-7-interior-2026-09-04",
        componentInstanceKey: "interior",
        componentLabel: "Interior Finish",
        componentKey: "interior_finish",
        variant: "vog",
        status: "in_progress",
        expectedDurationDays: 2,
        plannedDate: "2026-09-04",
        plannedStartDate: "2026-09-03",
        plannedEndDate: "2026-09-04",
        isOverflow: false,
      }],
    } as unknown as ScheduleJob;

    const entries = createPlannerEntries([job]);

    expect(entries.filter(entry => entry.productionItem).map(entry => [
      entry.key,
      entry.startDate,
      entry.productionItem?.componentLabel,
    ])).toEqual([
      ["production-7-interior-2026-09-03", "2026-09-03", "Interior Finish"],
      ["production-7-interior-2026-09-04", "2026-09-04", "Interior Finish"],
    ]);
    expect(entries.filter(entry => entry.item)).toHaveLength(1);
  });
});