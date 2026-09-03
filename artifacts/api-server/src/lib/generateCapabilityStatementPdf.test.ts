import { describe, expect, it } from "vitest";
import {
  applyCapabilityStatementSelection,
  capabilitySectionMode,
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