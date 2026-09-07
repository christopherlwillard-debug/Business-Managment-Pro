import { describe, expect, it } from "vitest";
import { canApplyJobResponse } from "./jobProfitRequests";

describe("canApplyJobResponse", () => {
  it("rejects a response from an earlier job after navigation", () => {
    expect(canApplyJobResponse(1, 2, 101, 202)).toBe(false);
    expect(canApplyJobResponse(1, 2, 202, 202)).toBe(false);
  });

  it("accepts the latest response for the current job", () => {
    expect(canApplyJobResponse(4, 4, 202, 202)).toBe(true);
  });
});