import { describe, expect, it } from "vitest";
import {
  getJobCreationSteps,
  getJobWorkspaceSections,
} from "./jobBuilderNavigation";

describe("job builder navigation", () => {
  it("uses the selected work type to name the existing-details step", () => {
    expect(getJobCreationSteps("mh_production", "general_contracting")[0].label)
      .toBe("Home & production details");
    expect(getJobCreationSteps("mh_service", "general_contracting")[0].label)
      .toBe("Service job details");
    expect(getJobCreationSteps("general_contracting", "general_contracting")[0].label)
      .toBe("Project details");
    expect(getJobCreationSteps(null, "asphalt_sealing")[0].label)
      .toBe("Asphalt job details");
  });

  it("keeps optional scheduling and subcontractor assignment skippable", () => {
    const steps = getJobCreationSteps("general_contracting", "general_contracting");
    expect(steps.find(step => step.id === "schedule")).toMatchObject({
      label: "Schedule",
      optional: true,
    });
    expect(steps.find(step => step.id === "subcontractors")).toMatchObject({
      label: "Subcontractors",
      optional: true,
    });
    expect(steps.at(-1)).toMatchObject({ id: "review", label: "Review & create" });
  });

  it("groups all eight workspace areas without changing the three top-level tabs", () => {
    expect(getJobWorkspaceSections().map(section => section.id)).toEqual([
      "details",
      "schedule",
      "work",
      "subcontractors",
      "materials",
      "financials",
      "photos",
      "closeout",
    ]);
  });
});
