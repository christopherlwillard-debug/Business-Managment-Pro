import { describe, expect, it } from "vitest";
import { getContractDocumentationReadiness, type ContractRequirementItem } from "./contractDocumentation";

const item = (title: string, completed = false, completedAt: string | null = null): ContractRequirementItem => ({
  title, completed, completedAt, skipped: false,
});

describe("contract documentation readiness", () => {
  it("shows missing required work and paperwork while excluding recommended and inapplicable items", () => {
    const result = getContractDocumentationReadiness([
      item("Install photo", false),
      item("Photograph pre-existing damage (highly recommended; optional)", false),
      item("Conditional additional-work: before photo", false),
      item("Upload signed-off homeowner paperwork", false),
      item("Staff-confirm all job photos uploaded to Lead Perfection before invoice submission", false),
      item("Submit invoice to installers@sagehome.com within 24 hours after completion", false),
    ], false);

    expect(result.missingItems.map(row => row.title)).toEqual([
      "Install photo",
      "Upload signed-off homeowner paperwork",
      "Staff-confirm all job photos uploaded to Lead Perfection before invoice submission",
      "Submit invoice to installers@sagehome.com within 24 hours after completion",
    ]);
    expect(result.readinessMissing).toHaveLength(3);
    expect(result.homeownerPaperworkPending).toBe(1);
    expect(result.externalSubmissionPending).toBe(2);
    expect(result.invoiceDueAt).toBeNull();
  });

  it("requires conditional before/after evidence only when additional work occurred", () => {
    const additionalBefore = item("Conditional additional-work: before photo");
    expect(getContractDocumentationReadiness([additionalBefore], false).missingItems).toHaveLength(0);
    expect(getContractDocumentationReadiness([additionalBefore], true).missingItems).toHaveLength(1);
  });

  it("tracks the 24-hour invoice deadline from installation completion", () => {
    const completedAt = "2026-11-16T09:00:00.000Z";
    const dueAt = "2026-11-17T09:00:00.000Z";
    const items = [
      item("Remove tools and debris and thoroughly clean the home", true, completedAt),
      item("Submit invoice to installers@sagehome.com within 24 hours after completion", true, dueAt),
    ];
    const onTime = getContractDocumentationReadiness(items, false, Date.parse(dueAt));
    expect(onTime.invoiceWasLate).toBe(false);
    expect(onTime.invoiceIsOverdue).toBe(false);
    const late = getContractDocumentationReadiness([
      items[0], { ...items[1], completedAt: "2026-11-17T09:00:01.000Z" },
    ], false, Date.parse("2026-11-18T09:00:00.000Z"));
    expect(late.invoiceWasLate).toBe(true);
    const overdue = getContractDocumentationReadiness([
      items[0], { ...items[1], completed: false, completedAt: null },
    ], false, Date.parse("2026-11-17T09:00:01.000Z"));
    expect(overdue.invoiceIsOverdue).toBe(true);
  });

  it("applies requirement metadata, conditional photos, paperwork, and configured deadlines", () => {
    const fixture: ContractRequirementItem[] = [
      { ...item("Pre-existing damage photo"), requirementKey: "damage", requirementStatus: "recommended" },
      { ...item("Required installation photo"), requirementKey: "photo", requirementStatus: "required" },
      { ...item("Extra-work before photo"), requirementKey: "extra_before", requirementStatus: "conditional", conditionKey: "additional_work" },
      { ...item("Signed homeowner paperwork"), requirementKey: "homeowner_signed_paperwork", requirementStatus: "required" },
      { ...item("Referral form"), requirementKey: "referral_form", requirementStatus: "required" },
      { ...item("Lead Perfection upload"), requirementKey: "lead_perfection_upload", requirementStatus: "required" },
      { ...item("Installation complete", true, "2026-11-16T09:00:00.000Z"), requirementKey: "installation_cleanup_complete", requirementStatus: "required" },
      { ...item("Invoice submission"), requirementKey: "invoice_submission", requirementStatus: "required" },
    ];
    const beforeExtraWork = getContractDocumentationReadiness(fixture, false, Date.parse("2026-11-16T20:00:00Z"), 12);
    expect(beforeExtraWork.missingItems.map(row => row.requirementKey)).not.toContain("damage");
    expect(beforeExtraWork.missingItems.map(row => row.requirementKey)).not.toContain("extra_before");
    expect(beforeExtraWork.homeownerPaperworkPending).toBe(2);
    expect(beforeExtraWork.externalSubmissionPending).toBe(2);
    expect(beforeExtraWork.invoiceDueAt?.toISOString()).toBe("2026-11-16T21:00:00.000Z");
    expect(getContractDocumentationReadiness(fixture, true).missingItems.map(row => row.requirementKey))
      .toContain("extra_before");
  });

  it("keeps unannotated checklist items required for ordinary jobs", () => {
    const result = getContractDocumentationReadiness([item("Ordinary job checklist item")], false);
    expect(result.missingItems.map(row => row.title)).toEqual(["Ordinary job checklist item"]);
    expect(result.invoiceDueAt).toBeNull();
  });
});
