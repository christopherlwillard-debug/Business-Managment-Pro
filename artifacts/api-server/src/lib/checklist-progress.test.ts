import { describe, expect, it } from "vitest";
import { calculateChecklistProgress } from "./checklist-progress.js";

describe("calculateChecklistProgress", () => {
  it("weights a split item fractionally instead of treating it as incomplete", () => {
    const progress = calculateChecklistProgress(
      [{ id: 1, completed: false, skipped: false }, { id: 2, completed: true, skipped: false }],
      [{ jobChecklistItemId: 1, completed: true }, { jobChecklistItemId: 1, completed: false }],
    );
    expect(progress).toEqual({ totalItems: 2, completedItems: 1, weightedComplete: 1.5, overallPercent: 75 });
  });

  it("excludes skipped items and their parts", () => {
    expect(calculateChecklistProgress(
      [{ id: 1, completed: false, skipped: true }, { id: 2, completed: true, skipped: false }],
      [{ jobChecklistItemId: 1, completed: false }, { jobChecklistItemId: 1, completed: false }],
    ).overallPercent).toBe(100);
  });
});