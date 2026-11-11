import { describe, expect, it } from "vitest";
import { reportBusinessContains, type ReportBusiness } from "./reports";

const willards: ReportBusiness = {
  id: 1,
  slug: "general_contracting",
  businessIds: [1, 2],
  businessSlugs: ["general_contracting", "asphalt_sealing"],
  divisionSlugs: ["general_contracting", "asphalt_sealing"],
  divisionBusinessIds: {
    general_contracting: [1],
    asphalt_sealing: [2],
  },
  divisionSlug: null,
};

describe("legal business report scope", () => {
  it("combines both Willard divisions without including Kinora", () => {
    expect(reportBusinessContains({ businessId: 1 }, willards)).toBe(true);
    expect(reportBusinessContains({ businessId: 2 }, willards)).toBe(true);
    expect(reportBusinessContains({ businessId: null, businessLine: "asphalt_sealing" }, willards)).toBe(true);
    expect(reportBusinessContains({ businessId: 6, businessLine: "kinora" }, willards)).toBe(false);
    expect(reportBusinessContains({ businessId: null, businessLine: "kinora" }, willards)).toBe(false);
  });

  it("keeps Asphalt division totals isolated from General Contracting", () => {
    const asphalt = { ...willards, divisionSlug: "asphalt_sealing" };
    expect(reportBusinessContains({ businessId: 1, businessLine: "asphalt_sealing" }, asphalt)).toBe(true);
    expect(reportBusinessContains({ businessId: 2 }, asphalt)).toBe(true);
    expect(reportBusinessContains({ businessId: null, businessLine: "asphalt_sealing" }, asphalt)).toBe(true);
    expect(reportBusinessContains({ businessId: 1, businessLine: "general_contracting" }, asphalt)).toBe(false);
    expect(reportBusinessContains({ businessId: 2, businessLine: "kinora" }, asphalt)).toBe(false);
    expect(reportBusinessContains({ businessId: null, businessLine: "general_contracting" }, asphalt)).toBe(false);
  });
});
