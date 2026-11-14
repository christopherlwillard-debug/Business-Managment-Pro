import { describe, expect, it } from "vitest";
import {
  getJobCreationSteps,
  getJobWorkspaceSections,
  isJobCreationStepVisible,
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

  it("keeps subcontractor assignment optional without a scheduling step", () => {
    const steps = getJobCreationSteps("general_contracting", "general_contracting");
    expect(steps.some(step => (step.id as string) === "schedule")).toBe(false);
    expect(steps.find(step => step.id === "subcontractors")).toMatchObject({
      label: "Subcontractors",
      optional: true,
    });
    expect(steps.at(-1)).toMatchObject({ id: "review", label: "Review & create" });
  });

  it("shows only the selected creation section while keeping edit forms intact", () => {
    expect(isJobCreationStepVisible(true, "customer", "customer")).toBe(true);
    expect(isJobCreationStepVisible(true, "customer", "details")).toBe(false);
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
