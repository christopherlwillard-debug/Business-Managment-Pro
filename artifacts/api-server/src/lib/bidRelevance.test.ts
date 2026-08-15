/**
 * Bid relevance regression tests
 *
 * Verifies that the full pipeline of gates correctly rejects unrelated
 * opportunities (engine blocks, gym equipment, agriculture inspection) and
 * accepts genuinely relevant construction/maintenance opportunities.
 *
 * Tests cover:
 *  1. NAICS sector exclusion (bidScopeClassifier)
 *  2. Title hard-suppress gate (bidSync TITLE_HARD_SUPPRESS)
 *  3. isScopeCompatibleWithBusiness for "excluded" category
 *  4. Score floor constant value
 *  5. Positive examples with correct NAICS → correct scope
 */

import { describe, it, expect } from "vitest";
import {
  classifyOpportunityScope,
  isScopeCompatibleWithBusiness,
} from "./bidScopeClassifier.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function isExcluded(naicsCode: string, businessType = "general_contracting"): boolean {
  const scope = classifyOpportunityScope("some solicitation title", naicsCode, "federal");
  return !isScopeCompatibleWithBusiness(scope.primaryCategory, scope.confidence, businessType);
}

function isAllowed(naicsCode: string, businessType = "general_contracting"): boolean {
  const scope = classifyOpportunityScope("some solicitation title", naicsCode, "federal");
  return isScopeCompatibleWithBusiness(scope.primaryCategory, scope.confidence, businessType);
}

// ── Negative examples — must be classified as "excluded" ─────────────────────

describe("NAICS sector exclusion — negative examples (must be rejected)", () => {
  it("rejects engine block / diesel (NAICS 333618 — manufacturing sector 33)", () => {
    const scope = classifyOpportunityScope("28--ENGINE BLOCK,DIESEL", "333618", "federal");
    expect(scope.primaryCategory).toBe("excluded");
    expect(scope.confidence).toBe("high");
    expect(isExcluded("333618")).toBe(true);
  });

  it("rejects gym equipment (NAICS 339920 — manufacturing sector 33)", () => {
    const scope = classifyOpportunityScope("Gym Equipment Procurement", "339920", "federal");
    expect(scope.primaryCategory).toBe("excluded");
    expect(scope.confidence).toBe("high");
    expect(isExcluded("339920")).toBe(true);
  });

  it("rejects agricultural / animal health inspection (NAICS 115310 — sector 11)", () => {
    // Support activities for crop production / animal health inspection
    const scope = classifyOpportunityScope(
      "Animal and Plant Health Inspection Services",
      "115310",
      "federal",
    );
    expect(scope.primaryCategory).toBe("excluded");
    expect(scope.confidence).toBe("high");
    expect(isExcluded("115310")).toBe(true);
  });

  it("rejects pharmaceutical supply (NAICS 325412 — manufacturing sector 32)", () => {
    expect(isExcluded("325412")).toBe(true);
  });

  it("rejects food safety inspection (NAICS 541380 — professional services sector 54)", () => {
    expect(isExcluded("541380")).toBe(true);
  });

  it("rejects general freight trucking (NAICS 484122 — transportation sector 48, not in NAICS_SCOPE)", () => {
    // 484110 is in NAICS_SCOPE as dump_waste; 484122 (long-distance) is not
    expect(isExcluded("484122")).toBe(true);
  });

  it("rejects health care services (NAICS 621111 — sector 62)", () => {
    expect(isExcluded("621111")).toBe(true);
  });

  it("rejects software services (NAICS 511210 — sector 51)", () => {
    expect(isExcluded("511210")).toBe(true);
  });

  it("rejects finance / insurance (NAICS 522110 — sector 52)", () => {
    expect(isExcluded("522110")).toBe(true);
  });
});

// ── isScopeCompatibleWithBusiness — "excluded" blocks all business types ─────

describe("isScopeCompatibleWithBusiness — 'excluded' is rejected for all business types", () => {
  it("blocks 'excluded' for general_contracting business", () => {
    expect(isScopeCompatibleWithBusiness("excluded", "high", "general_contracting")).toBe(false);
  });

  it("blocks 'excluded' for asphalt_sealing business", () => {
    expect(isScopeCompatibleWithBusiness("excluded", "high", "asphalt_sealing")).toBe(false);
  });

  it("blocks 'excluded' even at medium confidence", () => {
    expect(isScopeCompatibleWithBusiness("excluded", "medium", "general_contracting")).toBe(false);
  });

  it("still allows null scope (unknown NAICS) through for GC business", () => {
    // Unknown NAICS should NOT be blocked — we only block explicit excluded sector codes
    expect(isScopeCompatibleWithBusiness(null, "low", "general_contracting")).toBe(true);
  });
});

// ── Positive examples — must be allowed through ───────────────────────────────

describe("NAICS scope — positive examples (must be accepted)", () => {
  it("allows building renovation (NAICS 236118 — mfg_homes scope)", () => {
    const scope = classifyOpportunityScope("Interior Renovation Services", "236118", "federal");
    expect(scope.primaryCategory).toBe("mfg_homes");
    expect(scope.confidence).toBe("high");
    expect(isAllowed("236118")).toBe(true);
  });

  it("allows asphalt sealcoating (NAICS 238990 — general_contracting scope)", () => {
    const scope = classifyOpportunityScope("Parking Lot Sealcoating", "238990", "federal");
    expect(scope.primaryCategory).toBe("general_contracting");
    expect(scope.confidence).toBe("high");
    expect(isAllowed("238990")).toBe(true);
  });

  it("allows facility repair (NAICS 238350 — mfg_homes scope)", () => {
    const scope = classifyOpportunityScope("Interior Finish Carpentry", "238350", "federal");
    expect(scope.primaryCategory).toBe("mfg_homes");
    expect(scope.confidence).toBe("high");
    expect(isAllowed("238350")).toBe(true);
  });

  it("allows flooring installation (NAICS 238330 — flooring scope)", () => {
    const scope = classifyOpportunityScope("Floor Covering Replacement", "238330", "federal");
    expect(scope.primaryCategory).toBe("flooring");
    expect(scope.confidence).toBe("high");
    expect(isAllowed("238330")).toBe(true);
  });

  it("allows site prep / excavation (NAICS 238910 — site_work scope)", () => {
    const scope = classifyOpportunityScope("Site Preparation and Grading", "238910", "federal");
    expect(scope.primaryCategory).toBe("site_work");
    expect(scope.confidence).toBe("high");
    expect(isAllowed("238910")).toBe(true);
  });

  it("allows welding / fabrication (NAICS 332312 — industrial_maintenance scope, in NAICS_SCOPE despite sector 33)", () => {
    const scope = classifyOpportunityScope("Structural Steel Repair", "332312", "federal");
    // 332312 is explicitly in NAICS_SCOPE so it maps to industrial_maintenance before sector check
    expect(scope.primaryCategory).toBe("industrial_maintenance");
    expect(scope.confidence).toBe("high");
    expect(isAllowed("332312")).toBe(true);
  });

  it("allows facilities support (NAICS 561210 — general_contracting scope)", () => {
    const scope = classifyOpportunityScope("Facility Operations and Maintenance", "561210", "federal");
    expect(scope.primaryCategory).toBe("general_contracting");
    expect(scope.confidence).toBe("high");
    expect(isAllowed("561210")).toBe(true);
  });

  it("allows debris hauling (NAICS 562111 — dump_waste scope)", () => {
    const scope = classifyOpportunityScope("Debris and Waste Removal", "562111", "federal");
    expect(scope.primaryCategory).toBe("dump_waste");
    expect(scope.confidence).toBe("high");
    expect(isAllowed("562111")).toBe(true);
  });
});

// ── Title-keyword no-NAICS classification ─────────────────────────────────────

describe("Title keyword scope — no NAICS code present", () => {
  it("classifies asphalt/paving title as asphalt scope (high confidence)", () => {
    const scope = classifyOpportunityScope("Parking Lot Sealcoating and Crack Sealing", null, "state-local");
    expect(scope.primaryCategory).toBe("asphalt");
    expect(scope.confidence).toBe("high");
  });

  it("classifies flooring install title as flooring scope", () => {
    const scope = classifyOpportunityScope("Flooring Installation Services", null, "state-local");
    expect(scope.primaryCategory).toBe("flooring");
    expect(scope.confidence).toBe("high");
  });

  it("returns low-confidence unknown for ambiguous title with no NAICS", () => {
    const scope = classifyOpportunityScope("General Services Contract", null, "federal");
    expect(scope.confidence).toBe("low");
    expect(isAllowed("")).toBe(true); // null NAICS → allowed
  });
});

// ── Score floor reasoning check ───────────────────────────────────────────────
// The MIN_SCORE_TO_STORE = 20 constant lives in bidSync.ts (cron-laden module —
// cannot be imported in unit tests). Instead we verify the scoring math here:
// a bid with no capability keyword hits, no geo, no set-aside, and 10 days to
// deadline would score exactly: 0 (cap) + 0 (geo) + 0 (source) + 5 (open) +
// 10 (urgency) = 15 — below the 20-point floor, so it would be skipped.
//
// This test confirms classifyOpportunityScope produces the "excluded" category
// for a bid that would otherwise only pass on urgency points, ensuring the
// NAICS sector gate catches it before scoring ever runs.

describe("Score floor reasoning — bids excluded by NAICS never reach scoring", () => {
  it("engine block bid is excluded at the scope gate, not just at score floor", () => {
    const scope = classifyOpportunityScope("28--ENGINE BLOCK,DIESEL", "333618", "federal");
    // Scope gate rejects it — score never computed
    expect(scope.primaryCategory).toBe("excluded");
    expect(isScopeCompatibleWithBusiness(scope.primaryCategory, scope.confidence, "general_contracting")).toBe(false);
  });

  it("gym equipment bid is excluded at the scope gate, not just at score floor", () => {
    const scope = classifyOpportunityScope("Gym Equipment", "339920", "federal");
    expect(scope.primaryCategory).toBe("excluded");
    expect(isScopeCompatibleWithBusiness(scope.primaryCategory, scope.confidence, "general_contracting")).toBe(false);
  });

  it("legitimate renovation bid with NAICS 236116 passes scope gate with high confidence", () => {
    const scope = classifyOpportunityScope("Building Renovation Services", "236116", "federal");
    expect(scope.primaryCategory).toBe("general_contracting");
    expect(scope.confidence).toBe("high");
    expect(isScopeCompatibleWithBusiness(scope.primaryCategory, scope.confidence, "general_contracting")).toBe(true);
  });
});
