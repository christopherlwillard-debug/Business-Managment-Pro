import { describe, expect, it } from "vitest";
import { computeRecommendation } from "./bidRecommendation.js";
import { setAsideScore } from "./bidScoring.js";

const opportunity = (setAsideType: string | null) => ({
  title: "Asphalt sealcoating services",
  opportunityScore: 90,
  capabilityMatches: ["asphalt_sealing"],
  setAsideType,
  responseDeadline: "2099-12-31",
  source: "sam-gov",
  naicsCode: "237310",
  description: "Provide asphalt sealcoating services.",
  opportunityType: "solicitation",
});

const reviewedFit = { isFit: true, fitReason: "Scope and equipment appear aligned." };

describe("bid recommendation certification safeguards", () => {
  it("never recommends BID for an SDVOSB set-aside from a profile flag alone", () => {
    const result = computeRecommendation(
      opportunity("SDVOSB"),
      { isSdvosb: true, isVosb: true, isSmallBusiness: true },
      reviewedFit,
    );

    expect(result.recommendation).toBe("review");
    expect(result.factors.find((factor) => factor.key === "set_aside")?.signal).toBe("neutral");
    expect(result.unknowns).toContain(
      "Verify current certification/size status, SAM.gov representations, and solicitation-specific eligibility before bidding",
    );
  });

  it("never recommends BID for a VOSB or small-business set-aside without verification", () => {
    for (const setAsideType of ["VOSB", "SBA"]) {
      const result = computeRecommendation(
        opportunity(setAsideType),
        { isSdvosb: true, isVosb: true, isSmallBusiness: true },
        reviewedFit,
      );
      expect(result.recommendation).toBe("review");
    }
  });

  it("recognizes HUBZone and 8(a) flags but never treats them as verified certification", () => {
    for (const [setAsideType, settings, expectedLabel] of [
      ["HZC", { isSdvosb: false, isVosb: false, isSmallBusiness: true, isHubzone: true }, "HUBZone"],
      ["HZS", { isSdvosb: false, isVosb: false, isSmallBusiness: true, isHubzone: false }, "HUBZone"],
      ["8A", { isSdvosb: false, isVosb: false, isSmallBusiness: true, is8a: true }, "8(a)"],
      ["8AN", { isSdvosb: false, isVosb: false, isSmallBusiness: true, is8a: false }, "8(a)"],
    ] as const) {
      const result = computeRecommendation(opportunity(setAsideType), settings, reviewedFit);
      expect(result.recommendation).toBe("review");
      expect(result.factors.find((factor) => factor.key === "set_aside")?.detail).toContain(expectedLabel);
    }
  });

  it("keeps unknown set-aside codes in REVIEW instead of issuing a BID", () => {
    const result = computeRecommendation(
      opportunity("UNRECOGNIZED_FUTURE_CODE"),
      { isSdvosb: false, isVosb: false, isSmallBusiness: true },
      reviewedFit,
    );
    expect(result.recommendation).toBe("review");
  });

  it("can still recommend BID for a reviewed full-and-open opportunity", () => {
    const result = computeRecommendation(
      opportunity("NONE"),
      { isSdvosb: true, isVosb: true, isSmallBusiness: true },
      reviewedFit,
    );
    expect(result.recommendation).toBe("bid");
  });
});

describe("set-aside scoring safeguards", () => {
  it("does not award restricted-set-aside points from profile booleans alone", () => {
    const marked = { isSdvosb: true, isVosb: true, isSmallBusiness: true };
    expect(setAsideScore("sdvosb", marked)).toBe(0);
    expect(setAsideScore("vosb", marked)).toBe(0);
    expect(setAsideScore("small_business", marked)).toBe(0);
  });

  it("does not infer veteran preference eligibility from profile booleans", () => {
    expect(setAsideScore("veteran_preference", {
      isSdvosb: true, isVosb: true, isSmallBusiness: true,
    })).toBe(3);
    expect(setAsideScore("veteran_preference", {
      isSdvosb: false, isVosb: false, isSmallBusiness: true,
    })).toBe(3);
  });

  it("retains the baseline full-and-open score", () => {
    expect(setAsideScore("open", {
      isSdvosb: true, isVosb: true, isSmallBusiness: true,
    })).toBe(5);
  });
});
