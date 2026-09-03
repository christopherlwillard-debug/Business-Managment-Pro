import { describe, expect, it } from "vitest";
import {
  applyCapabilityStatementSelection,
  capabilitySectionMode,
  isCapabilityStatementCertificationEligible,
  isCapabilityStatementProjectEligible,
} from "./generateCapabilityStatementPdf.js";

const capabilityProfiles = [
  { id: 1, name: "Asphalt Sealing" },
  { id: 2, name: "Manufactured Housing" },
  { id: 3, name: "Industrial Maintenance" },
];

const pastProjects = [
  { id: 10, title: "Municipal Lot" },
  { id: 11, title: "Plant Repair" },
  { id: 12, title: "Housing Setup" },
];

describe("applyCapabilityStatementSelection", () => {
  it("keeps the existing all-content behavior when no selection is supplied", () => {
    expect(applyCapabilityStatementSelection(capabilityProfiles, pastProjects)).toEqual({
      capabilityProfiles,
      pastProjects,
    });
  });

  it("includes only the requested capability profiles and completed projects", () => {
    expect(applyCapabilityStatementSelection(capabilityProfiles, pastProjects, {
      capabilityProfileIds: [3, 1],
      pastProjectIds: [11],
    })).toEqual({
      capabilityProfiles: [capabilityProfiles[0], capabilityProfiles[2]],
      pastProjects: [pastProjects[1]],
    });
  });

  it("supports intentionally omitting either section without changing source records", () => {
    const result = applyCapabilityStatementSelection(capabilityProfiles, pastProjects, {
      capabilityProfileIds: [],
      pastProjectIds: [],
    });

    expect(result).toEqual({ capabilityProfiles: [], pastProjects: [] });
    expect(capabilityProfiles).toHaveLength(3);
    expect(pastProjects).toHaveLength(3);
  });

  it("ignores IDs that do not belong to the server-scoped eligible records", () => {
    expect(applyCapabilityStatementSelection(capabilityProfiles, pastProjects, {
      capabilityProfileIds: [999],
      pastProjectIds: [888],
    })).toEqual({ capabilityProfiles: [], pastProjects: [] });
  });
});

describe("capabilitySectionMode", () => {
  it("renders selected capabilities", () => {
    expect(capabilitySectionMode(2, { capabilityProfileIds: [1, 2] })).toBe("content");
  });

  it("keeps the legacy placeholder when no selection was supplied", () => {
    expect(capabilitySectionMode(0)).toBe("placeholder");
  });

  it("omits the section when the user explicitly selects no capabilities", () => {
    expect(capabilitySectionMode(0, { capabilityProfileIds: [] })).toBe("omit");
  });
});

describe("isCapabilityStatementCertificationEligible", () => {
  const today = "2026-09-03";
  const base = {
    crewBusinessId: 7,
    crewActive: true,
    expiresAt: null,
  };

  it.each([
    ["active", "active", null, true],
    ["expiring", "expiring_soon", "2026-09-10", true],
    ["active with a past expiration date", "active", "2026-09-02", false],
    ["expired status without an expiration date", "expired", null, false],
    ["expired status with a future expiration date", "expired", "2026-09-10", false],
    ["expiring status with a past expiration date", "expiring_soon", "2026-09-02", false],
    ["unknown", "unknown", null, false],
  ])("%s certification eligibility is enforced", (_label, status, expiresAt, expected) => {
    expect(isCapabilityStatementCertificationEligible(
      { ...base, status, expiresAt },
      7,
      today,
    )).toBe(expected);
  });

  it("excludes certifications belonging to another business or inactive crew", () => {
    expect(isCapabilityStatementCertificationEligible(
      { ...base, status: "active", crewBusinessId: 8 },
      7,
      today,
    )).toBe(false);
    expect(isCapabilityStatementCertificationEligible(
      { ...base, status: "active", crewActive: false },
      7,
      today,
    )).toBe(false);
  });
});

describe("isCapabilityStatementProjectEligible", () => {
  it("allows canonically owned completed projects", () => {
    expect(isCapabilityStatementProjectEligible(
      { businessId: 7, businessLine: "other-slug", status: "completed" },
      7,
      "target-slug",
    )).toBe(true);
  });

  it("allows a matching legacy slug only when canonical ownership is missing", () => {
    expect(isCapabilityStatementProjectEligible(
      { businessId: null, businessLine: "target-slug", status: "closed" },
      7,
      "target-slug",
    )).toBe(true);
  });

  it("never lets a matching legacy slug override another business owner", () => {
    expect(isCapabilityStatementProjectEligible(
      { businessId: 8, businessLine: "target-slug", status: "invoiced" },
      7,
      "target-slug",
    )).toBe(false);
  });

  it("excludes unfinished projects", () => {
    expect(isCapabilityStatementProjectEligible(
      { businessId: 7, businessLine: "target-slug", status: "scheduled" },
      7,
      "target-slug",
    )).toBe(false);
  });
});