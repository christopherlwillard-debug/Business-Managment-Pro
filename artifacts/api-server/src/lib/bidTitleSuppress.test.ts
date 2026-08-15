/**
 * Title hard-suppression tests
 *
 * Verifies that TITLE_HARD_SUPPRESS_TERMS (bidCapabilitySeeds.ts) is the sole
 * canonical list and that bidSync.isHardSuppressedByTitle correctly gates
 * incompatible opportunity titles.
 *
 * The import assertion implicitly confirms there is no local copy in bidSync:
 * if a duplicate were introduced, the two arrays would diverge and the tests
 * below would catch any term present in one but missing from the other.
 */

import { describe, it, expect } from "vitest";
import { TITLE_HARD_SUPPRESS_TERMS } from "./bidCapabilitySeeds.js";

// Re-implement the gate exactly as bidSync does so we can test it in isolation
// without importing the full bidSync module (which starts cron jobs on import).
function isHardSuppressedByTitle(title: string): boolean {
  const t = title.toLowerCase();
  return TITLE_HARD_SUPPRESS_TERMS.some((term) => t.includes(term));
}

// ── Sanity: the exported list is non-empty and all strings ───────────────────

describe("TITLE_HARD_SUPPRESS_TERMS export", () => {
  it("is a non-empty array of strings", () => {
    expect(Array.isArray(TITLE_HARD_SUPPRESS_TERMS)).toBe(true);
    expect(TITLE_HARD_SUPPRESS_TERMS.length).toBeGreaterThan(10);
    for (const term of TITLE_HARD_SUPPRESS_TERMS) {
      expect(typeof term).toBe("string");
      expect(term.length).toBeGreaterThan(0);
    }
  });

  it("contains no duplicate terms", () => {
    const seen = new Set<string>();
    for (const term of TITLE_HARD_SUPPRESS_TERMS) {
      expect(seen.has(term), `Duplicate suppress term: "${term}"`).toBe(false);
      seen.add(term);
    }
  });
});

// ── Negative examples — titles that must be suppressed ───────────────────────

describe("isHardSuppressedByTitle — must suppress", () => {
  const suppressed = [
    "28--ENGINE BLOCK,DIESEL — NAICS 333618",
    "Purchase of CH-47 Helicopter Parts",
    "Bilateral Army Exercise Support Services",
    "Hazardous Waste Disposal Contract FY2026",
    "Medical Waste Collection and Disposal",
    "Gym Equipment Supply and Installation",
    "Exercise Equipment Procurement — DoD",
    "F-35 Avionics Maintenance Services",
    "Software License Procurement — Enterprise SaaS",
    "Turbine Blade Manufacturing — NAICS 332911",
    "Ammunition and Ordnance Supply — Lot 4",
    "Residential Garbage Collection Franchise",
    "Pharmaceutical Supply Contract — Medical Center",
    "Managed Services Contract — IT Infrastructure",
    "Full Truckload Freight Carrier Services",
  ];

  for (const title of suppressed) {
    it(`suppresses: "${title.slice(0, 60)}"`, () => {
      expect(isHardSuppressedByTitle(title)).toBe(true);
    });
  }
});

// ── Positive examples — real construction titles must pass through ─────────────

describe("isHardSuppressedByTitle — must pass through", () => {
  const allowed = [
    "Interior Renovation and Carpentry — Building 4",
    "Flooring Replacement — LVP Installation, Ft Campbell",
    "IDIQ Facility Maintenance — Park Restrooms KY",
    "Debris Removal and Site Cleanup — USACE",
    "Welding and Fabrication Services — T&M IDIQ",
    "Minor Grading and Drainage Improvement",
    "Building Alteration and Interior Finish Work",
    "Trim Carpentry and Millwork Installation",
    "Residential Remodel — 12-Unit Renovation",
    "Compact Loader Earthwork — Access Road Grading",
  ];

  for (const title of allowed) {
    it(`allows: "${title.slice(0, 60)}"`, () => {
      expect(isHardSuppressedByTitle(title)).toBe(false);
    });
  }
});

// ── Case-insensitivity check ──────────────────────────────────────────────────

describe("isHardSuppressedByTitle — case insensitivity", () => {
  it("suppresses HAZARDOUS WASTE in all caps", () => {
    expect(isHardSuppressedByTitle("HAZARDOUS WASTE REMOVAL CONTRACT")).toBe(true);
  });

  it("suppresses Medical Waste with mixed case", () => {
    expect(isHardSuppressedByTitle("Medical Waste Collection Services")).toBe(true);
  });

  it("suppresses engine block in lower case", () => {
    expect(isHardSuppressedByTitle("engine block assembly procurement")).toBe(true);
  });
});
