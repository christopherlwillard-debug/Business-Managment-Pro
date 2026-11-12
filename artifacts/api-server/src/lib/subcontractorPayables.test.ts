import { describe, expect, it } from "vitest";
import { groupSubcontractorPayables, resolveSubcontractorBalance } from "./subcontractorPayables.js";

describe("resolveSubcontractorBalance", () => {
  it("subtracts the greater of the cached and ledger payments", () => {
    expect(resolveSubcontractorBalance({
      totalOwed: 400,
      amountPaid: 100,
      ledgerPaid: 150,
      paymentStatus: "partial",
      unknownReason: "Unavailable",
    })).toMatchObject({
      paid: 150,
      remainingAmount: 250,
      balanceStatus: "known",
      outstanding: true,
    });
  });

  it("keeps an unknown amount outstanding instead of treating it as zero", () => {
    expect(resolveSubcontractorBalance({
      totalOwed: null,
      amountPaid: 0,
      ledgerPaid: 0,
      paymentStatus: "unpaid",
      unknownReason: "Allocation amount is unavailable.",
    })).toMatchObject({
      remainingAmount: null,
      balanceStatus: "unknown",
      balanceReason: "Allocation amount is unavailable.",
      outstanding: true,
    });
  });

  it("does not treat a zero-dollar calculation without payment evidence as settled", () => {
    for (const paymentStatus of ["unpaid", "paid"]) {
      expect(resolveSubcontractorBalance({
        totalOwed: 0,
        amountPaid: 0,
        ledgerPaid: 0,
        paymentStatus,
        unknownReason: "Unavailable",
      })).toMatchObject({
        remainingAmount: null,
        balanceStatus: "unknown",
        outstanding: true,
      });
    }
  });

  it("preserves a ledger-backed legacy paid confirmation", () => {
    expect(resolveSubcontractorBalance({
      totalOwed: 900,
      amountPaid: 250,
      ledgerPaid: 250,
      paymentStatus: "paid",
      unknownReason: "Unavailable",
    })).toMatchObject({ remainingAmount: 0, outstanding: false });
  });

  it("settles a fully covered known balance", () => {
    expect(resolveSubcontractorBalance({
      totalOwed: 400,
      amountPaid: 400,
      ledgerPaid: 400,
      paymentStatus: "paid",
      unknownReason: "Unavailable",
    })).toMatchObject({ remainingAmount: 0, outstanding: false });
  });

  it("groups by subcontractor id and marks totals incomplete for unknown jobs", () => {
    const groups = groupSubcontractorPayables([
      {
        subcontractorId: 4,
        subName: "Alex",
        jobId: 10,
        jobTitle: "Job A",
        compensationType: "fixed",
        amount: 200,
        balanceStatus: "known" as const,
        balanceReason: null,
        paymentStatus: "unpaid",
        businessLine: "general_contracting",
      },
      {
        subcontractorId: 4,
        subName: "Alex",
        jobId: 11,
        jobTitle: "Job B",
        compensationType: "allocation",
        amount: null,
        balanceStatus: "unknown" as const,
        balanceReason: "Allocation amount is unavailable.",
        paymentStatus: "unpaid",
        businessLine: "general_contracting",
      },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      subcontractorId: 4,
      knownTotal: 200,
      unresolvedCount: 1,
      isComplete: false,
      jobCount: 2,
    });
  });
});
