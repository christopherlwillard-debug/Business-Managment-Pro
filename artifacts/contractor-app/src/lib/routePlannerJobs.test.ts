import { describe, expect, it } from "vitest";
import { findRoutePlannerJob } from "./routePlannerJobs";

const jobs = [
  { id: 1, businessLine: "general_contracting", title: "Manufactured home" },
  { id: 2, businessLine: "asphalt_sealing", title: "Driveway sealcoat" },
];

describe("Route Planner active-business job links", () => {
  it("returns a directly linked job from the active business", () => {
    expect(findRoutePlannerJob(2, jobs, "asphalt_sealing")).toBe(jobs[1]);
  });

  it("does not display a directly linked job from another business", () => {
    expect(findRoutePlannerJob(1, jobs, "asphalt_sealing")).toBeUndefined();
  });

  it("preserves all-business behavior when no business is selected", () => {
    expect(findRoutePlannerJob(1, jobs, null)).toBe(jobs[0]);
  });

  it("returns undefined for an absent or unlinked job", () => {
    expect(findRoutePlannerJob(99, jobs, "asphalt_sealing")).toBeUndefined();
    expect(findRoutePlannerJob(null, jobs, "asphalt_sealing")).toBeUndefined();
  });
});
