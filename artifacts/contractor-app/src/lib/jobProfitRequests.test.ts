import { describe, expect, it } from "vitest";
import {
  canApplyJobResponse,
  getSavedMileageReimbursement,
} from "./jobProfitRequests";
import type { JobProfitResponse } from "@workspace/api-client-react";

describe("canApplyJobResponse", () => {
  it("rejects a response from an earlier job after navigation", () => {
    expect(canApplyJobResponse(1, 2, 101, 202)).toBe(false);
    expect(canApplyJobResponse(1, 2, 202, 202)).toBe(false);
  });

  it("accepts the latest response for the current job", () => {
    expect(canApplyJobResponse(4, 4, 202, 202)).toBe(true);
  });
});

describe("getSavedMileageReimbursement", () => {
  it("normalizes a saved detail response object", () => {
    const reimbursement = {
      id: 7,
      amount: 125,
      estimatedAmount: 120,
      recipientType: "owner" as const,
      recipientName: "Business owner",
      recipientSubcontractorId: null,
      status: "owed" as const,
      paidAt: null,
      notes: "Drive reimbursement",
    };

    expect(getSavedMileageReimbursement({
      mileageReimbursement: reimbursement,
    } as JobProfitResponse)).toEqual(reimbursement);
  });

  it("does not treat the batch numeric compatibility value as an editable record", () => {
    expect(getSavedMileageReimbursement({
      mileageReimbursement: 125,
    } as JobProfitResponse)).toBeNull();
    expect(getSavedMileageReimbursement({
      mileageReimbursement: null,
    } as JobProfitResponse)).toBeNull();
  });
});