import { describe, expect, it } from "vitest";
import { computeRecommendation } from "./bidRecommendation.js";

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

  it("can still recommend BID for a reviewed full-and-open opportunity", () => {
    const result = computeRecommendation(
      opportunity("NONE"),
      { isSdvosb: true, isVosb: true, isSmallBusiness: true },
      reviewedFit,
    );
    expect(result.recommendation).toBe("bid");
  });
});
