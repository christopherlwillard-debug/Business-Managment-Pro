import { describe, expect, it } from "vitest";
import { getSageHomeDocumentationReadiness, type SageHomeRequirementItem } from "./sagehomeDocumentation";

const item = (title: string, completed = false, completedAt: string | null = null): SageHomeRequirementItem => ({
  title, completed, completedAt, skipped: false,
});

describe("SageHome documentation readiness", () => {
  it("shows missing required work and paperwork while excluding recommended and inapplicable items", () => {
    const result = getSageHomeDocumentationReadiness([
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
    expect(getSageHomeDocumentationReadiness([additionalBefore], false).missingItems).toHaveLength(0);
    expect(getSageHomeDocumentationReadiness([additionalBefore], true).missingItems).toHaveLength(1);
  });

  it("tracks the 24-hour invoice deadline from installation completion", () => {
    const completedAt = "2026-11-16T09:00:00.000Z";
    const dueAt = "2026-11-17T09:00:00.000Z";
    const items = [
      item("Remove tools and debris and thoroughly clean the home", true, completedAt),
      item("Submit invoice to installers@sagehome.com within 24 hours after completion", true, dueAt),
    ];
    const onTime = getSageHomeDocumentationReadiness(items, false, Date.parse(dueAt));
    expect(onTime.invoiceWasLate).toBe(false);
    expect(onTime.invoiceIsOverdue).toBe(false);
    const late = getSageHomeDocumentationReadiness([
      items[0], { ...items[1], completedAt: "2026-11-17T09:00:01.000Z" },
    ], false, Date.parse("2026-11-18T09:00:00.000Z"));
    expect(late.invoiceWasLate).toBe(true);
    const overdue = getSageHomeDocumentationReadiness([
      items[0], { ...items[1], completed: false, completedAt: null },
    ], false, Date.parse("2026-11-17T09:00:01.000Z"));
    expect(overdue.invoiceIsOverdue).toBe(true);
  });
});
