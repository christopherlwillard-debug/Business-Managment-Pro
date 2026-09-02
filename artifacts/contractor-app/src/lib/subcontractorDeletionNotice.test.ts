import { describe, expect, it } from "vitest";
import { buildReimbursementReassignmentNotice } from "./subcontractorDeletionNotice";

describe("subcontractor deletion reimbursement notice", () => {
  it("lists every affected job, including the fallback for an untitled job", () => {
    expect(buildReimbursementReassignmentNotice([
      { jobId: 41, jobTitle: "Oak Street Remodel" },
      { jobId: 52, jobTitle: "Riverfront Flooring" },
      { jobId: 63, jobTitle: null },
    ])).toEqual({
      title: "Subcontractor deleted",
      description: "Mileage reimbursement reassigned to the business owner for: Oak Street Remodel, Riverfront Flooring, Job #63.",
    });
  });

  it("does not create a reassignment notice when no reimbursements moved", () => {
    expect(buildReimbursementReassignmentNotice([])).toBeNull();
  });
});