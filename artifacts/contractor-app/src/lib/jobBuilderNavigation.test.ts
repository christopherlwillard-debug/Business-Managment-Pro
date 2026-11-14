import { describe, expect, it } from "vitest";
import {
  getJobWorkspaceSections,
  isJobCreationStepVisible,
} from "./jobBuilderNavigation";

describe("job builder navigation", () => {
  it("keeps all creation sections available together, including optional sections", () => {
    expect(isJobCreationStepVisible(true, "customer", "customer")).toBe(true);
    expect(isJobCreationStepVisible(true, "customer", "details")).toBe(true);
    expect(isJobCreationStepVisible(true, "customer", "subcontractors")).toBe(true);
    expect(isJobCreationStepVisible(false, "customer", "details")).toBe(true);
  });

  it("groups retained workspace areas without a scheduling section", () => {
    expect(getJobWorkspaceSections().map(section => section.id)).toEqual([
      "details",
      "work",
      "subcontractors",
      "materials",
      "financials",
      "photos",
      "closeout",
    ]);
  });
});
